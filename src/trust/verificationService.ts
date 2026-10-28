import {TrustError,CAUTION,statement,metadata,shortText} from './types.ts';
import {normalizeTrustUrl,classifyTrustTier} from './domainPolicy.ts';
import {sha256,stableJSON,canonicalValue} from './fingerprint.ts';
import {detectConflicts} from './conflictDetector.ts';
import {computeSourceScore,campaignConfidence,summarizeFields} from './trustScoreService.ts';
import {fetchTrustSource} from './sourceFetcher.ts';
import {metric} from '../admin/metrics.ts';
const TTL=21600;
const sql=statement;
const json=v=>{try{return JSON.parse(v||'{}');}catch{return {};}};
function stamp(){return new Date().toISOString();}
async function audit(db,actor,action,type,id,oldValue='',newValue='',reason=''){
 await sql(db,'INSERT INTO trust_audit_log(id,actor,action,target_type,target_id,previous_state,new_state,reason) VALUES(?,?,?,?,?,?,?,?)',
 crypto.randomUUID(),actor,action,type,id,String(oldValue).slice(0,800),String(newValue).slice(0,800),shortText(reason,300)).run();
}
async function verifiedHosts(db,campaignId,links){
 const rows=await sql(db,'SELECT host FROM am_domains WHERE project_id=? AND reviewed_by<>? LIMIT 50',campaignId,'').all();
 const known=(rows.results||[]).map(x=>x.host.toLowerCase());
 const declared=links.filter(l=>l.official_domain_verified===1).map(l=>new URL(l.source_url).hostname);
 return [...new Set([...known,...declared])];
}
function rank(label){return {high_confidence:3,medium_confidence:2,low_confidence:1,needs_review:0}[label]||0;}
function changedFields(oldFields,newFields,sources){
 const changed=[];if(!oldFields)return changed;
 for(const field of ['claim_opens_at','claim_deadline_at','snapshot_at','official_urls','claim_contract']){
  if(oldFields[field]===undefined&&newFields[field]===undefined)continue;
  if(stableJSON(canonicalValue(field,oldFields[field]))===stableJSON(canonicalValue(field,newFields[field])))continue;
  const source=sources.find(s=>s.metadata?.[field]!=null);
  changed.push({field,old_value:oldFields[field]??null,new_value:newFields[field]??null,source_url:source?.url||null});
 }
 return changed;
}
export async function enqueueTrustAlerts(env,campaignId,changes){
 const db=env.DB,moderators=new Set((env.MODERATOR_IDS||'').split(',').map(x=>x.trim()).filter(Boolean));
 if(!moderators.size||!changes.length)return 0;
 const origin=typeof env.TRUST_PUBLIC_ORIGIN==='string'&&env.TRUST_PUBLIC_ORIGIN.startsWith('https://')?env.TRUST_PUBLIC_ORIGIN.replace(/\/$/,''):'https://airdrop-museum.xirraen.workers.dev';
 const detail=origin+'/trust.html?campaign_id='+encodeURIComponent(campaignId);
 let count=0;
 for(const uid of moderators){
  const user=await sql(db,'SELECT id FROM am_users WHERE id=?',uid).first();if(!user)continue;
  const prefs=await sql(db,'SELECT telegram,telegram_chat FROM am_delivery_preferences WHERE user_id=?',uid).first();
  for(const change of changes.slice(0,25)){
   const key=await sha256(stableJSON([campaignId,change.field,change.old_value,change.new_value,change.source_url]));
   const eventId='trust:'+uid+':'+key;
   const payload={type:'source-verification',title:'Perubahan verifikasi sumber',campaign_id:campaignId,field:change.field,old_value:change.old_value,new_value:change.new_value,source_url:change.source_url,detail_url:detail,disclaimer:'Verifikasi manual diperlukan. Penilaian platform bukan jaminan keamanan, eligibility, atau reward.'};
   const saved=await sql(db,'INSERT OR IGNORE INTO am_notifications(id,user_id,type,payload) VALUES(?,?,?,?)',eventId,uid,'source-verification',JSON.stringify(payload)).run();
   if(saved.meta?.changes!==1)continue;
   count++;
   if(prefs?.telegram&&prefs.telegram_chat&&uid.startsWith('tg:'))
    await sql(db,'INSERT OR IGNORE INTO am_delivery_queue(id,user_id,channel,payload) VALUES(?,?,?,?)',eventId+':telegram',uid,'telegram',JSON.stringify(payload)).run();
  }
 }
 return count;
}
export async function verifyCampaign(env,campaignId,{trigger='manual',actor='system',now=Date.now(),fetcher=fetch}={}){
 const db=env.DB;if(!db||!env.TRUST_CACHE)throw new TrustError('TRUST_BINDINGS_REQUIRED',503);
 const campaign=await sql(db,'SELECT id,payload,source_url,review_status FROM am_core_exhibits WHERE id=?',campaignId).first();
 if(!campaign)throw new TrustError('CAMPAIGN_NOT_FOUND',404);
 const links=(await sql(db,'SELECT l.*,p.source_url AS profile_url,p.etag,p.last_modified,p.content_hash,p.last_fetched_at FROM campaign_source_links l JOIN source_trust_profiles p ON p.id=l.source_id WHERE l.campaign_id=? AND l.enabled=1 ORDER BY l.id LIMIT 40',campaignId).all()).results||[];
 const runKey=await sha256(campaignId+':'+trigger+':'+Math.floor(now/(trigger==='scheduled'?21600000:3600000))+':'+links.map(s=>s.id+':'+s.created_at).join(','));
 const runId=crypto.randomUUID();
 const acquired=await sql(db,"INSERT OR IGNORE INTO verification_runs(id,run_key,campaign_id,trigger_type,status) VALUES(?,?,?,?, 'running')",runId,runKey,campaignId,trigger).run();
 if(acquired.meta?.changes!==1){const existing=await sql(db,'SELECT * FROM verification_runs WHERE run_key=?',runKey).first();return {id:existing.id,status:existing.status,idempotent:true,confidence_label:existing.confidence_label};}
 await audit(db,actor,'verification_started','verification_run',runId,'','running');
 try{
  const hosts=await verifiedHosts(db,campaignId,links),observed=[];let failed=0;
  for(const link of links){
   try{
    const response=await fetchTrustSource(env,{...link,source_url:link.profile_url},{fetcher,now});
    observed.push({...link,id:link.source_id,url:link.profile_url,metadata:response.metadata,social_urls:response.social_urls||[],content_hash:response.content_hash,fetched_at:response.fetched_at,http_status:response.http_status,etag:response.etag,last_modified:response.last_modified,fetch_ok:true});
    await sql(db,'UPDATE campaign_source_links SET extracted_metadata=?,observed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',JSON.stringify(response.metadata),response.fetched_at,link.id).run();
    await sql(db,'UPDATE source_trust_profiles SET etag=?,last_modified=?,content_hash=?,http_status=?,last_fetched_at=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?',response.etag,response.last_modified,response.content_hash,response.http_status,response.fetched_at,link.source_id).run();
   }catch(error){
    failed++;
    const code=error instanceof TrustError?error.message:'SOURCE_FETCH_FAILED';
    await sql(db,'UPDATE source_trust_profiles SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',code,link.source_id).run();
    observed.push({...link,id:link.source_id,url:link.profile_url,metadata:{},fetch_ok:false,fetched_at:link.last_fetched_at});
   }
  }
  const officialSocialUrls=[...new Set(observed.filter(s=>s.fetch_ok&&hosts.some(h=>new URL(s.url).hostname===h||new URL(s.url).hostname.endsWith('.'+h))).flatMap(s=>s.social_urls))];
  const payload=json(campaign.payload);
  const contracts=[payload.token_contract,payload.claim_contract].filter(x=>typeof x==='string');
  for(const source of observed){
   source.tier=classifyTrustTier({url:source.url,officialDomains:hosts,linkedFromOfficial:source.linked_from_official===1,officialSocialUrls,contracts,explorerApproved:source.explorer_approved===1});
   // Independently registered non-official feeds are not promoted based on content.
   if(source.tier==='unknown'&&source.registered_by)source.tier='community';
  }
  const conflicts=await detectConflicts(campaignId,observed.filter(s=>s.fetch_ok));
  const fresh=new Set(conflicts.map(c=>c.fingerprint));
  const previous=(await sql(db,"SELECT * FROM source_conflicts WHERE campaign_id=? AND status='open'",campaignId).all()).results||[];
  const newMaterial=[];
  for(const conflict of conflicts){
   const created=await sql(db,"INSERT OR IGNORE INTO source_conflicts(id,fingerprint,campaign_id,field,value_a,source_a,value_b,source_b,severity,status) VALUES(?,?,?,?,?,?,?,?,?,'open')",
    crypto.randomUUID(),conflict.fingerprint,campaignId,conflict.field,conflict.value_a,conflict.source_a,conflict.value_b,conflict.source_b,conflict.severity).run();
   if(created.meta?.changes){await audit(db,actor,'conflict_opened','source_conflict',conflict.fingerprint,'','open');if(conflict.severity==='material')newMaterial.push(conflict);}
  }
  // Failed fetches cannot resolve previously observed contradictions.
  if(!failed)for(const old of previous)if(!fresh.has(old.fingerprint)){
   const changed=await sql(db,"UPDATE source_conflicts SET status='resolved',closed_at=CURRENT_TIMESTAMP,closed_by='system',reason='no longer reproduced',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'",old.id).run();
   if(changed.meta?.changes)await audit(db,actor,'conflict_resolved','source_conflict',old.id,'open','resolved','no longer reproduced');
  }
  const allConflicts=(await sql(db,"SELECT * FROM source_conflicts WHERE campaign_id=? AND status='open'",campaignId).all()).results||[];
  for(const source of observed){
   const related=allConflicts.filter(c=>c.source_a===source.id||c.source_b===source.id);
   source.trust_score=computeSourceScore({tier:source.tier,linked_from_official:source.linked_from_official===1,consistency:observed.length>1&&!related.length?3:0,material_conflicts:related.filter(c=>c.severity==='material').length,minor_conflicts:related.filter(c=>c.severity==='minor').length,last_fetched_at:source.fetch_ok?source.fetched_at:null},now);
   await sql(db,'UPDATE source_trust_profiles SET tier=?,trust_score=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',source.tier,source.trust_score,source.id).run();
  }
  const successful=observed.filter(s=>s.fetch_ok),fields=summarizeFields(successful);
  const na=[...new Set(links.flatMap(l=>{try{const v=JSON.parse(l.not_applicable);return Array.isArray(v)?v:[];}catch{return [];}}))];
  const confidence=campaignConfidence({sources:successful.map(s=>({...s,last_fetched_at:s.fetched_at})),conflicts:allConflicts,fields,notApplicable:na});
  const prior=await sql(db,"SELECT result_json,confidence_label FROM verification_runs WHERE campaign_id=? AND status='complete' AND id<>? ORDER BY started_at DESC LIMIT 1",campaignId,runId).first();
  const oldFields=prior?json(prior.result_json).fields:null,changes=changedFields(oldFields,fields,successful);
  for(const conflict of newMaterial)changes.push({field:'material_conflict:'+conflict.field,old_value:null,new_value:[conflict.value_a,conflict.value_b].join(' / ').slice(0,400),source_url:successful.find(s=>s.id===conflict.source_a)?.url||null});
  if(prior&&rank(confidence)<rank(prior.confidence_label))changes.push({field:'confidence_label',old_value:prior.confidence_label,new_value:confidence,source_url:successful[0]?.url||null});
  const result={fields,sources:observed.map(s=>({id:s.id,url:s.url,tier:s.tier,trust_score:s.trust_score,fetched_at:s.fetched_at,fetch_ok:s.fetch_ok})),open_conflicts:allConflicts.length,failed_sources:failed,notice:CAUTION};
  await sql(db,"UPDATE verification_runs SET status='complete',finished_at=CURRENT_TIMESTAMP,confidence_label=?,result_json=?,changes_json=? WHERE id=? AND status='running'",confidence,JSON.stringify(result),JSON.stringify(changes),runId).run();
  await audit(db,actor,'verification_completed','verification_run',runId,'running','complete');
  await env.TRUST_CACHE.put('trust:campaign:'+campaignId+':latest',JSON.stringify({id:runId,fetched_at:stamp(),confidence_label:confidence,open_conflicts:allConflicts.length}),{expirationTtl:TTL});
  await enqueueTrustAlerts(env,campaignId,changes);
  metric(env,'verification_run','complete',0,1);
  if(newMaterial.length)metric(env,'conflict_detected','material',0,newMaterial.length);
  return {id:runId,status:'complete',confidence_label:confidence,open_conflicts:allConflicts.length,failed_sources:failed,changes:changes.length};
 }catch{
  await sql(db,"UPDATE verification_runs SET status='failed',error_code='VERIFICATION_FAILED',finished_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'",runId).run();
  await audit(db,actor,'verification_failed','verification_run',runId,'running','failed');
  metric(env,'verification_run','failed',0,1);
  return {id:runId,status:'failed',error_code:'VERIFICATION_FAILED'};
 }
}
export {audit};

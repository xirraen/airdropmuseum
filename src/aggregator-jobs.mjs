import {iso,evaluateRule,aggregateEligibility,scheduledAlerts,priority,ALERT_TYPES,https} from '../dist/aggregator-core.js';
import {portfolio,observations,checkClaim,readJSON,allowed} from './aggregator-providers.mjs';
import {statement as s,listCampaigns,getCampaign,putCampaign,matches} from './aggregator-store.mjs';
const reasons={new_campaign:'Campaign baru sesuai filter Anda.',snapshot_7d:'Snapshot dalam 7 hari.',claim_open:'Periode claim telah dibuka.',deadline_72h:'Deadline dalam 72 jam.',eligibility_change:'Hasil pemeriksaan syarat berubah.',new_quest:'Quest baru ditambahkan.',source_changed:'Sumber resmi berubah; tinjau ulang bukti.'};
export async function scan(env,wallet,c,fetcher=fetch){
 const now=iso(),data=await observations(env,c,wallet,fetcher),context={address:wallet.address,chain:wallet.chain,snapshot_at:c.snapshot_at,now};
 const rules=c.eligibility_rules.map(r=>{const result=evaluateRule(r,data,context);if(!result.evidence_refs.length)result.evidence_refs=c.source_evidence;return result;});
 return {campaign_id:c.id,protocol_activity:data.filter(o=>['protocol_interaction','bridge_activity','governance_vote','lp_position'].includes(o.rule_type)).map(o=>({rule_type:o.rule_type,value:o.value,evidence_refs:o.evidence_refs,observed_at:o.observed_at})),rules,status:aggregateEligibility(rules),claim:await checkClaim(env,c,wallet,fetcher,now),priority:priority(c,rules,[],now),evaluated_at:now,notice:'Hasil pemeriksaan perlu diverifikasi ulang; bukan jaminan eligibility, keamanan atau reward.'};
}
export async function enqueueAlert(env,c,type,suffix='',userId=null){
 if(!ALERT_TYPES.includes(type))throw Error('INVALID_ALERT');const now=iso();
 const prefs=(await s(env.DB,'SELECT * FROM alert_preferences WHERE enabled=1'+(userId?' AND user_id=?':''),...(userId?[userId]:[])).all()).results;
 for(const p of prefs){if(!JSON.parse(p.event_types).includes(type)||!matches(c,JSON.parse(p.filters)))continue;
  const version=suffix||({snapshot_7d:c.snapshot_at,deadline_72h:c.claim_deadline_at,claim_open:c.claim_opens_at})[type]||c.updated_at;
  const id=await digest([p.user_id,c.id,type,version].join('|'));
  const detail=new URL('/aggregator.html',https(env.PUBLIC_APP_URL||'https://airdrop-museum.xirraen.workers.dev'));detail.searchParams.set('campaign',c.slug);
  const payload={campaign:c.name,chain:c.chain.join(', '),reason:reasons[type],source_url:c.official_urls[0],detail_url:detail.href,disclaimer:'Status perlu diverifikasi ulang. Tidak ada jaminan eligibility, keamanan atau reward.'};
  await s(env.DB,'INSERT OR IGNORE INTO alerts(id,user_id,campaign_id,event_type,payload,created_at) VALUES(?,?,?,?,?,?)',id,p.user_id,c.id,type,JSON.stringify(payload),now).run();
 }
}
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function discover(env,fetcher=fetch){
 const urls=String(env.AGGREGATOR_DISCOVERY_URLS||'').split(',').map(v=>v.trim()).filter(Boolean).slice(0,10);let imported=0,unavailable=0;
 for(const url of urls){try{
  const endpoint=allowed(url,env);const feed=await readJSON(endpoint,{fetcher,ttl:60000});if(!Array.isArray(feed.campaigns))throw Error('INVALID_FEED');
  for(const input of feed.campaigns.slice(0,50)){try{
   for(const source of input.official_urls||[])allowed(source,env);
   // Discovery cannot relabel community/news as official: operator allowlist controls all official hosts.
   const old=await getCampaign(env.DB,input.slug);const fingerprint=await digest(JSON.stringify(input));const cursor='discovery:'+endpoint+':'+input.slug;
   const seen=await s(env.DB,'SELECT value FROM aggregator_cursor WHERE name=?',cursor).first();if(seen?.value===fingerprint)continue;
   const result=await putCampaign(env.DB,input,'discovery');for(const type of result.events)await enqueueAlert(env,result.campaign,type);
   if(old&&old.status!==result.campaign.status)await enqueueAlert(env,result.campaign,'source_changed','status:'+result.campaign.updated_at);
   await s(env.DB,'INSERT INTO aggregator_cursor(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value',cursor,fingerprint).run();imported++;
  }catch{unavailable++;}}
 }catch{unavailable++;}}
 return {imported,unavailable,checked_at:iso()};
}
export async function scanStoredWallet(env,id,fetcher=fetch){
 const w=await s(env.DB,'SELECT * FROM wallet_watchlist WHERE id=?',id).first();if(!w)return;
 const c=(await listCampaigns(env.DB)).filter(c=>c.chain.includes(w.chain)&&!['archived','expired'].includes(c.status)).slice(0,50),snap=await portfolio(env,w,fetcher),now=iso();
 const tasks=[],pendingAlerts=[];
 for(const campaign of c){const result=await scan(env,w,campaign,fetcher);snap.protocol_activity.push(...result.protocol_activity);
  const prior=await s(env.DB,'SELECT evaluation_status,rule_id FROM eligibility_results WHERE wallet_id=? AND campaign_id=? ORDER BY evaluated_at DESC LIMIT 40',w.id,campaign.id).all();
  const previous=new Map();for(const r of prior.results)if(!previous.has(r.rule_id))previous.set(r.rule_id,r.evaluation_status);
  for(const r of result.rules){tasks.push(s(env.DB,'INSERT INTO eligibility_results(id,wallet_id,campaign_id,rule_id,rule_type,parameters,evaluation_status,evaluated_at,evidence_refs,human_reason) VALUES(?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),w.id,campaign.id,r.rule_id,r.rule_type,JSON.stringify(r.parameters),r.evaluation_status,r.evaluated_at,JSON.stringify(r.evidence_refs),r.human_reason));
   if(['social_task','custom_manual_task','kyc_or_geo_restriction'].includes(r.rule_type))tasks.push(s(env.DB,'INSERT INTO quest_progress(user_id,wallet_id,campaign_id,quest_id,status,evidence_refs,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(wallet_id,campaign_id,quest_id) DO UPDATE SET status=excluded.status,evidence_refs=excluded.evidence_refs,updated_at=excluded.updated_at',w.user_id,w.id,campaign.id,r.rule_id,r.evaluation_status,JSON.stringify(r.evidence_refs),now));
  }
  tasks.push(s(env.DB,'INSERT INTO claim_checks(id,wallet_id,campaign_id,status,checked_at,evidence_refs,payload) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),w.id,campaign.id,result.claim.status,result.claim.checked_at,JSON.stringify(result.claim.evidence_refs),JSON.stringify(result.claim)));
  if(result.rules.some(r=>previous.has(r.rule_id)&&previous.get(r.rule_id)!==r.evaluation_status))pendingAlerts.push(campaign);
 }
 tasks.push(s(env.DB,'INSERT INTO wallet_snapshots(id,wallet_id,balance,protocol_activity,payload,scanned_at) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),w.id,snap.balance,JSON.stringify(snap.protocol_activity),JSON.stringify(snap),now));
 tasks.push(s(env.DB,'UPDATE wallet_watchlist SET last_scan_at=? WHERE id=?',now,w.id));
 // Respect D1 batch statement bounds and avoid dropping any captured result.
 for(let i=0;i<tasks.length;i+=40)await env.DB.batch(tasks.slice(i,i+40));
 for(const campaign of pendingAlerts)await enqueueAlert(env,campaign,'eligibility_change',w.id+':'+now,w.user_id);
}
export async function deliverAlerts(env,fetcher=fetch){
 const now=Math.floor(Date.now()/1000);
 await s(env.DB,"UPDATE alerts SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END WHERE status='sending' AND next_at<?",now).run();
 const jobs=(await s(env.DB,"SELECT a.* FROM alerts a JOIN alert_preferences p ON p.user_id=a.user_id WHERE a.status='pending' AND a.next_at<=? AND a.attempts<5 AND p.enabled=1 ORDER BY a.created_at LIMIT 20",now).all()).results;
 if(!env.TELEGRAM_BOT_TOKEN)return;
 for(const a of jobs){const locked=await s(env.DB,"UPDATE alerts SET status='sending',attempts=attempts+1,next_at=? WHERE id=? AND status='pending'",now+120,a.id).run();if(!locked.meta.changes)continue;
  try{if(!/^tg:[1-9]\d*$/.test(a.user_id))throw Error('INVALID_TELEGRAM_RECIPIENT');
   const p=JSON.parse(a.payload);const text=[p.campaign,p.chain,p.reason,p.source_url,p.detail_url,p.disclaimer].join('\n');
   // Plain text: Telegram never interprets source text as HTML/Markdown.
   const response=await fetcher('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:a.user_id.slice(3),text,disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('DELIVERY_FAILED');const data=await response.json();if(data.ok!==true)throw Error('DELIVERY_FAILED');
   await s(env.DB,"UPDATE alerts SET status='sent',sent_at=? WHERE id=?",iso(),a.id).run();
  }catch{await s(env.DB,"UPDATE alerts SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,next_at=? WHERE id=?",now+Math.min(3600,60*2**a.attempts),a.id).run();}
 }
}
export async function scheduledAggregator(env,fetcher=fetch){
 if(!env.DB||!await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=5').first())return;
 await discover(env,fetcher);for(const c of await listCampaigns(env.DB)){
 if(!['expired','archived'].includes(c.status)&&c.claim_deadline_at&&Date.parse(c.claim_deadline_at)<Date.now()){await putCampaign(env.DB,{...c,status:'expired',source_evidence:[{source_url:c.official_urls[0],source_type:'official_docs',captured_at:iso(),verified_by:'system',note:'Deadline resmi yang tercatat telah berlalu; ini evaluasi waktu, bukan verifikasi ulang isi sumber.'}]},'deadline_elapsed');continue;}
 for(const type of scheduledAlerts(c))await enqueueAlert(env,c,type);}
 const wallets=(await env.DB.prepare("SELECT id FROM wallet_watchlist WHERE last_scan_at IS NULL OR last_scan_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour') ORDER BY COALESCE(last_scan_at,''),id LIMIT 20").all()).results;
 for(const w of wallets){if(env.AGGREGATOR_QUEUE)await env.AGGREGATOR_QUEUE.send({type:'scan_wallet',id:w.id});else await scanStoredWallet(env,w.id,fetcher);}
 await deliverAlerts(env,fetcher);
 // Retain 90 days of private scan history, newest wallet state remains available.
 await env.DB.batch(['wallet_snapshots','eligibility_results','claim_checks'].map(t=>env.DB.prepare(`DELETE FROM ${t} WHERE ${t==='wallet_snapshots'?'scanned_at':t==='eligibility_results'?'evaluated_at':'checked_at'}<strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')`)));
 await s(env.DB,'DELETE FROM aggregator_rate_limits WHERE expires<?',Math.floor(Date.now()/1000)).run();
}
export async function aggregatorQueue(batch,env){for(const message of batch.messages){try{const b=message.body;if(b?.type!=='scan_wallet'||typeof b.id!=='string'){message.ack();continue;}await scanStoredWallet(env,b.id);message.ack();}catch{message.retry({delaySeconds:60});}}}

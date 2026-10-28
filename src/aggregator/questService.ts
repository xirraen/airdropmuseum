import {cleanQuest,err,httpsURL,wallet,oneOf,STATUSES,transition,string,expired,now} from './questTypes.ts';
import {statement as s} from './pointsService.ts';
const id=()=>crypto.randomUUID();
function pagination(p){const limit=Math.max(1,Math.min(100,Number(p.get('limit'))||30)),page=Math.max(1,Math.min(10000,Number(p.get('page'))||1));return {page,limit,offset:(page-1)*limit};}
export async function campaignById(db,cid){return s(db,'SELECT id,slug,name,official_urls,eligibility_rules,estimated_effort,gas_cost_estimate,status FROM campaigns WHERE id=? OR slug=?',cid,cid).first();}
export async function quest(db,id){return s(db,'SELECT * FROM campaign_quests WHERE id=?',id).first();}
function validateOfficial(value,campaign){
 if(!value)return;
 const urls=JSON.parse(campaign.official_urls||'[]');
 if(!urls.some(u=>{try{return new URL(u).origin===new URL(value).origin}catch{return false}}))err('NOT_AN_OFFICIAL_SOURCE');
}
export async function createQuest(db,campaignId,body){
 const campaign=await campaignById(db,campaignId);if(!campaign)err('CAMPAIGN_NOT_FOUND',404);
 const q=cleanQuest(body);validateOfficial(q.official_url,campaign);
 if(q.rule_id&&!JSON.parse(campaign.eligibility_rules||'[]').some(x=>x.id===q.rule_id))err('RULE_NOT_FOUND');
 const ts=now(),qid=id();
 await s(db,'INSERT INTO campaign_quests(id,campaign_id,title,description,quest_type,verification_method,points,weight,starts_at,ends_at,official_url,required,rule_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
 qid,campaign.id,q.title,q.description,q.quest_type,q.verification_method,q.points,q.weight,q.starts_at,q.ends_at,q.official_url,q.required,q.rule_id,ts,ts).run();
 return quest(db,qid);
}
export async function editQuest(db,qid,body){
 const old=await quest(db,qid);if(!old)err('QUEST_NOT_FOUND',404);
 const campaign=await campaignById(db,old.campaign_id);
 const q=cleanQuest(body,old);validateOfficial(q.official_url,campaign);
 if(q.rule_id&&!JSON.parse(campaign.eligibility_rules||'[]').some(x=>x.id===q.rule_id))err('RULE_NOT_FOUND');
 const exists=await s(db,'SELECT 1 FROM user_points_ledger WHERE quest_id=? LIMIT 1',qid).first();
 if(exists&&(['points','verification_method','rule_id'].some(k=>q[k]!==old[k])))err('VERIFIED_QUEST_FIELDS_LOCKED',409);
 const r=await s(db,'UPDATE campaign_quests SET title=?,description=?,quest_type=?,verification_method=?,points=?,weight=?,starts_at=?,ends_at=?,official_url=?,required=?,rule_id=?,updated_at=? WHERE id=? AND updated_at=?',
 q.title,q.description,q.quest_type,q.verification_method,q.points,q.weight,q.starts_at,q.ends_at,q.official_url,q.required,q.rule_id,now(),qid,old.updated_at).run();
 if(!r.meta?.changes)err('REVISION_CONFLICT',409);return quest(db,qid);
}
export async function deleteQuest(db,qid){
 if(!await quest(db,qid))err('QUEST_NOT_FOUND',404);
 if(await s(db,'SELECT 1 FROM user_points_ledger WHERE quest_id=? LIMIT 1',qid).first())err('LEDGER_HISTORY_PROTECTED',409);
 await s(db,'DELETE FROM campaign_quests WHERE id=?',qid).run();return {deleted:true};
}
export async function listQuests(db,cid,scope,params){
 const campaign=await campaignById(db,cid);if(!campaign)err('CAMPAIGN_NOT_FOUND',404);
 const {page,limit,offset}=pagination(params);
 const rows=scope?(await s(db,"SELECT q.*,p.status AS my_status,p.evidence_url AS my_evidence_url,p.note AS my_note,p.completed_at AS my_completed_at,p.updated_at AS progress_updated_at,p.points_awarded FROM campaign_quests q LEFT JOIN user_quest_progress p ON p.quest_id=q.id AND p.user_scope=? AND p.wallet_address IS NULL WHERE q.campaign_id=? ORDER BY q.required DESC,q.ends_at IS NULL,q.ends_at,q.id LIMIT ? OFFSET ?",scope,campaign.id,limit,offset).all()).results:
 (await s(db,'SELECT * FROM campaign_quests WHERE campaign_id=? ORDER BY required DESC,ends_at IS NULL,ends_at,id LIMIT ? OFFSET ?',campaign.id,limit,offset).all()).results;
 const total=(await s(db,'SELECT COUNT(*) n FROM campaign_quests WHERE campaign_id=?',campaign.id).first()).n;
 return {campaign:{id:campaign.id,name:campaign.name,slug:campaign.slug},quests:rows.map(q=>({...q,status:q.my_status==='verified'?'verified':expired(q)?'expired':q.my_status||'todo'})),page,limit,total,has_more:page*limit<total};
}
export async function myQuests(db,scope,params){
 const {page,limit,offset}=pagination(params);
 const {results}=await s(db,"SELECT q.*,c.name AS campaign_name,c.slug AS campaign_slug,p.wallet_address,p.status AS my_status,p.note AS my_note,p.evidence_url AS my_evidence_url,p.updated_at AS progress_updated_at,p.points_awarded FROM user_quest_progress p JOIN campaign_quests q ON q.id=p.quest_id JOIN campaigns c ON c.id=q.campaign_id WHERE p.user_scope=? ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?",scope,limit,offset).all();
 const total=(await s(db,'SELECT COUNT(*) n FROM user_quest_progress WHERE user_scope=?',scope).first()).n;
 return {quests:results,page,limit,total,has_more:page*limit<total};
}
async function walletOwned(db,scope,address){
 if(!address)return;
 const r=await s(db,'SELECT id FROM wallet_watchlist WHERE user_id=? AND lower(address)=?',scope,address).first();
 if(!r)err('WALLET_NOT_IN_WATCHLIST',403);return r.id;
}
async function onChainProof(db,scope,q,address){
 if(q.verification_method!=='wallet_activity'||!address||!q.rule_id)return null;
 const wid=await walletOwned(db,scope,address);
 const row=await s(db,"SELECT evaluation_status,evaluated_at,evidence_refs FROM eligibility_results WHERE wallet_id=? AND campaign_id=? AND rule_id=? ORDER BY evaluated_at DESC LIMIT 1",wid,q.campaign_id,q.rule_id).first();
 if(row?.evaluation_status!=='passed'||!Number.isFinite(Date.parse(row.evaluated_at))||Date.now()-Date.parse(row.evaluated_at)>90*86400000)return null;
 let refs=[];try{refs=JSON.parse(row.evidence_refs||'[]')}catch{}
 const source=refs.map(x=>{try{return httpsURL(x.source_url,false)}catch{return null}}).find(Boolean);
 if(!source)return null;
 return {evidence_url:source,verification_source:'wallet_activity'};
}
export async function setProgress(db,scope,qid,body,actor='user'){
 const q=await quest(db,qid);if(!q)err('QUEST_NOT_FOUND',404);
 const addr=wallet(body.wallet_address);
 if(actor!=='admin')await walletOwned(db,scope,addr);
 const note=body.note===undefined?undefined:string(body.note,1000,'NOTE',{optional:true});
 let evidence=body.evidence_url===undefined?undefined:httpsURL(body.evidence_url);
 // Initial insert is idempotent. NULL address has a functional unique index.
 await s(db,"INSERT OR IGNORE INTO user_quest_progress(id,user_scope,quest_id,wallet_address,status,updated_at) VALUES(?,?,?,?, 'todo',?)",id(),scope,qid,addr,now()).run();
 const old=await s(db,'SELECT * FROM user_quest_progress WHERE user_scope=? AND quest_id=? AND COALESCE(wallet_address,\'\')=COALESCE(?,\'\')',scope,qid,addr).first();
 if(!old)err('PROGRESS_NOT_FOUND',404);
 let status=oneOf(body.status??old.status,STATUSES,'STATUS');
 let proof=null;
 if(q.verification_method==='wallet_activity'&&actor==='user'){
  proof=await onChainProof(db,scope,q,addr);
  if(proof){status='verified';evidence=proof.evidence_url;actor='system'}
 }
 if(expired(q)&&status!=='verified'&&status!=='expired')err('QUEST_EXPIRED',409);
 if(!transition(q.verification_method,old.status,status,actor))err('INVALID_STATUS_TRANSITION',409);
 if(status==='submitted'&&q.verification_method==='url_submission'&&! (evidence||old.evidence_url))err('EVIDENCE_REQUIRED');
 if(status==='verified'){
  if(actor==='user'||actor==='system'&&q.verification_method!=='wallet_activity'||actor==='admin'&&!['admin_review','url_submission'].includes(q.verification_method))err('VERIFICATION_NOT_ALLOWED',403);
  if(!(evidence||old.evidence_url))err('VERIFIED_EVIDENCE_REQUIRED');
 }
 const ts=now(),newRev=old.revision+1,award=status==='verified'&&old.status!=='verified',reverse=old.status==='verified'&&status==='failed';
 const amount=award?q.points:reverse?-old.points_awarded:0;
 const awarded=award?q.points:reverse?0:old.points_awarded;
 const source=status===old.status?old.verification_source:status==='verified'?(proof?.verification_source||'admin_review'):null;
 const stmts=[s(db,'UPDATE user_quest_progress SET status=?,note=?,evidence_url=?,updated_at=?,completed_at=?,points_awarded=?,revision=revision+1,verification_source=? WHERE id=? AND user_scope=? AND revision=?',
 status,note===undefined?old.note:note,evidence===undefined?old.evidence_url:evidence,ts,status==='verified'?ts:old.completed_at,awarded,source,old.id,scope,old.revision)];
 if(award||reverse)stmts.push(s(db,"INSERT OR IGNORE INTO user_points_ledger(id,user_scope,campaign_id,quest_id,wallet_address,points,reason,created_at) SELECT ?,?,?,?,?,?,?,? FROM user_quest_progress WHERE id=? AND user_scope=? AND revision=? AND status=? AND (?='QUEST_REVERSAL' OR COALESCE((SELECT SUM(points) FROM user_points_ledger WHERE user_scope=? AND quest_id=?),0)<=0)",
 'quest:'+old.id+':'+newRev,scope,q.campaign_id,qid,addr,amount,award?'QUEST_VERIFIED':'QUEST_REVERSAL',ts,old.id,scope,newRev,status,award?'QUEST_VERIFIED':'QUEST_REVERSAL',scope,qid));
 if(award)stmts.push(s(db,"UPDATE user_quest_progress SET points_awarded=CASE WHEN EXISTS(SELECT 1 FROM user_points_ledger WHERE id=?) THEN ? ELSE 0 END WHERE id=? AND user_scope=? AND revision=?",'quest:'+old.id+':'+newRev,q.points,old.id,scope,newRev));
 const result=await db.batch(stmts);
 if(result[0]?.meta?.changes!==1)err('REVISION_CONFLICT',409);
 return s(db,'SELECT * FROM user_quest_progress WHERE id=? AND user_scope=?',old.id,scope).first();
}
export async function campaignEligibility(db,scope,cid){
 const campaign=await campaignById(db,cid);if(!campaign)err('CAMPAIGN_NOT_FOUND',404);
 const rows=(await s(db,"SELECT q.id,q.rule_id,q.required,q.verification_method,MAX(CASE WHEN p.status='verified' AND p.evidence_url IS NOT NULL AND p.verification_source IN ('wallet_activity','admin_review') THEN 1 ELSE 0 END) verified,MAX(CASE WHEN p.status='verified' AND p.evidence_url IS NOT NULL AND p.verification_source IN ('wallet_activity','admin_review') THEN p.evidence_url END) evidence_url FROM campaign_quests q LEFT JOIN user_quest_progress p ON p.quest_id=q.id AND p.user_scope=? WHERE q.campaign_id=? GROUP BY q.id",scope,campaign.id).all()).results;
 const required=rows.filter(q=>q.required===1),verified=required.filter(q=>q.verified===1);
 return {campaign_id:campaign.id,total_required:required.length,verified_required:verified.length,progress:required.length?Math.round(100*verified.length/required.length):0,
 rules:required.map(q=>({rule_id:q.rule_id,quest_id:q.id,status:q.rule_id&&verified.includes(q)?'passed':'manual_check',reason:q.rule_id&&verified.includes(q)?'Quest terverifikasi dengan evidence; cek seluruh aturan lain secara terpisah.':'Belum ada bukti terverifikasi untuk aturan quest terkait.',evidence_url:verified.includes(q)?q.evidence_url:null})),
 notice:'Progres quest bukan status eligibility keseluruhan.'};
}
export {pagination};

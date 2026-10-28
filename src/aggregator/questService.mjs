import {questPayload,problem,plain,secureUrl,optionalWallet,member,QUEST_STATUSES,transition,eligibilityFromQuest} from './questTypes.mjs';
const s=(db,sql,...v)=>db.prepare(sql).bind(...v);
export async function questById(db,id){return await s(db,'SELECT * FROM campaign_quests WHERE id=?',id).first();}
export async function createQuest(db,campaign_id,body,now=Math.floor(Date.now()/1000)){
 const data=questPayload(body),c=await s(db,'SELECT id FROM campaigns WHERE id=?',campaign_id).first();if(!c)problem('CAMPAIGN_NOT_FOUND',404);
 const id=crypto.randomUUID(),keys=Object.keys(data);
 await s(db,`INSERT INTO campaign_quests(id,campaign_id,${keys.join(',')},created_at,updated_at) VALUES(?, ?,${keys.map(()=>'?').join(',')}, ?, ?)`,id,campaign_id,...keys.map(k=>data[k]),now,now).run();
 return await questById(db,id);
}
export async function editQuest(db,id,body,now=Math.floor(Date.now()/1000)){
 const old=await questById(db,id);if(!old)problem('QUEST_NOT_FOUND',404);
 const data=questPayload({...old,...body}),keys=Object.keys(data);
 // A points change cannot silently rewrite historical awards.
 const earned=await s(db,'SELECT COUNT(*) AS n FROM user_points_ledger WHERE quest_id=?',id).first();
 if(earned.n&&data.points!==old.points)problem('POINTS_LOCKED',409);
 await s(db,`UPDATE campaign_quests SET ${keys.map(k=>k+'=?').join(',')},updated_at=? WHERE id=?`,...keys.map(k=>data[k]),now,id).run();
 return await questById(db,id);
}
export async function deleteQuest(db,id){
 const result=await s(db,'DELETE FROM campaign_quests WHERE id=?',id).run();
 if(!result.meta.changes)problem('QUEST_NOT_FOUND',404);
 return {deleted:true};
}
export async function campaignQuests(db,slug,user_scope=null,{limit=25,offset=0}={}){
 const campaign=await s(db,'SELECT id,slug,name FROM campaigns WHERE slug=? OR id=?',slug,slug).first();if(!campaign)problem('CAMPAIGN_NOT_FOUND',404);
 const [rows,total]=await Promise.all([
 s(db,`SELECT q.*,p.status,p.evidence_url,p.note,p.wallet_address,p.points_awarded,p.updated_at AS progress_updated_at,p.completed_at
 FROM campaign_quests q LEFT JOIN user_quest_progress p ON p.quest_id=q.id AND p.user_scope=? AND p.wallet_address IS NULL
 WHERE q.campaign_id=? ORDER BY q.required DESC, q.ends_at ASC, q.id ASC LIMIT ? OFFSET ?`,user_scope||'',campaign.id,limit,offset).all(),
 s(db,'SELECT COUNT(*) AS n FROM campaign_quests WHERE campaign_id=?',campaign.id).first()]);
 return {campaign,quests:rows.results.map(row=>({...row,status:row.status||'todo',progress_updated_at:row.progress_updated_at??null})),total:total.n,limit,offset};
}
export async function myQuests(db,user_scope,{limit=25,offset=0}={}){
 const [rows,total]=await Promise.all([
 s(db,`SELECT p.*,q.title,q.points,q.verification_method,q.quest_type,q.ends_at,c.name AS campaign_name,c.slug AS campaign_slug
 FROM user_quest_progress p JOIN campaign_quests q ON q.id=p.quest_id JOIN campaigns c ON c.id=q.campaign_id
 WHERE p.user_scope=? ORDER BY p.updated_at DESC,p.id DESC LIMIT ? OFFSET ?`,user_scope,limit,offset).all(),
 s(db,'SELECT COUNT(*) AS n FROM user_quest_progress WHERE user_scope=?',user_scope).first()]);
 return {items:rows.results,total:total.n,limit,offset};
}
export async function campaignProgress(db,slug,user_scope){
 const row=await s(db,`SELECT c.id,c.name,c.slug,COUNT(q.id) AS total,
 COALESCE(SUM(CASE WHEN q.id IS NOT NULL AND p.status='verified' THEN 1 ELSE 0 END),0) AS verified,
 COALESCE(SUM(CASE WHEN q.required=1 THEN 1 ELSE 0 END),0) AS required_total,
 COALESCE(SUM(CASE WHEN q.required=1 AND p.status='verified' THEN 1 ELSE 0 END),0) AS required_verified
 FROM campaigns c LEFT JOIN campaign_quests q ON q.campaign_id=c.id
 LEFT JOIN user_quest_progress p ON p.quest_id=q.id AND p.user_scope=? AND p.wallet_address IS NULL
 WHERE c.slug=? GROUP BY c.id`,user_scope,slug).first();
 if(!row)problem('CAMPAIGN_NOT_FOUND',404);
 const {quests}=await campaignQuests(db,slug,user_scope,{limit:100,offset:0});
 return {...row,percent:row.total?Math.round(100*row.verified/row.total):0,eligibility_progress:row.required_total?Math.round(100*row.required_verified/row.required_total):0,
 eligibility_rules:quests.filter(q=>q.required).map(q=>({quest_id:q.id,...eligibilityFromQuest(q,{status:q.status,evidence_url:q.evidence_url})})),
 disclaimer:'Verifikasi quest tidak menjamin eligibility final.'};
}
async function validActivity(db,scope,q,wallet){
 if(!wallet)problem('WALLET_REQUIRED');
 const r=await s(db,`SELECT e.evidence_refs,e.evaluated_at FROM eligibility_results e
 JOIN wallet_watchlist w ON w.id=e.wallet_id
 WHERE w.user_id=? AND lower(w.address)=? AND e.campaign_id=? AND e.rule_id=? AND e.evaluation_status='passed'
 ORDER BY e.evaluated_at DESC LIMIT 1`,scope,wallet,q.campaign_id,q.id).first();
 if(!r)problem('ONCHAIN_EVIDENCE_NOT_FOUND',409);
 let refs;try{refs=JSON.parse(r.evidence_refs)}catch{refs=[]}
 if(!Array.isArray(refs)||!refs.length)problem('ONCHAIN_EVIDENCE_NOT_FOUND',409);
 const url=refs.find(e=>e.source_url)?.source_url;return secureUrl(url,false);
}
export async function changeProgress(db,scope,quest_id,body,actor='user',now=Math.floor(Date.now()/1000)){
 if(!scope||!/^tg:[0-9]+$/.test(scope))problem('INVALID_USER_SCOPE',403);
 const q=await questById(db,quest_id);if(!q)problem('QUEST_NOT_FOUND',404);
 const wallet=optionalWallet(body.wallet_address),previous=await s(db,'SELECT * FROM user_quest_progress WHERE user_scope=? AND quest_id=? AND coalesce(wallet_address,\'\')=?',scope,quest_id,wallet||'').first();
 let next=member(body.status||'in_progress',QUEST_STATUSES,'INVALID_STATUS');
 if(q.ends_at!==null&&q.ends_at<=now&&next!=='failed'&&next!=='not_applicable')problem('QUEST_EXPIRED',409);
 const oldStatus=previous?.status||'todo';
 transition(oldStatus,next,q.verification_method,actor);
 let evidence=body.evidence_url===undefined?(previous?.evidence_url||null):secureUrl(body.evidence_url);
 const note=body.note===undefined?(previous?.note||''):plain(body.note,1000);
 if(next==='submitted'&&q.verification_method==='url_submission'&&!evidence)problem('EVIDENCE_REQUIRED');
 if(next==='verified'){
  if(actor==='evaluator')evidence=await validActivity(db,scope,q,wallet);
  else if(!evidence)problem('EVIDENCE_REQUIRED');
 }
 if(next===oldStatus&&previous&&evidence===previous.evidence_url&&note===previous.note)return previous;
 const id=previous?.id||crypto.randomUUID(),revision=(previous?.revision||0)+1,wasVerified=oldStatus==='verified',willVerify=next==='verified';
 const sum=await s(db,'SELECT COALESCE(SUM(points),0) AS points FROM user_points_ledger WHERE user_scope=? AND quest_id=? AND coalesce(wallet_address,\'\')=?',scope,quest_id,wallet||'').first();
 const net=Math.max(0,sum?.points||0);
 const delta=willVerify&&!wasVerified?Math.max(0,q.points-net):wasVerified&&next==='failed'?-net:0;
 const completed_at=willVerify?now:previous?.completed_at??null,points_awarded=willVerify?q.points:wasVerified?0:(previous?.points_awarded||0);
 let statements=[];
 if(!previous)statements.push(s(db,`INSERT OR IGNORE INTO user_quest_progress(id,user_scope,quest_id,wallet_address,status,completed_at,evidence_url,note,points_awarded,updated_at,revision)
 VALUES(?,?,?,?,?,?,?,?,?,?,?)`,id,scope,quest_id,wallet,next,completed_at,evidence,note,points_awarded,now,revision));
 else statements.push(s(db,`UPDATE user_quest_progress SET status=?,completed_at=?,evidence_url=?,note=?,points_awarded=?,updated_at=?,revision=?
 WHERE id=? AND user_scope=? AND revision=?`,next,completed_at,evidence,note,points_awarded,now,revision,id,scope,revision-1));
 if(delta!==0){
  statements.push(s(db,`INSERT OR IGNORE INTO user_points_ledger(id,user_scope,campaign_id,quest_id,wallet_address,points,reason,created_at)
 SELECT ?,?,?,?,?,?,?,? WHERE EXISTS
 (SELECT 1 FROM user_quest_progress WHERE id=? AND user_scope=? AND status=? AND revision=?)`,
 id+':'+revision,scope,q.campaign_id,quest_id,wallet,delta,delta>0?'quest_verified':'quest_verification_reversed',now,id,scope,next,revision));
 }
 const outcome=await db.batch(statements);
 if(!outcome[0]?.meta?.changes)problem('PROGRESS_CONFLICT',409);
 return await s(db,'SELECT * FROM user_quest_progress WHERE id=? AND user_scope=?',id,scope).first();
}
export async function submitEvidence(db,scope,quest_id,body,now){
 const q=await questById(db,quest_id);if(!q)problem('QUEST_NOT_FOUND',404);
 if(!['url_submission','admin_review','manual'].includes(q.verification_method))problem('EVIDENCE_METHOD_UNSUPPORTED');
 return changeProgress(db,scope,quest_id,{...body,evidence_url:secureUrl(body.evidence_url,false),status:'submitted'},'user',now);
}

import {sql,fail} from './types.ts';
export const ERASE_CONFIRMATION='HAPUS JURNAL SAYA';
export async function erasurePreview(db,scope){
 const row=await sql(db,"SELECT COUNT(*) event_count,COUNT(DISTINCT aggregate_id) aggregate_count,COALESCE(MAX(id),'') last_event_id FROM autopsy_events WHERE user_scope=?",scope).first();
 return {...row,scope:'private_journal',confirmation:ERASE_CONFIRMATION,retained:'Minimal event envelopes with an unlinked random owner identifier; no private payload.',backups:'Restricted disaster-recovery copies can remain for up to 30 days under the retention policy. Erasure receipts must be reapplied before serving any restored database.',excludes:'Account, public posts, wallet watchlist and quest data; use their separate privacy controls.'};
}
export async function flushErasureLedger(env,request=null){
 if(!env.JOURNAL_ERASURE_LEDGER?.put)return false;
 const pending=(await sql(env.DB,'SELECT request_id,erased_scope,aggregate_ids,event_count,erased_at FROM journal_erasure_receipts WHERE ledger_synced=0'+(request?' AND request_id=?':'')+' LIMIT 10',...(request?[request]:[])).all()).results;
 for(const row of pending){
  await env.JOURNAL_ERASURE_LEDGER.put('journal-erasure:'+row.request_id,JSON.stringify({...row,aggregate_ids:JSON.parse(row.aggregate_ids)}));
  await sql(env.DB,'UPDATE journal_erasure_receipts SET ledger_synced=1 WHERE request_id=?',row.request_id).run();
 }
 return true;
}
export async function eraseJournal(env,scope,body){
 if(body.confirmation!==ERASE_CONFIRMATION)fail('ERASURE_CONFIRMATION_REQUIRED',400);
 if(!Number.isSafeInteger(body.expected_event_count)||body.expected_event_count<0||typeof body.expected_last_event_id!=='string')fail('ERASURE_PREVIEW_REQUIRED',400);
 if(!env.JOURNAL_ERASURE_LEDGER?.put)fail('ERASURE_LEDGER_UNAVAILABLE',503);
 const preview=await erasurePreview(env.DB,scope);
 if(preview.event_count!==body.expected_event_count||preview.last_event_id!==body.expected_last_event_id)fail('VERSION_CONFLICT',409);
 if(!preview.event_count){
  try{await flushErasureLedger(env);}catch{/* Pending receipts remain incomplete. */}
  const pending=await sql(env.DB,'SELECT COUNT(*) n FROM journal_erasure_receipts WHERE ledger_synced=0').first();
  return {live_erased:true,empty:true,backup_replay_protected:pending.n===0};
 }
 if(preview.aggregate_count>5000)fail('ERASURE_REQUIRES_OPERATOR',422);
 const aggregates=(await sql(env.DB,'SELECT DISTINCT aggregate_id FROM autopsy_events WHERE user_scope=? ORDER BY aggregate_id',scope).all()).results.map(r=>r.aggregate_id);
 const request=crypto.randomUUID(),erased='erased:'+crypto.randomUUID(),at=new Date().toISOString();
 const guard=sql(env.DB,`INSERT INTO journal_erasure_authorizations(request_id,user_scope,erased_scope,expires_at,matches)
 SELECT ?,?,?,unixepoch()+120,CASE WHEN (SELECT COUNT(*) FROM autopsy_events WHERE user_scope=?)=? AND (SELECT COALESCE(MAX(id),'') FROM autopsy_events WHERE user_scope=?)=? THEN 1 ELSE 0 END`,request,scope,erased,scope,body.expected_event_count,scope,body.expected_last_event_id);
 try{await env.DB.batch([
  guard,
  sql(env.DB,'INSERT INTO journal_erasure_targets(request_id,aggregate_id) SELECT ?,aggregate_id FROM autopsy_events WHERE user_scope=? GROUP BY aggregate_id',request,scope),
  sql(env.DB,"INSERT INTO am_users(id,username) VALUES(?,'Erased journal envelope')",erased),
  sql(env.DB,'INSERT INTO journal_erasure_receipts(request_id,erased_scope,aggregate_ids,event_count,erased_at) VALUES(?,?,?,?,?)',request,erased,JSON.stringify(aggregates),preview.event_count,at),
  sql(env.DB,'DELETE FROM pattern_snapshots WHERE user_scope=?',scope),
  sql(env.DB,'DELETE FROM evidence_items WHERE user_scope=?',scope),
  sql(env.DB,'DELETE FROM decision_entries WHERE user_scope=?',scope),
  sql(env.DB,'DELETE FROM claim_autopsies WHERE user_scope=?',scope),
  sql(env.DB,'DELETE FROM user_campaign_subscriptions WHERE user_scope=?',scope),
  sql(env.DB,'DELETE FROM journal_private_payloads WHERE user_scope=?',scope),
  sql(env.DB,'UPDATE autopsy_events SET user_scope=? WHERE user_scope=?',erased,scope),
  sql(env.DB,'DELETE FROM journal_erasure_targets WHERE request_id=?',request),
  sql(env.DB,'DELETE FROM journal_erasure_authorizations WHERE request_id=?',request)
 ]);}catch(error){if(/CHECK constraint failed: matches=1/.test(String(error?.message)))fail('VERSION_CONFLICT',409);throw error;}
 let synced=false;try{await flushErasureLedger(env,request);synced=!!(await sql(env.DB,'SELECT ledger_synced FROM journal_erasure_receipts WHERE request_id=?',request).first())?.ledger_synced;}catch{/* Live erasure committed; the durable outbox must be retried. */}
 return {request_id:request,live_erased:true,backup_replay_protected:synced,event_count:preview.event_count,retained:preview.retained,backups:preview.backups};
}

// Offline restore only, before exposing a restored database. Receipts come from
// the dedicated external ledger, never from an untrusted user's request body.
export async function reapplyErasureReceipt(db,receipt){
 const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
 if(!uuid.test(receipt.request_id)||!(typeof receipt.erased_scope==='string'&&receipt.erased_scope.startsWith('erased:')&&uuid.test(receipt.erased_scope.slice(7)))||!Array.isArray(receipt.aggregate_ids)||!receipt.aggregate_ids.length||receipt.aggregate_ids.length>5000||receipt.aggregate_ids.some(id=>!uuid.test(id)))fail('INVALID_ERASURE_RECEIPT',400);
 const targets=JSON.stringify(receipt.aggregate_ids);
 const scopes=(await sql(db,'SELECT DISTINCT user_scope FROM autopsy_events WHERE aggregate_id IN (SELECT value FROM json_each(?)) AND user_scope<>?',targets,receipt.erased_scope).all()).results;
 for(const row of scopes){
  const request=crypto.randomUUID(),scope=row.user_scope;
  await db.batch([
   sql(db,'INSERT INTO journal_erasure_authorizations(request_id,user_scope,erased_scope,expires_at,matches) VALUES(?,?,?,unixepoch()+120,1)',request,scope,receipt.erased_scope),
   sql(db,'INSERT INTO journal_erasure_targets(request_id,aggregate_id) SELECT ?,value FROM json_each(?)',request,targets),
   sql(db,"INSERT OR IGNORE INTO am_users(id,username) VALUES(?,'Erased journal envelope')",receipt.erased_scope),
   sql(db,'DELETE FROM pattern_snapshots WHERE user_scope=?',scope),
   sql(db,'DELETE FROM evidence_items WHERE aggregate_id IN (SELECT value FROM json_each(?))',targets),
   sql(db,'DELETE FROM decision_entries WHERE aggregate_id IN (SELECT value FROM json_each(?))',targets),
   sql(db,'DELETE FROM claim_autopsies WHERE aggregate_id IN (SELECT value FROM json_each(?))',targets),
   sql(db,`DELETE FROM user_campaign_subscriptions WHERE user_scope=? AND campaign_id IN
    (SELECT l.aggregator_id FROM campaign_registry_links l JOIN autopsy_events e ON e.campaign_id=l.canonical_id
     WHERE e.user_scope=? AND e.aggregate_id IN (SELECT value FROM json_each(?)))`,scope,scope,targets),
   sql(db,'DELETE FROM journal_private_payloads WHERE user_scope=? AND event_id IN (SELECT id FROM autopsy_events WHERE aggregate_id IN (SELECT value FROM json_each(?)))',scope,targets),
   sql(db,'UPDATE autopsy_events SET user_scope=? WHERE user_scope=? AND aggregate_id IN (SELECT value FROM json_each(?))',receipt.erased_scope,scope,targets),
   sql(db,'DELETE FROM journal_erasure_targets WHERE request_id=?',request),
   sql(db,'DELETE FROM journal_erasure_authorizations WHERE request_id=?',request)
  ]);
 }
 return {request_id:receipt.request_id,matched_owner_groups:scopes.length};
}

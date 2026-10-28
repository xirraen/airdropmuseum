import {sql,fail} from './types.ts';
export async function exportJournal(db,scope,params){
 const limit=params.has('limit')?Number(params.get('limit')):50;
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail('INVALID_LIMIT');
 let cursor=null;const raw=params.get('cursor');
 if(raw){
  if(raw.length>512||!/^[A-Za-z0-9_-]+$/.test(raw))fail('INVALID_CURSOR');
  try{cursor=JSON.parse(atob(raw.replaceAll('-','+').replaceAll('_','/')));}catch{fail('INVALID_CURSOR');}
  if(typeof cursor.t!=='string'||!Number.isFinite(Date.parse(cursor.t))||typeof cursor.id!=='string'||!/^[a-f0-9-]{36}$/.test(cursor.id)||typeof cursor.cutoff!=='string'||!Number.isFinite(Date.parse(cursor.cutoff)))fail('INVALID_CURSOR');
 }
 const cutoff=cursor?.cutoff||new Date().toISOString();
 const after=cursor?' AND (recorded_at>? OR (recorded_at=? AND id>?))':'';
 const args=cursor?[scope,cutoff,cursor.t,cursor.t,cursor.id,limit+1]:[scope,cutoff,limit+1];
 const rows=(await sql(db,'SELECT e.id,e.user_scope,e.aggregate_id,e.campaign_id,e.event_version,e.event_type,e.knowledge_cutoff_at,e.evidence_refs,p.payload_json,e.recorded_at FROM autopsy_events e LEFT JOIN journal_private_payloads p ON p.event_id=e.id AND p.user_scope=e.user_scope WHERE e.user_scope=? AND e.recorded_at<=?'+after.replaceAll('recorded_at','e.recorded_at').replaceAll('id>?','e.id>?')+' ORDER BY e.recorded_at,e.id LIMIT ?',...args).all()).results||[];
 if(rows.some(row=>row.payload_json==null))fail('PRIVATE_PAYLOAD_UNAVAILABLE',503);
 const items=rows.slice(0,limit),last=items.at(-1);
 const next_cursor=rows.length>limit&&last?btoa(JSON.stringify({t:last.recorded_at,id:last.id,cutoff})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''):null;
 return {schema:'airdrop-museum-journal-events-v1',private:true,export_cutoff_at:cutoff,events:items,next_cursor,notice:'Personal export of immutable history. Import does not overwrite events. Keep this file private.'};
}

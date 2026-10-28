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
 const rows=(await sql(db,'SELECT id,user_scope,aggregate_id,campaign_id,event_version,event_type,knowledge_cutoff_at,evidence_refs,payload_json,recorded_at FROM autopsy_events WHERE user_scope=? AND recorded_at<=?'+after+' ORDER BY recorded_at,id LIMIT ?',...args).all()).results||[];
 const items=rows.slice(0,limit),last=items.at(-1);
 const next_cursor=rows.length>limit&&last?btoa(JSON.stringify({t:last.recorded_at,id:last.id,cutoff})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''):null;
 return {schema:'airdrop-museum-journal-events-v1',private:true,export_cutoff_at:cutoff,events:items,next_cursor,notice:'Personal export of immutable history. Import does not overwrite events. Keep this file private.'};
}

import {fail,listIds,hash,sql,safeJson,text} from './types.ts';
import {audit} from './auditService.ts';
export async function preview(request,env,actor,target,allowed,readRow){
 const u=new URL(request.url);if(request.headers.get('X-CSRF-Token')!==actor.csrf)fail('PREVIEW_CSRF_REQUIRED',403);
 const ids=listIds((u.searchParams.get('ids')||'').split(',')),action=u.searchParams.get('action')||'';
 if(!allowed.includes(action))fail('INVALID_BULK_ACTION');
 const options={status:u.searchParams.get('status')||'',reviewer:u.searchParams.get('reviewer')||'',reason:u.searchParams.get('reason')||''};
 const rows=await Promise.all(ids.map(id=>readRow(env.DB,id)));
 if(rows.some(r=>!r))fail('BULK_ITEM_NOT_FOUND',404);
 const fingerprint=await hash(JSON.stringify(rows));
 const id=crypto.randomUUID(),expiry=Math.floor(Date.now()/1000)+300;
 await sql(env.DB,'INSERT INTO admin_bulk_previews(id,admin_scope,target_type,action,ids_json,options_json,fingerprint,expires_at) VALUES(?,?,?,?,?,?,?,?)',
  id,actor.admin_scope,target,action,JSON.stringify(ids),JSON.stringify(options),fingerprint,expiry).run();
 await audit(env,request,actor,'bulk.preview',target,id,{}, {status:action});
 return {preview_id:id,action,count:ids.length,ids,expires_at:new Date(expiry*1000).toISOString(),confirm_phrase:'KONFIRMASI',summary:rows.map(r=>({id:r.id,status:r.status||r.review_status||'',updated_at:r.updated_at||r.last_seen_at||''}))};
}
export async function execute(request,env,actor,target,allowed,b,readRow,apply){
 if(b.confirm_phrase!=='KONFIRMASI')fail('SECOND_CONFIRMATION_REQUIRED',409);
 if(typeof b.preview_id!=='string'||!b.preview_id.match(/^[a-f0-9-]{36}$/))fail('PREVIEW_REQUIRED',400);
 const pre=await sql(env.DB,'SELECT * FROM admin_bulk_previews WHERE id=? AND admin_scope=? AND target_type=?',b.preview_id,actor.admin_scope,target).first();
 if(!pre||pre.consumed_at||pre.expires_at<=Date.now()/1000)fail('PREVIEW_EXPIRED',409);
 if(!allowed.includes(pre.action))fail('INVALID_BULK_ACTION');
 const ids=safeJson(pre.ids_json,[]),options=safeJson(pre.options_json,{});
 const rows=await Promise.all(ids.map(id=>readRow(env.DB,id)));
 if(rows.some(x=>!x)||await hash(JSON.stringify(rows))!==pre.fingerprint)fail('PREVIEW_STALE',409);
 const claimed=await sql(env.DB,'UPDATE admin_bulk_previews SET consumed_at=CURRENT_TIMESTAMP WHERE id=? AND consumed_at IS NULL AND expires_at>?',pre.id,Math.floor(Date.now()/1000)).run();
 if(claimed.meta?.changes!==1)fail('PREVIEW_ALREADY_USED',409);
 const results=[];
 for(let i=0;i<ids.length;i++){
  try{const r=await apply(rows[i],pre.action,options);
   await audit(env,request,actor,'bulk.'+pre.action,target,ids[i],rows[i],r);
   results.push({id:ids[i],status:'success'});
  }catch{results.push({id:ids[i],status:'failed'});}
 }
 await audit(env,request,actor,'bulk.execute',target,pre.id,{}, {status:pre.action});
 return {total:results.length,succeeded:results.filter(x=>x.status==='success').length,failed:results.filter(x=>x.status==='failed').length,results};
}

import {sql,fail,body,text} from './types.ts';
import {audit} from './auditService.ts';
export async function maintenance(env){try{return JSON.parse((await sql(env.DB,"SELECT value FROM system_settings WHERE key='maintenance_mode'").first())?.value||'"normal"');}catch(e){return /no such table/i.test(e?.message||'')?'normal':'maintenance';}}
export async function settingsRoute(request,env,actor){
 if(request.method==='GET'){
  const rows=await sql(env.DB,'SELECT key,value,updated_by,updated_at FROM system_settings').all();
  return {settings:rows.results.map(r=>({...r,value:JSON.parse(r.value)}))};
 }
 fail('METHOD_NOT_ALLOWED',405);
}
export async function setMaintenance(request,env,actor){
 const b=await body(request);
 if(!['normal','read_only','maintenance'].includes(b.mode))fail('INVALID_MAINTENANCE_MODE');
 const previous=await maintenance(env);
 await sql(env.DB,"UPDATE system_settings SET value=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE key='maintenance_mode'",JSON.stringify(b.mode),actor.admin_scope).run();
 const enabled=b.mode==='maintenance'?1:0;
 await sql(env.DB,"UPDATE feature_flags SET enabled=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE key='maintenance_mode'",enabled,actor.admin_scope).run();
 await audit(env,request,actor,'maintenance_mode.change','system_setting','maintenance_mode',{mode:previous},{mode:b.mode});
 try{await (env.ADMIN_FLAGS_KV||env.TRUST_CACHE)?.delete('admin:flag:maintenance_mode');}catch{}
 return {mode:b.mode,previous};
}

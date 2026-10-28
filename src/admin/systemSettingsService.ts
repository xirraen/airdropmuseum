import {sql,fail,body,text} from './types.ts';
import {audit} from './auditService.ts';
const SETTINGS={webhook_failure_threshold:{min:0.01,max:1},discovery_lag_warning_minutes:{min:15,max:1440}};
export async function maintenance(env){try{return JSON.parse((await sql(env.DB,"SELECT value FROM system_settings WHERE key='maintenance_mode'").first())?.value||'"normal"');}catch(e){return /no such table/i.test(e?.message||'')?'normal':'maintenance';}}
export async function settingsRoute(request,env,actor){
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path==='/api/admin/system-settings'){
  const rows=await sql(env.DB,'SELECT key,value,updated_by,updated_at FROM system_settings WHERE key IN (?,?,?)','maintenance_mode',...Object.keys(SETTINGS)).all();
  return {settings:rows.results.map(r=>({...r,value:JSON.parse(r.value)}))};
 }
 const key=path.split('/')[4];
 if(request.method!=='PUT'||!SETTINGS[key])fail('NOT_FOUND',404);
 const b=await body(request),v=b.value,lim=SETTINGS[key];
 if(typeof v!=='number'||!Number.isFinite(v)||v<lim.min||v>lim.max)fail('INVALID_SETTING_VALUE');
 const old=await sql(env.DB,'SELECT value FROM system_settings WHERE key=?',key).first();
 if(!old)fail('SETTING_NOT_FOUND',404);
 await sql(env.DB,'UPDATE system_settings SET value=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',JSON.stringify(v),actor.admin_scope,key).run();
 await audit(env,request,actor,'system_setting.update','system_setting',key,{status:old.value},{status:JSON.stringify(v)});
 return {key,value:v};
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

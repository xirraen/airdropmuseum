import {fail,sql,body,text,hash,safeJson,bool} from './types.ts';
import {audit} from './auditService.ts';
export const KNOWN_FLAGS=['discovery_automation_enabled','wallet_scan_enabled','public_api_enabled','partner_webhooks_enabled','telegram_alerts_enabled','maintenance_mode'];
export async function flagEnabled(env,key,scope=''){
 if(!KNOWN_FLAGS.includes(key))return false;
 const cache=env.ADMIN_FLAGS_KV||env.TRUST_CACHE;
 let row=null;
 try{const stored=await cache?.get('admin:flag:'+key,'json');if(stored&&typeof stored.enabled==='number')row=stored;}catch{}
 if(!row){row=await sql(env.DB,'SELECT * FROM feature_flags WHERE key=?',key).first();if(!row)return false;try{await cache?.put('admin:flag:'+key,JSON.stringify(row),{expirationTtl:60});}catch{}}
 if(!row.enabled)return false;
 const allowed=typeof row.allowed_scopes==='string'?safeJson(row.allowed_scopes,[]):row.allowed_scopes;
 if(allowed.length&&!allowed.includes(scope))return false;
 if(row.rollout_percentage===100)return true;
 const sum=await hash(key+':'+scope);
 return (parseInt(sum.slice(0,8),16)%100)<row.rollout_percentage;
}
export async function flagsRoute(request,env,actor){
 const db=env.DB,url=new URL(request.url),key=url.pathname.split('/')[4];
 if(request.method==='GET'){
  const rows=await sql(db,'SELECT * FROM feature_flags ORDER BY key').all();
  return {flags:rows.results.map(r=>({...r,enabled:!!r.enabled,allowed_scopes:safeJson(r.allowed_scopes,[])}))};
 }
 if(request.method!=='PUT'||!KNOWN_FLAGS.includes(key))fail('NOT_FOUND',404);
 if(key==='maintenance_mode')fail('USE_MAINTENANCE_ENDPOINT',409);
 const b=await body(request),old=await sql(db,'SELECT * FROM feature_flags WHERE key=?',key).first();
 if(!old)fail('NOT_FOUND',404);
 const enabled=b.enabled===undefined?old.enabled:bool(b.enabled);
 const rollout=b.rollout_percentage===undefined?old.rollout_percentage:Number(b.rollout_percentage);
 if(!Number.isInteger(rollout)||rollout<0||rollout>100)fail('INVALID_ROLLOUT');
 const scopes=b.allowed_scopes===undefined?safeJson(old.allowed_scopes,[]):b.allowed_scopes;
 if(!Array.isArray(scopes)||scopes.length>30||scopes.some(x=>typeof x!=='string'||!/^[-\w:.]{1,100}$/.test(x)))fail('INVALID_SCOPES');
 const description=b.description===undefined?old.description:text(b.description,300);
 await sql(db,'UPDATE feature_flags SET enabled=?,rollout_percentage=?,allowed_scopes=?,description=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',enabled,rollout,JSON.stringify(scopes),description,actor.admin_scope,key).run();
 await audit(env,request,actor,'feature_flag.update','feature_flag',key,old,{enabled,rollout_percentage:rollout,allowed_scopes:scopes});
 try{await (env.ADMIN_FLAGS_KV||env.TRUST_CACHE)?.delete('admin:flag:'+key);}catch{}
 return {key,enabled:!!enabled,rollout_percentage:rollout,allowed_scopes:scopes};
}

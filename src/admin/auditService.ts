import {hash,sql,select} from './types.ts';
const allow=['id','name','title','status','review_status','source_url','visibility','category','chain','project_name','classification','confidence_label','reviewer','role','enabled','tier','rate_limit_per_minute','daily_quota','expires_at','revoked_at','rollout_percentage','allowed_scopes','reason','mode','field','resolution_note','url','events','failure_count','updated_at'];
export function auditProjection(value){if(!value||typeof value!=='object')return {};return select(value,allow);}
export async function audit(env,request,actor,action,targetType,targetId,before={},after={}){
 const ip=await hash((env.ADMIN_AUDIT_PEPPER||'')+':'+(request.headers.get('CF-Connecting-IP')||'unknown'));
 const agent=await hash((env.ADMIN_AUDIT_PEPPER||'')+':'+(request.headers.get('User-Agent')||'unknown'));
 await sql(env.DB,'INSERT INTO admin_audit_log(id,admin_scope,action,target_type,target_id,before_state,after_state,ip_hash,user_agent_hash) VALUES(?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),actor.admin_scope,action,targetType,targetId,JSON.stringify(auditProjection(before)),JSON.stringify(auditProjection(after)),ip,agent).run();
}
export async function logs(db,params){
 const limit=Math.min(100,Math.max(1,Number(params.get('limit'))||30)),target=params.get('target_type')||'';
 const rows=await sql(db,'SELECT id,admin_scope,action,target_type,target_id,before_state,after_state,ip_hash,user_agent_hash,created_at FROM admin_audit_log WHERE (?="" OR target_type=?) ORDER BY created_at DESC,id DESC LIMIT ?',target,target,limit).all();
 return (rows.results||[]).map(x=>({...x,before_state:JSON.parse(x.before_state),after_state:JSON.parse(x.after_state)}));
}

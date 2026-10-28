import {platformUser} from '../platform-api.mjs';
import {fail,hash,sql,PERMISSIONS} from './types.ts';
const secureEqual=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
export async function adminAuth(request,env,permission='dashboard.read'){
 if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
 const match=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)am_session=([a-f0-9]{64})(?:;|$)/);
 if(!match)fail('ADMIN_LOGIN_REQUIRED',401);
 // The existing am_sessions store only SHA-256 digests and expire server-side.
 const user=await platformUser(request,env,false);
 if(!user)fail('ADMIN_LOGIN_REQUIRED',401);
 const row=await sql(env.DB,'SELECT admin_scope,role,enabled FROM admin_users WHERE admin_scope=?',user.id).first();
 if(!row||!row.enabled||!PERMISSIONS[row.role])fail('ADMIN_FORBIDDEN',403);
 if(!PERMISSIONS[row.role].includes('*')&&!PERMISSIONS[row.role].includes(permission))fail('PERMISSION_DENIED',403);
 const now=new URL(request.url),write=!['GET','HEAD'].includes(request.method);
 const expected=await hash('admin-csrf:v1:'+match[1]+':'+(env.ADMIN_CSRF_PEPPER||''));
 if(write){
  if(request.headers.get('Origin')!==now.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')fail('CSRF_ORIGIN_DENIED',403);
  const received=request.headers.get('X-CSRF-Token')||'';
  if(!/^[a-f0-9]{64}$/.test(received)||!secureEqual(received,expected))fail('CSRF_TOKEN_INVALID',403);
 }
 const limiterKey='admin:'+await hash(user.id+':'+(request.headers.get('CF-Connecting-IP')||''))+':'+Math.floor(Date.now()/60000)+':'+(write?'w':'r');
 const limited=await sql(env.DB,'INSERT INTO am_rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?',limiterKey,Math.floor(Date.now()/1000)+180,write?30:120).run();
 if(limited.meta?.changes!==1)fail('ADMIN_RATE_LIMIT',429);
 await sql(env.DB,"UPDATE admin_users SET last_login_at=CURRENT_TIMESTAMP WHERE admin_scope=? AND (last_login_at IS NULL OR last_login_at < datetime('now','-5 minutes'))",row.admin_scope).run();
 return {...row,csrf:expected};
}

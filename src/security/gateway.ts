import {requestContext,safeRoute} from '../observability/requestContext.ts';
import {logEvent,classifyError} from '../observability/logger.ts';
import {safeLegalPage} from '../legal/pages.ts';
import {healthResponse} from '../observability/health.ts';
const MAX_BODY=1048576;
export const SECURITY_HEADERS={
 'Strict-Transport-Security':'max-age=31536000',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'strict-origin-when-cross-origin',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()',
 'Content-Security-Policy':"default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com https://*.reown.com; upgrade-insecure-requests"
};
async function bodyWithinLimit(request){
 const contentLength=Number(request.headers.get('Content-Length'));
 if(!Number.isFinite(contentLength)||contentLength>MAX_BODY||contentLength<0)return false;
 if(['GET','HEAD','OPTIONS'].includes(request.method)||!request.body)return true;
 const reader=request.clone().body.getReader();
 let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)return true;size+=value.byteLength;if(size>MAX_BODY)return false;}}
 finally{await reader.cancel().catch(()=>{});}
}
function requireSecrets(env,route){
 if(env.REQUIRE_PRODUCTION_SECRETS!=='1')return;
 const needed=route.startsWith('/api/admin/')?['ADMIN_CSRF_PEPPER']:route.startsWith('/v1/')?['API_HASH_PEPPER']:[];
 if(route.startsWith('/v1/webhooks'))needed.push('WEBHOOK_MASTER_SECRET');
 for(const key of needed)if(typeof env[key]!=='string'||env[key].length<32)throw Error('RUNTIME_SECRET_MISSING');
}
async function rateLimit(request,env,route){
 const api=/^\/(api|v1)\//.test(route)||route==='/docs/api';
 if(!api)return true;
 // Existing /v1 API key quota remains authoritative; this gate additionally limits all public API routes by IP.
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const bytes=new TextEncoder().encode(ip+':'+route);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const key=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(env.PUBLIC_API_RATE_LIMITER){
  const result=await env.PUBLIC_API_RATE_LIMITER.limit({key});
  if(!result.success)return false;
 }else if(env.REQUIRE_RATE_LIMIT_BINDINGS==='1')throw Error('RATE_LIMIT_BINDING_REQUIRED');
 if(env.DB){
  const window=Math.floor(Date.now()/60000),countLimit=route.startsWith('/api/admin/')?60:route.startsWith('/api/me/')?60:120;
  const result=await env.DB.prepare('INSERT INTO am_rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?').bind('gateway:'+key+':'+window,Math.floor(Date.now()/1000)+180,countLimit).run();
  if(result.meta?.changes!==1)return false;
 }else if(env.REQUIRE_RATE_LIMIT_BINDINGS==='1'&&route!=='/api/health')throw Error('DATABASE_UNAVAILABLE');
 return true;
}
function safeError(code,status,request_id,extra={}){
 return Response.json({error:code,request_id},{status,headers:{'Cache-Control':'no-store',...extra}});
}
function isApiResponse(response){return (response.headers.get('Content-Type')||'').toLowerCase().includes('application/json');}
export async function withSecurity(request,env,ctx,next){
 const context=requestContext(request),url=new URL(request.url);
 let response;
 try{
  if(request.url.length>4096||url.search.length>2048)response=safeError('INVALID_REQUEST',400,context.request_id);
  else if(!await bodyWithinLimit(request))response=safeError('BODY_TOO_LARGE',413,context.request_id);
  else if((requireSecrets(env,context.route),false))response=safeError('SERVICE_UNAVAILABLE',503,context.request_id);
  else if((requireSecrets(env,context.route),!(await rateLimit(request,env,context.route))))response=safeError('RATE_LIMITED',429,context.request_id,{'Retry-After':'60'});
  else response=safeLegalPage(request)||await healthResponse(request,env)||await next();
 }catch(error){
  const error_class=classifyError(error);
  const status=error_class==='rate_limit'?503:503;
  logEvent({level:'error',event:'uncaught_error',request_id:context.request_id,component:'gateway',status:'failed',metadata:{route:context.route,error_class}});
  response=safeError('SERVICE_UNAVAILABLE',status,context.request_id);
 }
 if(response.status>=400&&isApiResponse(response)){
  try{
   const original=await response.clone().json();
   if(original&&typeof original==='object'&&!Array.isArray(original)&&!('request_id' in original)){
    const updated=JSON.stringify({...original,request_id:context.request_id});
    const headers=new Headers(response.headers);headers.delete('content-length');
    response=new Response(request.method==='HEAD'?null:updated,{status:response.status,headers});
   }
  }catch{}
 }
 const finalHeaders=new Headers(response.headers);
 for(const [key,value] of Object.entries(SECURITY_HEADERS))finalHeaders.set(key,value);
 // Keep explicit restrictive CSP on JSON and XML outputs.
 const contentType=finalHeaders.get('Content-Type')||'';
 if(/application\/(json|rss\+xml|xml)/.test(contentType))finalHeaders.set('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
 finalHeaders.set('X-Request-ID',context.request_id);
 const result=new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers:finalHeaders});
 const status=result.status;
 logEvent({event:'request_completed',level:status>=500?'error':status>=400?'warn':'info',request_id:context.request_id,component:'http',duration_ms:Date.now()-context.started,status:status>=500?'failed':status>=400?'error':'ok',metadata:{route:context.route,method:request.method,http_status:status}});
 if(status===401||status===403)logEvent({event:'auth_failed',level:'warn',request_id:context.request_id,component:'http',status:'unauthorized',metadata:{route:context.route,http_status:status}});
 if(status===429)logEvent({event:'rate_limited',level:'warn',request_id:context.request_id,component:'http',status:'limited',metadata:{route:context.route}});
 return result;
}

import {ApiError,DISCLAIMER,fail,json,cors,allowOrigin,method} from './types.ts';
import {adminKeys,principal} from './auth.ts';
import {checkRate,retryHeaders} from './rateLimit.ts';
import {campaignBySlug,listCampaigns,sources,timeline,etagResponse} from './campaignApi.ts';
import {feed} from './feedService.ts';
import {webhooksRoute} from './webhookService.ts';
import {OPENAPI,apiDocsPage} from './openapi.ts';
const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
export async function publicApiRoutes(request,env,ctx){
 const url=new URL(request.url),path=url.pathname,base={...headers,...cors(request,env)};
 try{
  if(path==='/docs/api'){method(request,'GET','HEAD');return new Response(request.method==='HEAD'?null:apiDocsPage,{headers:{...base,'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}});}
  if(path.startsWith('/api/admin/api-keys'))return await adminKeys(request,env);
  if(!path.startsWith('/v1/'))fail('NOT_FOUND',404);
  if(request.method==='OPTIONS'){
   if(!allowOrigin(request,env))fail('ORIGIN_FORBIDDEN',403);
   return new Response(null,{status:204,headers:base});
  }
  if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
  if(!(await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=8').first()))fail('PUBLIC_API_MIGRATION_REQUIRED',503);
  const auth=await principal(request,env),rate=await checkRate(request,env,auth),responseHeaders={...base,...rate};
  if(path==='/v1/openapi.json'){
   method(request,'GET','HEAD');
   return etagResponse({...OPENAPI,'x-disclaimer':DISCLAIMER},request,responseHeaders);
  }
  if(path==='/v1/campaigns'||path==='/v1/deadlines'||path==='/v1/snapshots'){
   method(request,'GET','HEAD');
   const kind=path==='/v1/campaigns'?null:path==='/v1/deadlines'?'deadlines':'snapshots';
   return etagResponse(await listCampaigns(env,url.searchParams,kind),request,responseHeaders);
  }
  const campaign=/^\/v1\/campaigns\/([a-zA-Z0-9_-]{1,160})(?:\/(sources|timeline))?$/.exec(path);
  if(campaign){
   method(request,'GET','HEAD');
   let result;
   if(campaign[2]==='sources')result=await sources(env,campaign[1]);
   else if(campaign[2]==='timeline')result=await timeline(env,campaign[1]);
   else result={campaign:(await campaignBySlug(env,campaign[1])).campaign,disclaimer:DISCLAIMER};
   return etagResponse(result,request,responseHeaders);
  }
  const rss=/^\/v1\/feeds\/(campaigns|deadlines)\.xml$/.exec(path);
  if(rss){
   method(request,'GET','HEAD');
   const xml=await feed(env,url.origin,rss[1]);
   return etagResponse(xml,request,{...responseHeaders,'Cache-Control':'public, max-age=300, stale-while-revalidate=300'},'application/rss+xml; charset=utf-8');
  }
  if(path==='/v1/webhooks'||/^\/v1\/webhooks\/[a-f0-9-]{36}$/.test(path)){
   const operation=await webhooksRoute(request,env,auth);
   return json(operation.body,operation.status,{...responseHeaders,'Cache-Control':'no-store'});
  }
  fail('NOT_FOUND',404);
 }catch(e){
  const status=e instanceof ApiError?e.status:e?.message==='LOGIN_REQUIRED'?401:500;
  const code=e instanceof ApiError?e.message:e?.message==='LOGIN_REQUIRED'?'ADMIN_AUTH_REQUIRED':'PUBLIC_API_UNAVAILABLE';
  return json({error:code,disclaimer:DISCLAIMER},status,{...base,...(status===429?{...retryHeaders,'X-RateLimit-Limit':'0','X-RateLimit-Reset':String(Math.ceil(Date.now()/60000)*60+60)}:{})});
 }
}

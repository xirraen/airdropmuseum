import html from './index.html';
import css from './style.css';
import js from './app.client';
// Public, first-party 180×180 PNG for the TON Connect wallet approval screen.
import iconBase64 from './tonconnect-icon.base64' with { type:'text' };
import {listCampaigns} from '../src/aggregator-store.mjs';
import {projectFromCampaign} from '../dist/catalog.js';
import {withSecurity} from '../src/security/gateway.ts';
import {maintenance} from '../src/admin/systemSettingsService.ts';
import {flushErasureLedger} from '../src/autopsy/privacyService.ts';
import {aggregatorQueue} from '../src/aggregator-jobs.mjs';
import {queueDiscovery} from '../src/discovery/scheduled.ts';
import {handlePartnerQueue} from '../src/publicApi/webhookService.ts';
import {sourceActivity,monitorOfficialSources} from './source-activity.mjs';
import {getTonWalletSnapshot} from './ton-wallet.mjs';

const assets=new Map([['/',[html,'text/html']],['/index.html',[html,'text/html']],['/mini.css',[css,'text/css']],['/mini.js',[js,'text/javascript']]]);
const manifest=JSON.stringify({url:'https://airdrop-museum.xirraen.workers.dev',name:'Airdrop Museum',iconUrl:'https://airdrop-museum.xirraen.workers.dev/tonconnect-icon.png'});
export default {
 scheduled(event,env,ctx){
  if(env.DB&&env.JOURNAL_ERASURE_LEDGER)ctx.waitUntil(flushErasureLedger(env));
  // Bounded six-hour official-source sweep; current Worker cron is every minute.
  const stamp=Number(event.scheduledTime);
  if(env.DB&&env.AGGREGATOR_MONITOR_SOURCES==='1'&&Number.isFinite(stamp)){
   const when=new Date(stamp);
   if(when.getUTCMinutes()===17&&when.getUTCHours()%6===0)
    ctx.waitUntil(monitorOfficialSources(env));
  }
 },
 queue(batch,env){
  if(batch.queue==='airdrop-museum-aggregator')return aggregatorQueue(batch,env);
  if(batch.queue.startsWith('airdrop-museum-partner-webhook'))return handlePartnerQueue(batch,env);
  return queueDiscovery(batch,env);
 },
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==='/tonconnect-manifest.json'||path==='/tonconnect-icon.png'){
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
   const isManifest=path.endsWith('.json');
   const data=isManifest?manifest:Uint8Array.from(atob(iconBase64),c=>c.charCodeAt(0));
   return new Response(request.method==='HEAD'?null:data,{headers:{
    'Content-Type':isManifest?'application/json; charset=utf-8':'image/png',
    'Access-Control-Allow-Origin':'*',
    'Cache-Control':isManifest?'public, max-age=300':'public, max-age=86400',
    'X-Content-Type-Options':'nosniff'
   }});
  }
  if(path==='/api/ton-wallet')return withSecurity(request,env,ctx,async()=>{
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
   if(await maintenance(env)==='maintenance')return Response.json({error:'MAINTENANCE'},{status:503});
   const address=new URL(request.url).searchParams.get('address');
   if(!address||address.length>85)return Response.json({error:'INVALID_TON_ADDRESS'},{status:400,headers:{'Cache-Control':'no-store'}});
   const cacheKey=new Request(new URL('/api/ton-wallet?address='+encodeURIComponent(address),request.url),{method:'GET'});
   const store=typeof caches!=='undefined'?caches.default:null;
   if(store){
    try{
     const cached=await store.match(cacheKey);
     if(cached)return new Response(request.method==='HEAD'?null:cached.body,{status:cached.status,headers:cached.headers});
    }catch{}
   }
   const result=await getTonWalletSnapshot(address);
   if(result.status!==200)return Response.json({error:result.error||'TON_DATA_UNAVAILABLE',upstream:result.upstream||undefined},{status:result.status||503,headers:{'Cache-Control':'no-store'}});
   const response=Response.json(result.data,{headers:{'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
   if(store)ctx.waitUntil(store.put(cacheKey,response.clone()).catch(()=>{}));
   return request.method==='HEAD'?new Response(null,{status:200,headers:response.headers}):response;
  });
  if(path==='/api/source-activity')return withSecurity(request,env,ctx,async()=>{
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
   if(await maintenance(env)==='maintenance')return Response.json({error:'MAINTENANCE'},{status:503});
   const payload=await sourceActivity(env.DB);
   return new Response(request.method==='HEAD'?null:JSON.stringify(payload),{
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
   });
  });
  if(path==='/api/projects'||path==='/api/health')return withSecurity(request,env,ctx,async()=>{
   if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
   if(path==='/api/health'){
    const ready=!!(await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=1').first());
    return Response.json({ok:ready,database:ready?'ready':'migration_required'},{status:ready?200:503});
   }
   if(await maintenance(env)==='maintenance')return Response.json({error:'MAINTENANCE'},{status:503});
   const projects=(await listCampaigns(env.DB)).map(projectFromCampaign).filter(Boolean);
   return Response.json({mode:'live',projects},{headers:{'Cache-Control':'no-store'}});
  });
  const asset=assets.get(path);
  if(!asset)return new Response(null,{status:410,headers:{'Cache-Control':'no-store'}});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  return new Response(request.method==='HEAD'?null:asset[0],{headers:{
   'Content-Type':asset[1]+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin',
   'Content-Security-Policy':"default-src 'self'; script-src 'self' https://telegram.org https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https: data:; connect-src 'self' https: wss:; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; form-action 'none'; object-src 'none'; base-uri 'none'"
  }});
 }
};

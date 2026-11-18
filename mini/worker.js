import html from './index.html';
import css from './style.css';
import js from './app.client';
// Reuse the already-vetted browser-only WalletConnect adapter; never expose legacy screens.
import walletConnectBundle from '../dist/walletconnect-bundle.js' with { type:'text' };
import {listCampaigns} from '../src/aggregator-store.mjs';
import {projectFromCampaign} from '../dist/catalog.js';
import {withSecurity} from '../src/security/gateway.ts';
import {maintenance} from '../src/admin/systemSettingsService.ts';
import {flushErasureLedger} from '../src/autopsy/privacyService.ts';
import {aggregatorQueue} from '../src/aggregator-jobs.mjs';
import {queueDiscovery} from '../src/discovery/scheduled.ts';
import {handlePartnerQueue} from '../src/publicApi/webhookService.ts';

const assets=new Map([['/',[html,'text/html']],['/index.html',[html,'text/html']],['/mini.css',[css,'text/css']],['/mini.js',[js,'text/javascript']],['/mini-wallet.js',[walletConnectBundle,'text/javascript']]]);
export default {
 scheduled(event,env,ctx){
  if(env.DB&&env.JOURNAL_ERASURE_LEDGER)ctx.waitUntil(flushErasureLedger(env));
 },
 queue(batch,env){
  if(batch.queue==='airdrop-museum-aggregator')return aggregatorQueue(batch,env);
  if(batch.queue.startsWith('airdrop-museum-partner-webhook'))return handlePartnerQueue(batch,env);
  return queueDiscovery(batch,env);
 },
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==='/api/walletconnect/config'&&!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
  if(path==='/api/walletconnect/config')return withSecurity(request,env,ctx,async()=>{
   // Reown project IDs are public client identifiers, never credentials or wallet secrets.
   const id=typeof env.WALLETCONNECT_PROJECT_ID==='string'?env.WALLETCONNECT_PROJECT_ID.trim():'';
   const valid=/^[a-fA-F0-9]{32}$/.test(id);
   const payload=valid?{enabled:true,projectId:id}:{enabled:false};
   return new Response(request.method==='HEAD'?null:JSON.stringify(payload),{status:valid?200:503,
    headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
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
   'Content-Security-Policy':"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; connect-src 'self' https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com wss://*.walletconnect.com wss://*.walletconnect.org wss://*.reown.com; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; form-action 'none'; object-src 'none'; base-uri 'none'"
  }});
 }
};

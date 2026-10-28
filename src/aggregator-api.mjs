import {questRoutes} from './aggregator/questRoutes.mjs';
import {portfolioRoutes} from './aggregator/portfolioRoutes.mjs';
import {verifyTelegram} from './auth.mjs';
import {address,safeLabel,iso,effectiveStatus,ALERT_TYPES,STATUSES,CATEGORIES,importWatchlist,exportWatchlist} from '../dist/aggregator-core.js';
import {allowed,portfolio} from './aggregator-providers.mjs';
import {statement as s,listCampaigns,getCampaign,putCampaign,matches} from './aggregator-store.mjs';
import {scan,digest,discover,enqueueAlert} from './aggregator-jobs.mjs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
async function input(request){if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);if(Number(request.headers.get('Content-Length'))>65536)fail('BODY_TOO_LARGE',413);const reader=request.body?.getReader();if(!reader)fail('JSON_REQUIRED');let size=0,text='';const decoder=new TextDecoder();for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>65536){await reader.cancel();fail('BODY_TOO_LARGE',413)}text+=decoder.decode(r.value,{stream:true})}try{return JSON.parse(text+decoder.decode())}catch{fail('INVALID_JSON')}}
async function rate(env,key,max,period=60){const now=Math.floor(Date.now()/1000),slot=Math.floor(now/period);const result=await s(env.DB,'INSERT INTO aggregator_rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?',key+':'+slot,now+period*2,max).run();if(!result.meta.changes)fail('RATE_LIMITED',429);}
async function admin(request,env){const token=request.headers.get('Authorization')||'';if(!env.AGGREGATOR_ADMIN_TOKEN||await digest(token)!==await digest('Bearer '+env.AGGREGATOR_ADMIN_TOKEN))fail('ADMIN_REQUIRED',403);}
async function user(request,env){try{const u=await verifyTelegram(request.headers.get('X-Telegram-Init-Data'),env.TELEGRAM_BOT_TOKEN);return 'tg:'+u.id}catch{fail('TELEGRAM_VERIFICATION_REQUIRED',401)}}
function filters(b={}){const out={};for(const k of ['chain','status','category','reward_type','kyc_requirement','deadline_before','snapshot_before','max_gas'])if(b[k]!==undefined&&b[k]!==''){if(typeof b[k]!=='string'&&typeof b[k]!=='number')fail('INVALID_FILTER');out[k]=String(b[k]).slice(0,80)}if(out.status&&!STATUSES.includes(out.status)||out.category&&!CATEGORIES.includes(out.category))fail('INVALID_FILTER');for(const k of ['deadline_before','snapshot_before'])if(out[k]&&!Number.isFinite(Date.parse(out[k])))fail('INVALID_FILTER');if(out.max_gas!==undefined&&(!Number.isFinite(Number(out.max_gas))||Number(out.max_gas)<0))fail('INVALID_FILTER');return out;}
export async function aggregatorApi(request,env={},headers={}){
 const url=new URL(request.url),path=url.pathname.slice('/api/aggregator'.length),method=request.method;
 const json=(value,status=200,extra={})=>new Response(method==='HEAD'?null:JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});
 try{
 if(!env.DB)return json({error:'DATABASE_UNAVAILABLE'},503);
 if(method!=='GET'&&method!=='HEAD'){const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)fail('ORIGIN_NOT_ALLOWED',403);}
 const ip=await digest(request.headers.get('CF-Connecting-IP')||'unknown');await rate(env,'request:'+ip,120);const questResult=await questRoutes(request,env,headers);if(questResult)return questResult;const portfolioResult=await portfolioRoutes(request,env,headers);if(portfolioResult)return portfolioResult;
 if(path==='/capabilities'&&['GET','HEAD'].includes(method))return json({version:'2.0',address_only:true,local_default:true,telegram_sync:!!env.TELEGRAM_BOT_TOKEN,queue:!!env.AGGREGATOR_QUEUE,discovery_configured:!!env.AGGREGATOR_DISCOVERY_URLS,rpc_chains:Object.keys(env).filter(k=>/^RPC_(\d+|SOLANA)$/.test(k)).map(k=>k==='RPC_SOLANA'?'solana':'eip155:'+k.slice(4))});
 if(path==='/campaigns'&&['GET','HEAD'].includes(method)){const f=filters(Object.fromEntries(url.searchParams));return json({campaigns:(await listCampaigns(env.DB)).filter(c=>matches(c,f)).map(c=>({...c,effective_status:effectiveStatus(c)})),notice:'Listing bukan jaminan eligibility atau keamanan.'},200,{'Cache-Control':'public, max-age=60'});}
 const detail=path.match(/^\/campaigns\/([a-z0-9-]{1,80})$/);
 if(detail&&['GET','HEAD'].includes(method)){const c=await getCampaign(env.DB,detail[1]);if(!c)fail('CAMPAIGN_NOT_FOUND',404);const timeline=(await s(env.DB,'SELECT source_url,source_type,captured_at,note,verified_by,event_type FROM campaign_sources WHERE campaign_id=? ORDER BY captured_at DESC LIMIT 200',c.id).all()).results;return json({campaign:{...c,effective_status:effectiveStatus(c)},timeline});}
 if(path==='/scan'&&method==='POST'){
  await rate(env,'scan:'+ip,10);const b=await input(request),w={chain:b.chain,address:address(b.address,b.chain)},c=await getCampaign(env.DB,String(b.campaign_id||''));if(!c||!c.chain.includes(w.chain)&&!c.chain.includes('offchain'))fail('CAMPAIGN_CHAIN_MISMATCH');
  const [walletPortfolio,result]=await Promise.all([portfolio(env,w),scan(env,w,c)]);return json({portfolio:walletPortfolio,result,persisted:false});
 }
 if(path==='/admin/campaigns'&&method==='POST'){await admin(request,env);const b=await input(request);for(const u of b.official_urls||[])allowed(u,env);const r=await putCampaign(env.DB,b,'admin_review');for(const t of r.events)await enqueueAlert(env,r.campaign,t);return json(r,201);}
 if(path==='/admin/discover'&&method==='POST'){await admin(request,env);return json(await discover(env));}
 const known=['/wallets','/preferences','/results','/quests','/alerts','/export','/import','/privacy'];
 const remove=path.match(/^\/wallets\/([a-f0-9-]{36})$/);
 if(!known.includes(path)&&!remove)fail('NOT_FOUND',404);
 const uid=await user(request,env);await rate(env,'user:'+uid,60);
 if(path==='/wallets'&&method==='GET')return json({wallets:(await s(env.DB,'SELECT id,chain,address,label,created_at,last_scan_at FROM wallet_watchlist WHERE user_id=? ORDER BY created_at',uid).all()).results});
 if(path==='/wallets'&&method==='POST'){
  const b=await input(request);if(b.consent_sync!==true)fail('EXPLICIT_SYNC_CONSENT_REQUIRED');const addr=address(b.address,b.chain),label=safeLabel(b.label||'');const n=await s(env.DB,'SELECT count(*) AS n FROM wallet_watchlist WHERE user_id=?',uid).first();if(n.n>=100)fail('WATCHLIST_LIMIT');
  const id=crypto.randomUUID();await s(env.DB,'INSERT INTO wallet_watchlist(id,user_id,chain,address,label,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,chain,address) DO UPDATE SET label=excluded.label',id,uid,b.chain,addr,label,iso()).run();return json({saved:true},201);
 }
 if(remove&&method==='DELETE'){await s(env.DB,'DELETE FROM wallet_watchlist WHERE id=? AND user_id=?',remove[1],uid).run();return json({deleted:true});}
 if(path==='/preferences'&&method==='GET'){
  const p=await s(env.DB,'SELECT * FROM alert_preferences WHERE user_id=?',uid).first();return json(p?{enabled:!!p.enabled,filters:JSON.parse(p.filters),event_types:JSON.parse(p.event_types)}:{enabled:false,filters:{},event_types:[]});
 }
 if(path==='/preferences'&&method==='PUT'){
  const b=await input(request);if(b.enabled===true&&b.consent_alerts!==true)fail('ALERT_CONSENT_REQUIRED');const events=Array.isArray(b.event_types)?[...new Set(b.event_types)]:ALERT_TYPES;if(events.some(t=>!ALERT_TYPES.includes(t)))fail('INVALID_ALERT_TYPE');
  await s(env.DB,'INSERT INTO alert_preferences(user_id,enabled,filters,event_types,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,filters=excluded.filters,event_types=excluded.event_types,updated_at=excluded.updated_at',uid,b.enabled===true?1:0,JSON.stringify(filters(b.filters)),JSON.stringify(events),iso()).run();
  if(!b.enabled)await s(env.DB,"UPDATE alerts SET status='cancelled' WHERE user_id=? AND status='pending'",uid).run();return json({saved:true});
 }
 if(path==='/results'&&method==='GET'){
  const walletId=url.searchParams.get('wallet_id');if(!await s(env.DB,'SELECT id FROM wallet_watchlist WHERE id=? AND user_id=?',walletId,uid).first())fail('NOT_FOUND',404);
  const read=async(t,col='evaluated_at')=>(await s(env.DB,`SELECT * FROM ${t} WHERE wallet_id=? ORDER BY ${col} DESC LIMIT 100`,walletId).all()).results;
  return json({snapshots:await read('wallet_snapshots','scanned_at'),eligibility:await read('eligibility_results'),claims:await read('claim_checks','checked_at'),quests:await read('quest_progress','updated_at')});
 }
 if(path==='/quests'&&method==='PUT'){
  const b=await input(request);if(!await s(env.DB,'SELECT id FROM wallet_watchlist WHERE id=? AND user_id=?',b.wallet_id,uid).first())fail('NOT_FOUND',404);const c=await getCampaign(env.DB,b.campaign_id),r=c?.eligibility_rules.find(r=>r.id===b.quest_id&&['social_task','custom_manual_task','kyc_or_geo_restriction'].includes(r.rule_type));if(!r)fail('INVALID_MANUAL_QUEST');
  // Self-reported completion cannot become verified eligibility or verified points.
  await s(env.DB,"INSERT INTO quest_progress(user_id,wallet_id,campaign_id,quest_id,status,verified,updated_at) VALUES(?,?,?,?,'manual_check',0,?) ON CONFLICT(wallet_id,campaign_id,quest_id) DO UPDATE SET status='manual_check',verified=0,updated_at=excluded.updated_at",uid,b.wallet_id,c.id,r.id,iso()).run();return json({status:'manual_check',verified:false});
 }
 if(path==='/alerts'&&method==='GET')return json({alerts:(await s(env.DB,'SELECT id,event_type,payload,status,created_at,sent_at FROM alerts WHERE user_id=? ORDER BY created_at DESC LIMIT 100',uid).all()).results});
 if(path==='/export'&&method==='GET'){const w=(await s(env.DB,'SELECT chain,address,label FROM wallet_watchlist WHERE user_id=?',uid).all()).results;return json(exportWatchlist(w));}
 if(path==='/import'&&method==='POST'){
  const b=await input(request);if(b.consent_sync!==true)fail('EXPLICIT_SYNC_CONSENT_REQUIRED');const data=importWatchlist(b.data);const count=(await s(env.DB,'SELECT count(*) AS n FROM wallet_watchlist WHERE user_id=?',uid).first()).n;if(count+data.wallets.length>100)fail('WATCHLIST_LIMIT');
  if(data.wallets.length)await env.DB.batch(data.wallets.map(w=>s(env.DB,'INSERT INTO wallet_watchlist(id,user_id,chain,address,label,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,chain,address) DO UPDATE SET label=excluded.label',crypto.randomUUID(),uid,w.chain,w.address,w.label,iso())));return json({imported:data.wallets.length,legacy_preserved_locally:!!data.legacy});
 }
 if(path==='/privacy'&&method==='DELETE'){
  const v9=await s(env.DB,'SELECT version FROM am_core_schema WHERE version=9').first();
  if(v9){const copies=(await s(env.DB,'SELECT object_key FROM backup_metadata WHERE user_scope=?',uid).all()).results;if(copies.length&&!env.AGGREGATOR_BACKUP_BUCKET)fail('BACKUP_STORAGE_UNAVAILABLE',503);for(const b of copies)await env.AGGREGATOR_BACKUP_BUCKET.delete(b.object_key);await env.DB.batch([s(env.DB,'DELETE FROM backup_metadata WHERE user_scope=?',uid),s(env.DB,'DELETE FROM user_portfolio_snapshots WHERE user_scope=?',uid),s(env.DB,'DELETE FROM portfolio_export_jobs WHERE user_scope=?',uid),s(env.DB,'DELETE FROM weekly_report_deliveries WHERE user_scope=?',uid),s(env.DB,'DELETE FROM user_campaign_subscriptions WHERE user_scope=?',uid)]);}
  const v8=await s(env.DB,'SELECT version FROM am_core_schema WHERE version=8').first();await env.DB.batch([...(v8?[s(env.DB,'DELETE FROM user_quest_progress WHERE user_scope=?',uid),s(env.DB,'DELETE FROM user_points_ledger WHERE user_scope=?',uid)]:[]),s(env.DB,'DELETE FROM wallet_watchlist WHERE user_id=?',uid),s(env.DB,'DELETE FROM alert_preferences WHERE user_id=?',uid)]);return json({deleted:true});
 }
 return json({error:'METHOD_NOT_ALLOWED'},405);
 }catch(e){const status=e.status||(e.message==='UNAUTHORIZED'?401:/^(INVALID_|OFFICIAL_|DUPLICATE_|CLAIM_ENDPOINT_|SOURCE_NOT_|WATCHLIST_)/.test(e.message)?400:503);return json({error:status===503?'AGGREGATOR_UNAVAILABLE':e.message},status,status===429?{'Retry-After':'60'}:{});}
}

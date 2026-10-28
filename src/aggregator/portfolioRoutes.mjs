import {aggregatorUser,aggregatorAdmin} from './auth.mjs';
import {followCampaign,unfollowCampaign} from './decisionGuard.mjs';
import {verifyTelegram} from '../auth.mjs';
import {digest} from '../aggregator-jobs.mjs';
import {portfolioDashboard,portfolioSummary,deadlines,chainExposure,riskReview} from './portfolioService.mjs';
import {exportPortfolio} from './exportService.mjs';
import {createBackup,getBackup,restoreBackup,history,MAX_BACKUP_BYTES} from './backupService.mjs';
const q=(db,sql,...a)=>db.prepare(sql).bind(...a);
const err=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const user=aggregatorUser;
async function limitBody(req,max){if(!req.headers.get('Content-Type')?.startsWith('application/json'))err('JSON_REQUIRED',415);if(Number(req.headers.get('Content-Length'))>max)err('BODY_TOO_LARGE',413);const reader=req.body?.getReader();if(!reader)err('JSON_REQUIRED');const chunks=[];let length=0;for(;;){const c=await reader.read();if(c.done)break;length+=c.value.byteLength;if(length>max){await reader.cancel();err('BODY_TOO_LARGE',413)}chunks.push(c.value);}const a=new Uint8Array(length);let at=0;for(const c of chunks){a.set(c,at);at+=c.length}let data;try{data=JSON.parse(new TextDecoder().decode(a))}catch{err('INVALID_JSON')}if(!data||typeof data!=='object'||Array.isArray(data))err('INVALID_INPUT');return data;}
function page(url){const n=(key,defaultValue,max)=>{const x=url.searchParams.get(key);if(x===null)return defaultValue;if(!/^\d+$/.test(x)||Number(x)>max)err('INVALID_PAGINATION');return Number(x)};const limit=n('limit',100,500);if(limit<1)err('INVALID_PAGINATION');return {limit,offset:n('offset',0,1000000)};}
async function rate(db,scope,type,max,period){const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/period),key='sprint5:'+type+':'+scope+':'+bucket;const r=await q(db,'INSERT INTO aggregator_rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?',key,now+period*2,max).run();if(!r.meta.changes)err('RATE_LIMITED',429);}
export async function portfolioRoutes(request,env,headers={}){
 const url=new URL(request.url),path=url.pathname.slice('/api/aggregator'.length),method=request.method;
 if(!(/^\/portfolio(?:\/|$)/.test(path)||/^\/export\/(markdown|csv|json)$/.test(path)||/^\/backup(?:\/|$)/.test(path)||path==='/restore'))return null;
 const response=(data,status=200,extra={})=>new Response(method==='HEAD'?null:JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',...extra}});
 try{
  if(!env.DB)return response({error:'DATABASE_UNAVAILABLE'},503);
  if(!['GET','HEAD'].includes(method)&&request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)err('ORIGIN_NOT_ALLOWED',403);
  const pageSpec=page(url);
  const isServerRead=path==='/backup/server-history'||(/^\/backup\/[a-f0-9-]{36}$/.test(path)&&url.searchParams.get('server')==='true');
  if(isServerRead)await aggregatorAdmin(request,env,'backup.read','backup.read',path);
  const scope=isServerRead?null:await user(request,env);
  if(scope)await rate(env.DB,scope,'requests',120,60);
  if(path==='/portfolio'&&['GET','HEAD'].includes(method))return response(await portfolioDashboard(env.DB,scope));
  if(path==='/portfolio/summary'&&['GET','HEAD'].includes(method))return response(await portfolioSummary(env.DB,scope));
  if(path==='/portfolio/deadlines'&&['GET','HEAD'].includes(method))return response(await deadlines(env.DB,scope,pageSpec));
  if(path==='/portfolio/chain-exposure'&&['GET','HEAD'].includes(method))return response(await chainExposure(env.DB,scope));
  if(path==='/portfolio/risk-review'&&['GET','HEAD'].includes(method))return response(await riskReview(env.DB,scope,pageSpec));
  if(path==='/portfolio/subscriptions'&&method==='GET')return response({items:(await q(env.DB,`SELECT s.campaign_id,s.updated_at,CASE WHEN EXISTS(SELECT 1 FROM campaign_registry_links l JOIN decision_entries d ON d.campaign_id=l.canonical_id JOIN claim_autopsies a ON a.aggregate_id=d.aggregate_id WHERE l.aggregator_id=s.campaign_id AND d.user_scope=s.user_scope AND a.status!='cancelled') THEN 'ready' ELSE 'decision_required' END AS decision_status FROM user_campaign_subscriptions s WHERE s.user_scope=? ORDER BY updated_at DESC LIMIT ? OFFSET ?`,scope,pageSpec.limit,pageSpec.offset).all()).results});
  if(path==='/portfolio/subscriptions'&&method==='POST'){
   const body=await limitBody(request,4096),c=await q(env.DB,'SELECT id FROM campaigns WHERE id=? OR slug=?',body.campaign_id,body.campaign_id).first();
   if(!c)err('CAMPAIGN_NOT_FOUND',404);
   await followCampaign(env.DB,scope,c.id);
   await q(env.DB,'DELETE FROM user_portfolio_snapshots WHERE user_scope=?',scope).run();
   return response({saved:true},201);
  }
  const sub=path.match(/^\/portfolio\/subscriptions\/([a-z0-9-]{1,120})$/);
  if(sub&&method==='DELETE'){
   await unfollowCampaign(env.DB,scope,sub[1]);await q(env.DB,'DELETE FROM user_portfolio_snapshots WHERE user_scope=?',scope).run();return response({deleted:true});
  }
  if(path==='/portfolio/weekly-preferences'&&method==='GET'){
   const p=await q(env.DB,'SELECT enabled,weekly_enabled,weekly_timezone FROM alert_preferences WHERE user_id=?',scope).first();
   return response({alerts_enabled:!!p?.enabled,weekly_enabled:!!p?.weekly_enabled,timezone:p?.weekly_timezone||'UTC'});
  }
  if(path==='/portfolio/weekly-preferences'&&method==='PUT'){
   const p=await q(env.DB,'SELECT enabled FROM alert_preferences WHERE user_id=?',scope).first();if(!p?.enabled)err('TELEGRAM_ALERT_CONSENT_REQUIRED',403);
   const b=await limitBody(request,2048),enabled=b.weekly_enabled===true?1:b.weekly_enabled===false?0:err('INVALID_WEEKLY_PREFERENCE');
   if(typeof b.timezone!=='string'||b.timezone.length>80)err('INVALID_TIMEZONE');
   try{new Intl.DateTimeFormat('en-US',{timeZone:b.timezone})}catch{err('INVALID_TIMEZONE')}
   await q(env.DB,'UPDATE alert_preferences SET weekly_enabled=?,weekly_timezone=?,updated_at=? WHERE user_id=?',enabled,b.timezone,new Date().toISOString(),scope).run();
   return response({saved:true,weekly_enabled:!!enabled,timezone:b.timezone});
  }
  const exportMatch=path.match(/^\/export\/(markdown|csv|json)$/);
  if(exportMatch&&['GET','HEAD'].includes(method)){await rate(env.DB,scope,'exports',10,60);const output=await exportPortfolio(env.DB,scope,exportMatch[1],pageSpec);
   await q(env.DB,"INSERT INTO portfolio_export_jobs(id,user_scope,format,status,offset,row_count,created_at,completed_at) VALUES(?,?,?,'completed',?,?,?,?)",crypto.randomUUID(),scope,exportMatch[1],pageSpec.offset,pageSpec.limit,new Date().toISOString(),new Date().toISOString()).run();
   return new Response(method==='HEAD'?null:output.body,{status:output.status,headers:{...headers,...Object.fromEntries(output.headers)}});}
  if(path==='/backup'&&method==='POST'){await rate(env.DB,scope,'backups',3,3600);return response(await createBackup(env,scope),201);}
  if(path==='/backup/history'&&method==='GET')return response(await history(env,scope,pageSpec));
  if(path==='/backup/server-history'&&method==='GET'){if(!isServerRead)err('ADMIN_REQUIRED',403);return response(await history(env,null,{...pageSpec,admin:true}));}
  const match=path.match(/^\/backup\/([a-f0-9-]{36})$/);
  if(match&&['GET','HEAD'].includes(method)){
   const envelope=await getBackup(env,scope,match[1],{admin:isServerRead});
   return response(envelope,200,{'Content-Disposition':'attachment; filename="airdrop-museum-backup.json"'});
  }
  if(path==='/restore'&&method==='POST'){await rate(env.DB,scope,'restores',3,3600);const body=await limitBody(request,MAX_BACKUP_BYTES);return response(await restoreBackup(env,scope,body));}
  return response({error:'METHOD_NOT_ALLOWED'},405,{Allow:'GET, HEAD, POST, PUT, DELETE'});
 }catch(e){const status=Number.isInteger(e.status)&&e.status>=400&&e.status<500?e.status:503;return response({error:status===503?'PORTFOLIO_UNAVAILABLE':e.message},status,status===429?{'Retry-After':'60'}:{});}
}

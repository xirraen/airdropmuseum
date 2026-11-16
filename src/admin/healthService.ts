import {sql} from './types.ts';
const check=(configured,healthy)=>!configured?'degraded':healthy?'healthy':'unhealthy';
export async function health(env){
 const checks={},start=Date.now();
 const config=await sql(env.DB,"SELECT key,value FROM system_settings WHERE key IN ('webhook_failure_threshold','discovery_lag_warning_minutes')").all().catch(()=>({results:[]}));
 const configured=Object.fromEntries((config.results||[]).map(r=>[r.key,Number(r.value)]));
 try{await sql(env.DB,'SELECT 1').first();checks.d1='healthy';}catch{checks.d1='unhealthy';}
 const d1LatencyMs=Date.now()-start;
 const kv=env.ADMIN_FLAGS_KV||env.TRUST_CACHE;
 try{if(!kv){checks.kv='degraded';}else{await kv.get('admin:health-probe');checks.kv='healthy';}}catch{checks.kv='unhealthy';}
 checks.queue=check(!!(env.DISCOVERY_QUEUE&&env.PARTNER_WEBHOOK_QUEUE),true);
 checks.telegram=check(!!env.TELEGRAM_BOT_TOKEN,true);
 checks.etherscan=check(!!env.ETHERSCAN_API_KEY,true);
 const discovery={sources_total:0,sources_enabled:0,sources_recent:0,sources_with_errors:0,pending_review:0,last_successful_fetch:null,last_run_at:null,last_run_status:null,reason:'DATABASE_UNAVAILABLE'};
 try{
  const configuredLag=configured.discovery_lag_warning_minutes;
  const lagMinutes=Number.isFinite(configuredLag)&&configuredLag>=15&&configuredLag<=1440?configuredLag:240;
  const row=await sql(env.DB,`SELECT
   COUNT(*) AS total,
   COALESCE(SUM(CASE WHEN enabled=1 THEN 1 ELSE 0 END),0) AS enabled,
   COALESCE(SUM(CASE WHEN enabled=1 AND last_error IS NOT NULL THEN 1 ELSE 0 END),0) AS errors,
   COALESCE(SUM(CASE WHEN enabled=1 AND last_error IS NULL AND last_fetched_at>=datetime('now',?) THEN 1 ELSE 0 END),0) AS recent,
   MAX(CASE WHEN enabled=1 AND last_error IS NULL THEN last_fetched_at END) AS last_success,
   (SELECT COUNT(*) FROM discovery_items WHERE status='pending_review') AS pending
   FROM discovery_sources`,'-'+lagMinutes+' minutes').first();
  discovery.sources_total=Number(row?.total||0);
  discovery.sources_enabled=Number(row?.enabled||0);
  discovery.sources_recent=Number(row?.recent||0);
  discovery.sources_with_errors=Number(row?.errors||0);
  discovery.pending_review=Number(row?.pending||0);
  discovery.last_successful_fetch=row?.last_success||null;
  discovery.reason=!discovery.sources_total?'NO_SOURCES':!discovery.sources_enabled?'NO_ACTIVE_SOURCES':
   discovery.sources_with_errors?'FETCH_ERRORS':discovery.sources_recent<discovery.sources_enabled?'SOURCE_STALE':'READY';
  // A recently blocked cron is distinct from a healthy idle cron with zero sources.
  try{
   const run=await sql(env.DB,"SELECT status,created_at FROM operational_events WHERE event_type='discovery_run' ORDER BY created_at DESC,rowid DESC LIMIT 1").first();
   discovery.last_run_at=run?.created_at||null;
   discovery.last_run_status=run?.status||null;
   if(discovery.sources_enabled&&run?.status==='blocked')discovery.reason='SCHEDULER_BLOCKED';
  }catch{/* A legacy schema without telemetry remains readable. */}
  checks.discovery=discovery.reason==='READY'?'healthy':'degraded';
 }catch{checks.discovery='degraded';}
 try{
  const r=await sql(env.DB,"SELECT SUM(CASE WHEN status IN ('dead','retrying') THEN 1 ELSE 0 END) bad,COUNT(*) total FROM webhook_deliveries WHERE created_at>=datetime('now','-24 hours')").first();
  checks.webhooks=r?.total&&r.bad/r.total>(configured.webhook_failure_threshold||0.1)?'degraded':'healthy';
 }catch{checks.webhooks='degraded';}
 try{
  const r=await sql(env.DB,"SELECT MAX(created_at) last FROM operational_events WHERE event_type='cron_run'").first();
  checks.cron=r?.last&&Date.now()-Date.parse(r.last.replace(' ','T')+'Z')<7200000?'healthy':'degraded';
 }catch{checks.cron='degraded';}
 const values=Object.values(checks),status=values.includes('unhealthy')?'unhealthy':values.includes('degraded')?'degraded':'healthy';
 return {status,checks,discovery,d1_latency_ms:d1LatencyMs,checked_at:new Date().toISOString()};
}

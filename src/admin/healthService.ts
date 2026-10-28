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
 try{
  const row=await sql(env.DB,'SELECT MAX(last_fetched_at) AS last FROM discovery_sources WHERE enabled=1').first();
  checks.discovery=row?.last&&Date.now()-Date.parse(row.last.replace(' ','T')+'Z')<(configured.discovery_lag_warning_minutes||240)*60000?'healthy':'degraded';
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
 return {status,checks,d1_latency_ms:d1LatencyMs,checked_at:new Date().toISOString()};
}

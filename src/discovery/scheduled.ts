import {fetchDiscoverySource,consumeDiscoveryBatch} from './ingestService.ts';

// Operational events intentionally contain only aggregate counts: no feed URLs,
// Telegram identifiers, wallet addresses, or raw provider error messages.
async function recordDiscoveryRun(env,{status,scanned,queued,failed,started}){
 try{
  if(!await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=9').first())return;
  const duration=Math.min(2147483647,Math.max(0,Date.now()-started));
  const add=async(eventType,eventStatus,count)=>env.DB.prepare(
   'INSERT INTO operational_events(id,event_type,status,duration_ms,count) VALUES(?,?,?,?,?)'
  ).bind(crypto.randomUUID(),eventType,eventStatus,duration,count).run();
  await add('discovery_run',status,scanned);
  if(queued>0)await add('discovery_queued','ok',queued);
  if(failed>0)await add('discovery_fetch_failed','failed',failed);
 }catch{/* Telemetry must never interrupt the independent cron jobs. */}
}
export async function scheduledDiscovery(env){
 const started=Date.now(),summary={scanned:0,queued:0,failed:0,not_modified:0,status:'idle'};
 if(!env.DB)return {...summary,status:'blocked'};
 if(!env.DISCOVERY_QUEUE){
  summary.status='blocked';
  await recordDiscoveryRun(env,{...summary,started});
  return summary;
 }
 const ready=await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=6').first();
 if(!ready){
  summary.status='blocked';
  await recordDiscoveryRun(env,{...summary,started});
  return summary;
 }
 const result=await env.DB.prepare("SELECT * FROM discovery_sources WHERE enabled=1 AND (last_fetched_at IS NULL OR (feed_url IN ('https://api.cryptorank.io/v2/drophunting/activities?limit=100','https://airdrops.io/feed/') AND last_fetched_at<=datetime('now','-6 hours')) OR (feed_url IN ('https://api.rootdata.com/open/get_event','https://api.rootdata.com/open/get_fac','https://api.llama.fi/protocols') AND last_fetched_at<=datetime('now','-24 hours')) OR (feed_url NOT IN ('https://api.cryptorank.io/v2/drophunting/activities?limit=100','https://airdrops.io/feed/','https://api.rootdata.com/open/get_event','https://api.rootdata.com/open/get_fac','https://api.llama.fi/protocols') AND last_fetched_at<=datetime('now','-25 minutes'))) ORDER BY COALESCE(last_fetched_at,'') ASC LIMIT 20").all();
 const rows=result.results||[];
 summary.scanned=rows.length;
 for(let i=0;i<rows.length;i+=3){
  const outcomes=await Promise.all(rows.slice(i,i+3).map(async row=>{
   try{return await fetchDiscoverySource(env,row);}
   catch{
    // A malformed historic source must not starve other healthy feeds.
    try{await env.DB.prepare("UPDATE discovery_sources SET last_fetched_at=CURRENT_TIMESTAMP,last_error='DISCOVERY_FETCH_FAILED',error_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND feed_url=? AND enabled=1").bind(row.id,row.feed_url).run();}catch{}
    return {queued:0,error:'DISCOVERY_FETCH_FAILED'};
   }
  }));
  for(const outcome of outcomes){
   summary.queued+=Number(outcome.queued)||0;
   if(outcome.not_modified)summary.not_modified++;
   if(outcome.error&&outcome.error!=='SOURCE_CONFIGURATION_CHANGED')summary.failed++;
  }
 }
 summary.status=!summary.scanned?'idle':summary.failed===summary.scanned?'failed':summary.failed?'partial':'ok';
 await recordDiscoveryRun(env,{...summary,started});
 return summary;
}
export async function queueDiscovery(batch,env){return consumeDiscoveryBatch(batch,env);}

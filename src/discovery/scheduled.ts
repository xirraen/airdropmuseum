import {fetchDiscoverySource,consumeDiscoveryBatch} from './ingestService.ts';
export async function scheduledDiscovery(env){
 if(!env.DB||!env.DISCOVERY_QUEUE)return {scanned:0};
 const ready=await env.DB.prepare('SELECT version FROM am_core_schema WHERE version=6').first();
 if(!ready)return {scanned:0};
 const result=await env.DB.prepare("SELECT * FROM discovery_sources WHERE enabled=1 AND (last_fetched_at IS NULL OR last_fetched_at<=datetime('now','-25 minutes')) ORDER BY COALESCE(last_fetched_at,'') ASC LIMIT 20").all();
 const rows=result.results||[];
 for(let i=0;i<rows.length;i+=3)await Promise.all(rows.slice(i,i+3).map(row=>fetchDiscoverySource(env,row)));
 return {scanned:rows.length};
}
export async function queueDiscovery(batch,env){return consumeDiscoveryBatch(batch,env);}

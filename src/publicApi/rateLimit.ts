import {digest,fail,sql,TIER_LIMITS} from './types.ts';
const nowMinute=()=>Math.floor(Date.now()/60000);
export async function checkRate(request,env,p){
 if(!env.PUBLIC_API_RATE_LIMITER)fail('RATE_LIMIT_BINDING_REQUIRED',503);
 if(!env.API_HASH_PEPPER)fail('API_HASH_PEPPER_REQUIRED',503);
 const principalHash=p.id?await digest('key:'+p.id):await digest(env.API_HASH_PEPPER+':'+(request.headers.get('CF-Connecting-IP')||'unknown'));
 const native=await env.PUBLIC_API_RATE_LIMITER.limit({key:principalHash});
 if(!native.success)fail('RATE_LIMITED',429);
 const minute=nowMinute(),start=Math.floor(minute/1440)*1440,limit=p.limit||TIER_LIMITS[p.tier],quota=p.key?.daily_quota||1000000;
 // D1 guarantees atomic conditional upsert against minute + daily aggregate. No raw IP/key storage.
 const statement=`INSERT INTO api_usage_log(principal_hash,minute_bucket,api_key_id,request_count)
 SELECT ?,?,?,1 WHERE (SELECT COALESCE(SUM(request_count),0) FROM api_usage_log WHERE principal_hash=? AND minute_bucket>=? AND minute_bucket<=?) < ?
 ON CONFLICT(principal_hash,minute_bucket) DO UPDATE SET request_count=request_count+1,updated_at=CURRENT_TIMESTAMP
 WHERE request_count<? AND (SELECT COALESCE(SUM(request_count),0) FROM api_usage_log WHERE principal_hash=? AND minute_bucket>=? AND minute_bucket<=?) < ?`;
 const r=await sql(env.DB,statement,principalHash,minute,p.id,principalHash,start,minute,quota,limit,principalHash,start,minute,quota).run();
 if(r.meta?.changes!==1)fail('RATE_LIMITED',429);
 const row=await sql(env.DB,'SELECT request_count FROM api_usage_log WHERE principal_hash=? AND minute_bucket=?',principalHash,minute).first();
 return {'X-RateLimit-Limit':String(limit),'X-RateLimit-Remaining':String(Math.max(0,limit-(row?.request_count||limit))),'X-RateLimit-Reset':String((minute+1)*60)};
}
export const retryHeaders={'Retry-After':'60','X-RateLimit-Remaining':'0'};

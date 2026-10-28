import {sql,fail,body,text,hash,bool} from './types.ts';
import {audit} from './auditService.ts';
const tiers=['free','partner','internal'],limits={free:60,partner:300,internal:600},quotas={free:1000,partner:20000,internal:100000};
const view=k=>({id:k.id,name:k.name,partner_scope:k.partner_scope,tier:k.tier,rate_limit_per_minute:k.rate_limit_per_minute,daily_quota:k.daily_quota,enabled:!!k.enabled,revoked_at:k.revoked_at,expires_at:k.expires_at,created_at:k.created_at});
export async function keysRoute(request,env,actor){
 const db=env.DB,p=new URL(request.url).pathname,id=/^\/api\/admin\/api-keys\/([a-f0-9-]{36})$/.exec(p)?.[1];
 if(p==='/api/admin/api-keys'&&request.method==='GET'){
  const r=await sql(db,'SELECT id,name,partner_scope,tier,rate_limit_per_minute,daily_quota,enabled,revoked_at,expires_at,created_at FROM api_keys ORDER BY created_at DESC LIMIT 200').all();
  const usage=await sql(db,"SELECT api_key_id,SUM(request_count) requests FROM api_usage_log WHERE minute_bucket>=(CAST(strftime('%s','now') AS INTEGER)/60-1440) GROUP BY api_key_id").all();
  return {keys:r.results.map(k=>({...view(k),usage_24h:usage.results.find(u=>u.api_key_id===k.id)?.requests||0}))};
 }
 if(p==='/api/admin/api-keys'&&request.method==='POST'){
  const b=await body(request);
  if(!tiers.includes(b.tier))fail('INVALID_TIER');
  const name=text(b.name,120);if(!name)fail('NAME_REQUIRED');
  const limit=b.rate_limit_per_minute===undefined?limits[b.tier]:b.rate_limit_per_minute,quota=b.daily_quota===undefined?quotas[b.tier]:b.daily_quota;
  if(!Number.isInteger(limit)||limit<1||limit>600||!Number.isInteger(quota)||quota<1||quota>1000000)fail('INVALID_QUOTA');
  const token='am_v1_'+Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID();
  const expiry=b.expires_at===undefined?null:validateExpiry(b.expires_at);
  await sql(db,'INSERT INTO api_keys(id,name,key_hash,partner_scope,tier,rate_limit_per_minute,daily_quota,created_by,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',id,name,await hash(token),text(b.partner_scope,200),b.tier,limit,quota,actor.admin_scope,expiry).run();
  await audit(env,request,actor,'api_key.create','api_key',id,{}, {id,name,tier:b.tier,enabled:true,expires_at:expiry});
  return {key:{id,name,tier:b.tier,enabled:true,expires_at:expiry},api_key:token,notice:'Kunci hanya ditampilkan sekali. Simpan di password manager.'};
 }
 if(id&&request.method==='PUT'){
  const old=await sql(db,'SELECT * FROM api_keys WHERE id=?',id).first();if(!old)fail('NOT_FOUND',404);if(old.revoked_at)fail('KEY_REVOKED',409);
  const b=await body(request),tier=b.tier===undefined?old.tier:b.tier;
  if(!tiers.includes(tier))fail('INVALID_TIER');
  const name=b.name===undefined?old.name:text(b.name,120),rate=b.rate_limit_per_minute===undefined?old.rate_limit_per_minute:b.rate_limit_per_minute,quota=b.daily_quota===undefined?old.daily_quota:b.daily_quota;
  if(!name||!Number.isInteger(rate)||rate<1||rate>600||!Number.isInteger(quota)||quota<1||quota>1000000)fail('INVALID_KEY_CONFIGURATION');
  const enabled=b.enabled===undefined?old.enabled:bool(b.enabled),expiry=b.expires_at===undefined?old.expires_at:validateExpiry(b.expires_at);
  await sql(db,'UPDATE api_keys SET name=?,partner_scope=?,tier=?,rate_limit_per_minute=?,daily_quota=?,enabled=?,expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',name,b.partner_scope===undefined?old.partner_scope:text(b.partner_scope,200),tier,rate,quota,enabled,expiry,id).run();
  const next=view(await sql(db,'SELECT * FROM api_keys WHERE id=?',id).first());
  await audit(env,request,actor,'api_key.update','api_key',id,view(old),next);
  return {key:next};
 }
 if(id&&request.method==='DELETE'){
  const old=await sql(db,'SELECT * FROM api_keys WHERE id=?',id).first();if(!old||old.revoked_at)fail('NOT_FOUND',404);
  await db.batch([
   sql(db,'UPDATE api_keys SET enabled=0,revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?',id),
   sql(db,'UPDATE partner_webhooks SET enabled=0,revoked_at=CURRENT_TIMESTAMP,disabled_at=CURRENT_TIMESTAMP WHERE api_key_id=? AND revoked_at IS NULL',id)]);
  await audit(env,request,actor,'api_key.revoke','api_key',id,view(old),{id,enabled:false,revoked_at:'now'});
  return {revoked:true,id};
 }
 fail('METHOD_NOT_ALLOWED',405);
}
function validateExpiry(x){if(x===null)return null;if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x)||!Number.isFinite(Date.parse(x))||Date.parse(x)<=Date.now())fail('INVALID_EXPIRY');return x;}

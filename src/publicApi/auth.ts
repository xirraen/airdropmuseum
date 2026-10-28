import {platformUser} from '../platform-api.mjs';
import {ApiError,fail,str,digest,fixedEqual,sql,bodyJson,json,TIER_LIMITS,TIER_DAILY} from './types.ts';
export async function principal(request,env){
 const auth=request.headers.get('Authorization');
 if(!auth)return {tier:'anonymous',id:null,key:null,limit:TIER_LIMITS.anonymous};
 if(!/^Bearer am_v1_[a-f0-9]{64}$/.test(auth))fail('INVALID_API_KEY',401);
 const value=auth.slice(7),hash=await digest(value);
 const found=await sql(env.DB,'SELECT * FROM api_keys WHERE key_hash=?',hash).first();
 // Compare the computed hash in constant time even after a keyed lookup.
 const good=fixedEqual(hash,found?.key_hash||'0'.repeat(64));
 if(!found||!good||!found.enabled||found.revoked_at||(found.expires_at&&Date.parse(found.expires_at)<=Date.now()))fail('INVALID_API_KEY',401);
 return {tier:found.tier,id:found.id,key:found,limit:found.rate_limit_per_minute};
}
export async function admin(request,env){
 if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
 const user=await platformUser(request,env,false);
 if(!user)fail('ADMIN_AUTH_REQUIRED',401);
 if(!(env.MODERATOR_IDS||'').split(',').map(s=>s.trim()).filter(Boolean).includes(user.id))fail('ADMIN_FORBIDDEN',403);
 const origin=request.headers.get('Origin'),expected=new URL(request.url).origin;
 if(!['GET','HEAD'].includes(request.method)&&origin!==expected)fail('SAME_ORIGIN_REQUIRED',403);
 return user.id;
}
const view=k=>({id:k.id,name:k.name,partner_scope:k.partner_scope,tier:k.tier,rate_limit_per_minute:k.rate_limit_per_minute,daily_quota:k.daily_quota,enabled:!!k.enabled,revoked_at:k.revoked_at,created_at:k.created_at,updated_at:k.updated_at});
export async function adminKeys(request,env){
 const actor=await admin(request,env),db=env.DB,path=new URL(request.url).pathname,id=/^\/api\/admin\/api-keys\/([a-f0-9-]{36})$/.exec(path)?.[1];
 if(path==='/api/admin/api-keys'&&request.method==='GET'){const result=await sql(db,'SELECT id,name,partner_scope,tier,rate_limit_per_minute,daily_quota,enabled,revoked_at,created_at,updated_at FROM api_keys ORDER BY created_at DESC LIMIT 200').all();return json({keys:(result.results||[]).map(view)});}
 if(path==='/api/admin/api-keys'&&request.method==='POST'){
  const b=await bodyJson(request);
  if(!['free','partner','internal'].includes(b.tier))fail('INVALID_TIER');
  const name=str(b.name,120),scope=str(b.partner_scope,200);
  if(!name)fail('NAME_REQUIRED');
  const limit=b.rate_limit_per_minute===undefined?TIER_LIMITS[b.tier]:Number(b.rate_limit_per_minute);
  const quota=b.daily_quota===undefined?TIER_DAILY[b.tier]:Number(b.daily_quota);
  if(!Number.isSafeInteger(limit)||limit<1||limit>600||!Number.isSafeInteger(quota)||quota<1||quota>1000000)fail('INVALID_QUOTA');
  const token='am_v1_'+Array.from(crypto.getRandomValues(new Uint8Array(32))).map(n=>n.toString(16).padStart(2,'0')).join(''),keyId=crypto.randomUUID();
  await sql(db,'INSERT INTO api_keys(id,name,key_hash,partner_scope,tier,rate_limit_per_minute,daily_quota,enabled,created_by) VALUES(?,?,?,?,?,?,?,?,?)',keyId,name,await digest(token),scope,b.tier,limit,quota,b.enabled===false?0:1,actor).run();
  return json({key:{id:keyId,name,partner_scope:scope,tier:b.tier,rate_limit_per_minute:limit,daily_quota:quota,enabled:b.enabled!==false},api_key:token,notice:'API key shown only once; store securely.'},201,{'Cache-Control':'no-store'});
 }
 if(id&&request.method==='PUT'){
  const b=await bodyJson(request),old=await sql(db,'SELECT * FROM api_keys WHERE id=?',id).first();if(!old)fail('NOT_FOUND',404);if(old.revoked_at)fail('REVOKED_KEY_CANNOT_BE_UPDATED',409);
  const tier=b.tier===undefined?old.tier:b.tier;if(!['free','partner','internal'].includes(tier))fail('INVALID_TIER');
  const rate=b.rate_limit_per_minute===undefined?old.rate_limit_per_minute:Number(b.rate_limit_per_minute),daily=b.daily_quota===undefined?old.daily_quota:Number(b.daily_quota);
  if(!Number.isSafeInteger(rate)||rate<1||rate>600||!Number.isSafeInteger(daily)||daily<1||daily>1000000)fail('INVALID_QUOTA');
  const name=b.name===undefined?old.name:str(b.name,120);if(!name)fail('NAME_REQUIRED');
  await sql(db,"UPDATE api_keys SET name=?,partner_scope=?,tier=?,rate_limit_per_minute=?,daily_quota=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",name,b.partner_scope===undefined?old.partner_scope:str(b.partner_scope,200),tier,rate,daily,b.enabled===undefined?old.enabled:b.enabled===true?1:0,id).run();
  return json({key:view(await sql(db,'SELECT * FROM api_keys WHERE id=?',id).first())});
 }
 if(id&&request.method==='DELETE'){
  const row=await sql(db,"UPDATE api_keys SET enabled=0,revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL",id).run();
  if(!row.meta?.changes)fail('NOT_FOUND',404);
  await sql(db,"UPDATE partner_webhooks SET enabled=0,disabled_at=CURRENT_TIMESTAMP WHERE api_key_id=?",id).run();
  return json({revoked:true});
 }
 fail('METHOD_NOT_ALLOWED',405);
}

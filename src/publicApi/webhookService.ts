import {EVENTS,DISCLAIMER,sql,fail,str,https,bodyJson,digest,fixedEqual,iso,safeParse} from './types.ts';
import {campaignBySlug} from './campaignApi.ts';
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('');
async function hmac(secret,body){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,typeof body==='string'?enc.encode(body):body));}
async function secret(env,id){if(!env.WEBHOOK_MASTER_SECRET||env.WEBHOOK_MASTER_SECRET.length<32)fail('WEBHOOK_MASTER_SECRET_REQUIRED',503);return 'whsec_'+await hmac(env.WEBHOOK_MASTER_SECRET,'airdropmuseum:webhook:v1:'+id);}
export async function webhookSignature(secretValue,rawBody){return 'sha256='+await hmac(secretValue,rawBody);}
function targetUrl(value,ownOrigin){const url=https(value),u=new URL(url);
 if(u.hostname===new URL(ownOrigin).hostname)fail('WEBHOOK_SELF_TARGET');
 if(u.pathname.length>1000||url.length>1500)fail('INVALID_WEBHOOK_URL');return url;}
export async function webhooksRoute(request,env,principal){
 if(principal.tier!=='partner'||!principal.id)fail('PARTNER_KEY_REQUIRED',403);
 const path=new URL(request.url).pathname,id=/^\/v1\/webhooks\/([a-f0-9-]{36})$/.exec(path)?.[1],db=env.DB;
 if(path==='/v1/webhooks'&&request.method==='POST'){
  const b=await bodyJson(request,4096);
  if(!Array.isArray(b.events)||!b.events.length||b.events.length>EVENTS.length||b.events.some(x=>!EVENTS.includes(x)))fail('INVALID_EVENTS');
  const url=targetUrl(b.url,new URL(request.url).origin),hookId=crypto.randomUUID(),value=await secret(env,hookId);
  await sql(db,'INSERT INTO partner_webhooks(id,api_key_id,url,events,secret_hash) VALUES(?,?,?,?,?)',hookId,principal.id,url,JSON.stringify([...new Set(b.events)]),await digest(value)).run();
  return {status:201,body:{id:hookId,url,events:[...new Set(b.events)],enabled:true,webhook_secret:value,notice:'Webhook secret shown only once; retain securely.',disclaimer:DISCLAIMER}};
 }
 if(id&&request.method==='GET'){
  const row=await sql(db,'SELECT id,url,events,enabled,failure_count,created_at,updated_at,disabled_at FROM partner_webhooks WHERE id=? AND api_key_id=?',id,principal.id).first();
  if(!row)fail('NOT_FOUND',404);
  return {status:200,body:{...row,events:safeParse(row.events,[]),enabled:!!row.enabled,disclaimer:DISCLAIMER}};
 }
 if(id&&request.method==='DELETE'){
  const res=await sql(db,'DELETE FROM partner_webhooks WHERE id=? AND api_key_id=?',id,principal.id).run();
  if(!res.meta?.changes)fail('NOT_FOUND',404);
  return {status:200,body:{deleted:true,disclaimer:DISCLAIMER}};
 }
 fail('METHOD_NOT_ALLOWED',405);
}
// The producer accepts only explicitly curated campaign projection; never pass arbitrary user data.
export async function publishPartnerEvent(env,eventType,slug,{eventId,occurredAt,data={}}={}){
 if(!EVENTS.includes(eventType)||!env.PARTNER_WEBHOOK_QUEUE||!env.DB)return {queued:0};
 let publicCampaign;try{publicCampaign=(await campaignBySlug(env,slug)).campaign;}catch{return {queued:0};}
 const event_id=eventId||await digest([eventType,slug,occurredAt||publicCampaign.updated_at].join(':'));
 const payload={event_id,event_type:eventType,occurred_at:iso(occurredAt)||new Date().toISOString(),campaign_slug:publicCampaign.slug,
  data:{campaign:publicCampaign,...(eventType==='source.conflict_detected'?{conflict_detected:true}:{})},
  source_url:publicCampaign.source_url,disclaimer:DISCLAIMER};
 const hooks=await sql(env.DB,"SELECT h.id,h.events FROM partner_webhooks h JOIN api_keys k ON k.id=h.api_key_id WHERE h.enabled=1 AND k.enabled=1 AND k.revoked_at IS NULL AND k.tier='partner' LIMIT 500").all();
 let queued=0;
 for(const hook of hooks.results||[]){
  if(!safeParse(hook.events,[]).includes(eventType))continue;
  const deliveryId=crypto.randomUUID();
  const r=await sql(env.DB,'INSERT OR IGNORE INTO webhook_deliveries(id,webhook_id,event_id,event_type,payload) VALUES(?,?,?,?,?)',deliveryId,hook.id,event_id,eventType,JSON.stringify(payload)).run();
  if(r.meta?.changes){await env.PARTNER_WEBHOOK_QUEUE.send({delivery_id:deliveryId});queued++;}
 }
 return {queued};
}
export async function scanPartnerEvents(env){
 if(!env.DB||!env.PARTNER_WEBHOOK_QUEUE)return;
 const now=Date.now(),start=new Date(now-10*60000).toISOString(),end=new Date(now+24*3600000).toISOString();
 // Poll only recent published changes; no webhook-triggered changes to source registry.
 const rows=await sql(env.DB,"SELECT e.id,e.updated_at,e.payload FROM am_core_exhibits e WHERE e.updated_at >= datetime('now','-10 minutes') AND json_extract(e.payload,'$.visibility')='public' AND e.review_status NOT IN ('draft','pending_review','private_draft','unreviewed') ORDER BY e.updated_at DESC LIMIT 100").all();
 for(const r of rows.results||[]){
  const p=safeParse(r.payload);
  await publishPartnerEvent(env,'campaign.updated',r.id,{eventId:await digest('updated:'+r.id+':'+r.updated_at),occurredAt:r.updated_at});
  if(iso(p.published_at)&&Date.parse(p.published_at)>=now-10*60000)await publishPartnerEvent(env,'campaign.created',r.id,{eventId:await digest('created:'+r.id),occurredAt:p.published_at});
  if(iso(p.status_changed_at)&&Date.parse(p.status_changed_at)>=now-10*60000)await publishPartnerEvent(env,'campaign.status_changed',r.id,{eventId:await digest('status:'+r.id+':'+p.status_changed_at),occurredAt:p.status_changed_at});
 }
 const upcoming=await sql(env.DB,"SELECT id,payload FROM am_core_exhibits WHERE json_extract(payload,'$.visibility')='public' AND review_status NOT IN ('draft','pending_review','private_draft','unreviewed') ORDER BY updated_at DESC LIMIT 200").all();
 for(const r of upcoming.results||[]){
  const p=safeParse(r.payload);
  for(const [field,type] of [['snapshot_at','snapshot.upcoming'],['claim_opens_at','claim.opened'],['claim_deadline_at','deadline.upcoming']]){
   const when=iso(p[field]);if(!when)continue;
   const dt=Date.parse(when),window=type==='claim.opened'?10*60000:24*3600000;
   if(dt>=now-(type==='claim.opened'?10*60000:0)&&dt<=now+window)
    await publishPartnerEvent(env,type,r.id,{eventId:await digest(type+':'+r.id+':'+when),occurredAt:type==='claim.opened'?when:new Date().toISOString()});
  }
 }
 const conflicts=await sql(env.DB,"SELECT campaign_id,id,created_at FROM source_conflicts WHERE created_at >= datetime('now','-10 minutes') AND status='open' ORDER BY created_at DESC LIMIT 100").all();
 for(const c of conflicts.results||[])await publishPartnerEvent(env,'source.conflict_detected',c.campaign_id,{eventId:await digest('conflict:'+c.id),occurredAt:c.created_at});
 // Recover deliveries whose producer enqueue was interrupted after a D1 commit.
 const retry=await sql(env.DB,"SELECT id FROM webhook_deliveries WHERE status='queued' AND created_at < datetime('now','-2 minutes') ORDER BY created_at LIMIT 50").all();
 for(const d of retry.results||[])await env.PARTNER_WEBHOOK_QUEUE.send({delivery_id:d.id});
}
export async function deliverPartnerWebhook(message,env,fetcher=fetch){
 const id=message.body?.delivery_id;
 if(typeof id!=='string')return message.ack();
 const db=env.DB,row=await sql(db,"SELECT d.*,h.url,h.secret_hash,h.enabled,k.enabled AS key_enabled,k.revoked_at FROM webhook_deliveries d JOIN partner_webhooks h ON h.id=d.webhook_id JOIN api_keys k ON k.id=h.api_key_id WHERE d.id=?",id).first();
 if(!row||row.status==='delivered'||row.status==='dead'||!row.enabled||!row.key_enabled||row.revoked_at){message.ack();return;}
 if(row.attempts>=5){await sql(db,"UPDATE webhook_deliveries SET status='dead',error='MAX_ATTEMPTS' WHERE id=?",id).run();message.ack();return;}
 const attempts=row.attempts+1;
 await sql(db,"UPDATE webhook_deliveries SET attempts=?,status='retrying',last_attempt_at=CURRENT_TIMESTAMP WHERE id=?",attempts,id).run();
 try{
  const target=targetUrl(row.url,env.PUBLIC_API_ORIGIN||'https://airdrop-museum.xirraen.workers.dev');
  const raw=row.payload;if(enc.encode(raw).length>16384)throw Error('PAYLOAD_TOO_LARGE');
  const key=await secret(env,row.webhook_id);
  if(!fixedEqual(await digest(key),row.secret_hash))throw Error('SECRET_DERIVATION_FAILED');
  const result=await fetcher(target,{method:'POST',headers:{'Content-Type':'application/json','X-AirdropMuseum-Event':row.event_type,'X-AirdropMuseum-Delivery':id,'X-AirdropMuseum-Signature':await webhookSignature(key,raw)},body:raw,redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(result.status<200||result.status>=300)throw Object.assign(Error('HTTP_DELIVERY_FAILED'),{status:result.status});
  await sql(db,"UPDATE webhook_deliveries SET status='delivered',response_status=?,error=NULL,delivered_at=CURRENT_TIMESTAMP WHERE id=?",result.status,id).run();
  await sql(db,'UPDATE partner_webhooks SET failure_count=0 WHERE id=?',row.webhook_id).run();message.ack();
 }catch(error){
  const code=error?.message==='SECRET_DERIVATION_FAILED'?'SECRET_DERIVATION_FAILED':error?.message==='PAYLOAD_TOO_LARGE'?'PAYLOAD_TOO_LARGE':'DELIVERY_FAILED';
  await sql(db,'UPDATE webhook_deliveries SET status=?,response_status=?,error=? WHERE id=?',attempts>=5?'dead':'retrying',Number.isInteger(error?.status)?error.status:null,code,id).run();
  await sql(db,"UPDATE partner_webhooks SET failure_count=failure_count+1 WHERE id=?",row.webhook_id).run();
  await sql(db,"UPDATE partner_webhooks SET enabled=0,disabled_at=CURRENT_TIMESTAMP WHERE id=? AND failure_count>=10",row.webhook_id).run();
  if(attempts<5)message.retry({delaySeconds:Math.min(3600,2**attempts*30)});
  else message.retry(); // Cloudflare max_retries=4 routes exhausted messages to PARTNER_WEBHOOK_DLQ.
 }
}
export async function handlePartnerQueue(batch,env){
 if(batch.queue==='airdrop-museum-partner-webhook-dlq'){
  for(const message of batch.messages){const id=message.body?.delivery_id;if(typeof id==='string')await sql(env.DB,"UPDATE webhook_deliveries SET status='dead',error=COALESCE(error,'DLQ_EXHAUSTED') WHERE id=? AND status<>'delivered'",id).run();message.ack();}
  return;
 }
 for(const message of batch.messages)await deliverPartnerWebhook(message,env);
}

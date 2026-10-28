import {sql,fail,body,bool,safeJson,text,hash} from './types.ts';
import {audit} from './auditService.ts';
import {EVENTS,https} from '../publicApi/types.ts';
export async function webhooksAdminRoute(request,env,actor){
 const db=env.DB,p=new URL(request.url).pathname,id=/^\/api\/admin\/webhooks\/([a-f0-9-]{36})(?:\/(test))?$/.exec(p);
 if(p==='/api/admin/webhooks'&&request.method==='GET'){
  const r=await sql(db,"SELECT h.id,h.api_key_id,h.url,h.events,h.enabled,h.failure_count,h.created_at,h.disabled_at,h.revoked_at,COUNT(d.id) deliveries,SUM(CASE WHEN d.status='delivered' THEN 1 ELSE 0 END) successful,MAX(d.delivered_at) last_success,MAX(CASE WHEN d.status IN ('dead','retrying') THEN d.last_attempt_at END) last_failure,SUM(CASE WHEN d.status IN ('queued','retrying') THEN 1 ELSE 0 END) retry_depth FROM partner_webhooks h LEFT JOIN webhook_deliveries d ON d.webhook_id=h.id GROUP BY h.id ORDER BY h.created_at DESC LIMIT 200").all();
  return {webhooks:r.results.map(h=>({...h,url:new URL(h.url).origin,events:safeJson(h.events,[]),enabled:!!h.enabled,success_rate:h.deliveries?h.successful/h.deliveries:0}))};
 }
 if(p==='/api/admin/webhooks'&&request.method==='POST'){
  const b=await body(request),k=await sql(db,"SELECT id FROM api_keys WHERE id=? AND enabled=1 AND tier='partner' AND revoked_at IS NULL",b.api_key_id).first();
  if(!k)fail('ACTIVE_PARTNER_KEY_REQUIRED');
  if(!env.WEBHOOK_MASTER_SECRET||env.WEBHOOK_MASTER_SECRET.length<32)fail('WEBHOOK_SECRET_NOT_CONFIGURED',503);
  let url;try{url=new URL(https(b.url));}catch{fail('HTTPS_REQUIRED');}
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>1500||url.hostname===new URL(request.url).hostname)fail('INVALID_WEBHOOK_URL');
  const allowed=EVENTS;
  if(!Array.isArray(b.events)||!b.events.length||b.events.some(e=>!allowed.includes(e)))fail('INVALID_WEBHOOK_EVENTS');
  const id=crypto.randomUUID(),encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.WEBHOOK_MASTER_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode('airdropmuseum:webhook:v1:'+id));
  const secret='whsec_'+Array.from(new Uint8Array(signature)).map(x=>x.toString(16).padStart(2,'0')).join('');
  await sql(db,'INSERT INTO partner_webhooks(id,api_key_id,url,events,secret_hash) VALUES(?,?,?,?,?)',id,k.id,url.href,JSON.stringify([...new Set(b.events)]),await hash(secret)).run();
  await audit(env,request,actor,'webhook.create','webhook',id,{}, {id,url:url.href,enabled:true,events:b.events});
  return {id,url:url.href,events:b.events,enabled:true,notice:'Secret tidak ditampilkan di console. Partner dapat mendaftarkan webhook sendiri melalui endpoint v1 untuk menerima secret sekali.'};
 }
 if(id&&request.method==='PUT'&&!id[2]){
  const old=await sql(db,'SELECT id,url,events,enabled,revoked_at FROM partner_webhooks WHERE id=?',id[1]).first();
  if(!old||old.revoked_at)fail('NOT_FOUND',404);
  const b=await body(request),enabled=bool(b.enabled);
  await sql(db,'UPDATE partner_webhooks SET enabled=?,disabled_at=CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?',enabled,enabled,id[1]).run();
  await audit(env,request,actor,'webhook.update','webhook',id[1],old,{enabled:!!enabled});
  return {id:id[1],enabled:!!enabled};
 }
 if(id&&request.method==='DELETE'&&!id[2]){
  const old=await sql(db,'SELECT id,url,enabled,revoked_at FROM partner_webhooks WHERE id=?',id[1]).first();
  if(!old||old.revoked_at)fail('NOT_FOUND',404);
  await sql(db,'UPDATE partner_webhooks SET enabled=0,revoked_at=CURRENT_TIMESTAMP,disabled_at=CURRENT_TIMESTAMP WHERE id=?',id[1]).run();
  await audit(env,request,actor,'webhook.revoke','webhook',id[1],old,{enabled:false});
  return {revoked:true,id:id[1]};
 }
 if(id&&id[2]==='test'&&request.method==='POST'){
  const hook=await sql(db,'SELECT id,enabled,revoked_at FROM partner_webhooks WHERE id=?',id[1]).first();
  if(!hook||hook.revoked_at)fail('NOT_FOUND',404);
  if(!hook.enabled||!env.PARTNER_WEBHOOK_QUEUE)fail('WEBHOOK_QUEUE_UNAVAILABLE',503);
  const deliveryId=crypto.randomUUID();
  const payload={event_id:'test:'+deliveryId,event_type:'test.ping',occurred_at:new Date().toISOString(),data:{test:true},disclaimer:'Uji dummy; verifikasi manual tetap diperlukan.'};
  await sql(db,"INSERT INTO webhook_deliveries(id,webhook_id,event_id,event_type,payload) VALUES(?,?,?,?,?)",deliveryId,hook.id,payload.event_id,payload.event_type,JSON.stringify(payload)).run();
  await env.PARTNER_WEBHOOK_QUEUE.send({delivery_id:deliveryId});
  await audit(env,request,actor,'webhook.test','webhook',hook.id,{}, {status:'queued'});
  return {queued:true,delivery_id:deliveryId};
 }
 fail('METHOD_NOT_ALLOWED',405);
}

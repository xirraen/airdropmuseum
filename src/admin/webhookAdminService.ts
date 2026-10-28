import {sql,fail,body,bool,safeJson} from './types.ts';
import {audit} from './auditService.ts';
export async function webhooksAdminRoute(request,env,actor){
 const db=env.DB,p=new URL(request.url).pathname,id=/^\/api\/admin\/webhooks\/([a-f0-9-]{36})(?:\/(test))?$/.exec(p);
 if(p==='/api/admin/webhooks'&&request.method==='GET'){
  const r=await sql(db,"SELECT h.id,h.api_key_id,h.url,h.events,h.enabled,h.failure_count,h.created_at,h.disabled_at,h.revoked_at,COUNT(d.id) deliveries,SUM(CASE WHEN d.status='delivered' THEN 1 ELSE 0 END) successful,MAX(d.delivered_at) last_success,MAX(CASE WHEN d.status IN ('dead','retrying') THEN d.last_attempt_at END) last_failure,SUM(CASE WHEN d.status IN ('queued','retrying') THEN 1 ELSE 0 END) retry_depth FROM partner_webhooks h LEFT JOIN webhook_deliveries d ON d.webhook_id=h.id GROUP BY h.id ORDER BY h.created_at DESC LIMIT 200").all();
  return {webhooks:r.results.map(h=>({...h,events:safeJson(h.events,[]),enabled:!!h.enabled,success_rate:h.deliveries?h.successful/h.deliveries:0}))};
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

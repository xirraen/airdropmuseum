import {sql,fail,body,text,safeJson} from './types.ts';
import {audit} from './auditService.ts';
const fields=['project_name','chain','category','snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at','eligibility_rules','official_urls','token_contract','claim_contract'];
export async function conflictsRoute(request,env,actor){
 const url=new URL(request.url),db=env.DB,p=url.pathname;
 if(p==='/api/admin/conflicts'&&request.method==='GET'){
  const filter=[],args=[],allowed=['severity','status','campaign','field'];
  for(const [k] of url.searchParams)if(!allowed.includes(k))fail('INVALID_FILTER');
  for(const [q,col] of [['severity','severity'],['status','status'],['campaign','campaign_id'],['field','field']])if(url.searchParams.has(q)){filter.push(col+'=?');args.push(text(url.searchParams.get(q),160));}
  const rows=await sql(db,'SELECT id,campaign_id,field,value_a,value_b,severity,status,created_at,reason FROM source_conflicts '+(filter.length?'WHERE '+filter.join(' AND '):'')+' ORDER BY created_at DESC LIMIT 100',...args).all();
  return {conflicts:rows.results.map(x=>({...x,value_a:safeJson(x.value_a,null),value_b:safeJson(x.value_b,null)}))};
 }
 const match=/^\/api\/admin\/conflicts\/([a-zA-Z0-9_-]{1,160})\/(resolve|ignore)$/.exec(p);
 if(!match||request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
 const row=await sql(db,'SELECT * FROM source_conflicts WHERE id=?',match[1]).first();
 if(!row)fail('NOT_FOUND',404);
 if(row.status!=='open')fail('ALREADY_RESOLVED',409);
 const b=await body(request),reason=text(b.resolution_note||b.reason,500);
 if(!reason)fail('REASON_REQUIRED');
 if(match[2]==='resolve'){
  if(!['a','b'].includes(b.selected_value)||b.confirm!=='RESOLVE')fail('RESOLUTION_CONFIRMATION_REQUIRED',409);
  if(!fields.includes(row.field))fail('UNSUPPORTED_FIELD');
  const selected=safeJson(b.selected_value==='a'?row.value_a:row.value_b,null);
  if(selected===null)fail('INVALID_CONFLICT_VALUE');
  const campaign=await sql(db,'SELECT * FROM am_core_exhibits WHERE id=?',row.campaign_id).first();
  if(!campaign)fail('CAMPAIGN_NOT_FOUND',404);
  const old=safeJson(campaign.payload),next={...old,[row.field]:selected};
  // Conflict resolution never publishes the campaign. Keep its visibility and review_status unchanged.
  const changes=await db.batch([
   sql(db,'UPDATE am_core_exhibits SET payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND updated_at=?',JSON.stringify(next),campaign.id,campaign.updated_at),
   sql(db,"UPDATE source_conflicts SET status='resolved',closed_at=CURRENT_TIMESTAMP,closed_by=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'",actor.admin_scope,reason,row.id)
  ]);
  if(changes.some(x=>x.meta?.changes!==1))fail('RESOLUTION_CONFLICT',409);
 }else{
  const r=await sql(db,"UPDATE source_conflicts SET status='ignored',closed_at=CURRENT_TIMESTAMP,closed_by=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'",actor.admin_scope,reason,row.id).run();
  if(r.meta?.changes!==1)fail('RESOLUTION_CONFLICT',409);
 }
 await audit(env,request,actor,'conflict.'+match[2],'source_conflict',row.id,{status:'open',field:row.field},{status:match[2]==='resolve'?'resolved':'ignored',field:row.field,resolution_note:reason});
 try{await env.TRUST_CACHE?.delete('trust:campaign:'+row.campaign_id+':latest');}catch{}
 return {id:row.id,status:match[2]==='resolve'?'resolved':'ignored',campaign_id:row.campaign_id};
}

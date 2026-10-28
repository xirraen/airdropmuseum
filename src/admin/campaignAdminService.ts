import {sql,fail,body,text,safeJson,uuid} from './types.ts';
import {audit} from './auditService.ts';
import {preview,execute} from './bulkService.ts';
const statuses=['rumored','speculative','confirmed','active','ended','expired','archived','claim_open'];
const reviewStatuses=['draft','pending_review','confirmed','reviewed','archived','expired'];
const actions=['archive','expire','republish','update_status','assign_reviewer'];
const fields=['name','title','project_name','chain','category','status','description','reviewer','source_url','visibility'];
const read=(db,id)=>sql(db,'SELECT id,payload,source_url,review_status,updated_at FROM am_core_exhibits WHERE id=?',id).first();
function validate(data,moderator=false){
 const next={};
 for(const [key,value] of Object.entries(data)){
  if(!fields.includes(key)||(moderator&&!['title','description','category','reviewer'].includes(key)))fail('INVALID_CAMPAIGN_FIELD');
  if(key==='source_url'){
   if(typeof value!=='string')fail('INVALID_SOURCE_URL');
   let u;try{u=new URL(value);}catch{fail('INVALID_SOURCE_URL');}
   if(u.protocol!=='https:'||u.username||u.password||value.length>500)fail('INVALID_SOURCE_URL');next[key]=u.href;
  }else if(key==='status'){
   if(!statuses.includes(value))fail('INVALID_CAMPAIGN_STATUS');next[key]=value;
  }else if(key==='visibility'){
   if(!['private_draft','public'].includes(value))fail('INVALID_VISIBILITY');next[key]=value;
  }else if(typeof value==='string'&&value.length<=500)next[key]=text(value,500);
  else fail('INVALID_CAMPAIGN_FIELD');
 }
 if(!Object.keys(next).length)fail('NO_CHANGES');
 return next;
}
async function mutate(db,row,changes,reviewStatus=row.review_status){
 const data=safeJson(row.payload),next={...data,...changes};
 // Aggregator owns these source fields; publication consent and reviewer are local metadata.
 // Editing a projection would be silently overwritten on the next source refresh.
 if(data.registry_source==='aggregator'&&Object.keys(changes).some(k=>!['visibility','reviewer'].includes(k)))fail('SOURCE_CAMPAIGN_EDIT_REQUIRED',409);
 if(next.visibility==='public'&&(!next.source_url&&!row.source_url||['draft','pending_review'].includes(reviewStatus)))fail('PUBLICATION_REVIEW_REQUIRED',409);
 const result=await sql(db,'UPDATE am_core_exhibits SET payload=?,source_url=?,review_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND updated_at=?',
  JSON.stringify(next),changes.source_url||row.source_url,reviewStatus,row.id,row.updated_at).run();
 if(result.meta?.changes!==1)fail('CAMPAIGN_CHANGED',409);
 return {id:row.id,status:next.status,review_status:reviewStatus,visibility:next.visibility,reviewer:next.reviewer||'',source_url:changes.source_url||row.source_url};
}
export async function campaignsRoute(request,env,actor){
 const u=new URL(request.url),p=u.pathname,db=env.DB;
 if(p==='/api/admin/campaigns'&&request.method==='GET'){
  const params=u.searchParams;const q=['status','chain','category','confidence','source_count','last_verified','deadline'];
  for(const [k,v] of params)if(!q.includes(k)&&k!=='limit')fail('INVALID_FILTER');
  const filter=[],args=[];
  if(params.has('status')){filter.push("json_extract(e.payload,'$.status')=?");args.push(text(params.get('status'),40));}
  if(params.has('chain')){filter.push("json_extract(e.payload,'$.chain')=?");args.push(text(params.get('chain'),80));}
  if(params.has('category')){filter.push("json_extract(e.payload,'$.category')=?");args.push(text(params.get('category'),80));}
  if(params.has('confidence')){filter.push("EXISTS(SELECT 1 FROM verification_runs v WHERE v.campaign_id=e.id AND v.confidence_label=?)");args.push(text(params.get('confidence'),50));}
  if(params.has('source_count')){filter.push("(SELECT COUNT(*) FROM campaign_source_links l WHERE l.campaign_id=e.id AND l.enabled=1)>=?");args.push(Number(params.get('source_count'))||0);}
  if(params.has('last_verified')){filter.push("(SELECT MAX(finished_at) FROM verification_runs v WHERE v.campaign_id=e.id)>=?");args.push(text(params.get('last_verified'),30));}
  if(params.has('deadline')){filter.push("json_extract(e.payload,'$.claim_deadline_at')<=?");args.push(text(params.get('deadline'),30));}
  const limit=Math.max(1,Math.min(100,Number(params.get('limit'))||40));
  const rows=await sql(db,'SELECT e.id,e.source_url,e.review_status,e.updated_at,e.payload FROM am_core_exhibits e '+(filter.length?'WHERE '+filter.join(' AND '):'')+' ORDER BY e.updated_at DESC LIMIT ?',...args,limit).all();
  return {campaigns:rows.results.map(r=>({id:r.id,source_url:r.source_url,review_status:r.review_status,updated_at:r.updated_at,...safePublicFields(r.payload)}))};
 }
 if(p==='/api/admin/campaigns/bulk-preview'&&request.method==='GET'){
  return preview(request,env,actor,'campaign',actions,read);
 }
 if(p==='/api/admin/campaigns/bulk-action'&&request.method==='POST'){
  const b=await body(request);
  return execute(request,env,actor,'campaign',actions,b,read,async(row,action,opt)=>{
   if(action==='archive')return mutate(db,row,{status:'archived',visibility:'private_draft'},'archived');
   if(action==='expire')return mutate(db,row,{status:'expired'},'expired');
   if(action==='republish'){
    if(!await sql(db,"SELECT id FROM verification_runs WHERE campaign_id=? AND status='complete' LIMIT 1",row.id).first())fail('VERIFICATION_REQUIRED',409);
    return mutate(db,row,{visibility:'public'},'confirmed');
   }
   if(action==='update_status')return mutate(db,row,validate({status:opt.status}));
   if(action==='assign_reviewer')return mutate(db,row,validate({reviewer:opt.reviewer}));
  });
 }
 const id=/^\/api\/admin\/campaigns\/([a-zA-Z0-9_-]{1,160})$/.exec(p)?.[1];
 if(id&&request.method==='PUT'){
  const row=await read(db,id);if(!row)fail('NOT_FOUND',404);
  const changes=validate(await body(request),actor.role==='moderator');
  const next=await mutate(db,row,changes);
  await audit(env,request,actor,'campaign.update','campaign',id,{...safePublicFields(row.payload),review_status:row.review_status},next);
  return {campaign:next};
 }
 fail('METHOD_NOT_ALLOWED',405);
}
function safePublicFields(raw){
 const data=safeJson(raw);return {title:text(data.title||data.name,160),status:text(data.status,40),chain:text(data.chain,80),category:text(data.category,80),visibility:text(data.visibility,30),reviewer:text(data.reviewer,80)};
}

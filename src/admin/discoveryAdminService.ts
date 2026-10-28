import {sql,fail,body,text} from './types.ts';
import {audit} from './auditService.ts';
import {reviewItem} from '../discovery/reviewService.ts';
import {preview,execute} from './bulkService.ts';
const actions=['approve','reject','convert','duplicate'];
const read=(db,id)=>sql(db,'SELECT id,status,title,url,source_id,classification,classification_confidence,last_seen_at,updated_at FROM (SELECT *,last_seen_at AS updated_at FROM discovery_items) WHERE id=?',id).first();
async function perform(db,row,actor,action,b){
 if(action==='reject'&&!text(b.rejection_reason||b.reason,500))fail('REJECTION_REASON_REQUIRED');
 if(action==='duplicate'){
  if(row.status!=='pending_review')fail('INVALID_TRANSITION',409);
  const update=await sql(db,"UPDATE discovery_items SET status='duplicate',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND status='pending_review'",actor.admin_scope,row.id).run();
  if(update.meta?.changes!==1)fail('INVALID_TRANSITION',409);
  await sql(db,"INSERT INTO discovery_review_log(id,item_id,admin_id,action,previous_status,new_status,reason) VALUES(?,?,?,'duplicate','pending_review','duplicate',?)",crypto.randomUUID(),row.id,actor.admin_scope,'Ditandai duplikat: '+text(b.reason||b.rejection_reason,300)).run();
  return {id:row.id,status:'duplicate'};
 }
 try{
  if(action==='convert'&&row.status==='pending_review')await reviewItem(db,row.id,{id:actor.admin_scope},'approve',{});
  const result=await reviewItem(db,row.id,{id:actor.admin_scope},action,{rejection_reason:b.rejection_reason||b.reason,project_name:text(b.project_name||row.title,120),chain:text(b.chain,80)});
  return {id:row.id,status:result.status};
 }catch(error){fail(error.message==='REJECTION_REASON_REQUIRED'?'REJECTION_REASON_REQUIRED':'REVIEW_FAILED',error.status||409);}
}
export async function discoveryRoute(request,env,actor){
 const u=new URL(request.url),p=u.pathname,db=env.DB;
 if(p==='/api/admin/discovery/queue'&&request.method==='GET'){
  const keys=['status','classification','source','confidence','date'],where=['1=1'],params=[];
  for(const [k] of u.searchParams)if(!keys.includes(k))fail('INVALID_FILTER');
  const b=u.searchParams;
  if(b.has('status')){where.push('i.status=?');params.push(text(b.get('status'),40));}
  if(b.has('classification')){where.push('i.classification=?');params.push(text(b.get('classification'),40));}
  if(b.has('source')){where.push('i.source_id=?');params.push(text(b.get('source'),100));}
  if(b.has('confidence')){const c=Number(b.get('confidence'));if(!Number.isFinite(c)||c<0||c>1)fail('INVALID_CONFIDENCE');where.push('i.classification_confidence>=?');params.push(c);}
  if(b.has('date')){if(!/^\d{4}-\d{2}-\d{2}$/.test(b.get('date')))fail('INVALID_DATE');where.push('date(i.first_seen_at)=?');params.push(b.get('date'));}
  const rows=await sql(db,'SELECT i.id,i.status,i.title,i.url,i.classification,i.classification_confidence,i.first_seen_at,s.name AS source FROM discovery_items i JOIN discovery_sources s ON s.id=i.source_id WHERE '+where.join(' AND ')+' ORDER BY i.first_seen_at DESC LIMIT 100',...params).all();
  return {items:rows.results};
 }
 const single=/^\/api\/admin\/discovery\/items\/([a-zA-Z0-9_-]{1,160})\/(approve|reject|convert|duplicate)$/.exec(p);
 if(single&&request.method==='POST'){
  const row=await read(db,single[1]);if(!row)fail('NOT_FOUND',404);
  const b=await body(request),result=await perform(db,row,actor,single[2],b);
  await audit(env,request,actor,'discovery.'+single[2],'discovery_item',row.id,row,result);
  return result;
 }
 if(p==='/api/admin/discovery/bulk-preview'&&request.method==='GET')return preview(request,env,actor,'discovery',actions,read);
 if(p==='/api/admin/discovery/bulk-action'&&request.method==='POST'){
  const b=await body(request);
  return execute(request,env,actor,'discovery',actions,b,read,(row,action,opt)=>perform(db,row,actor,action,opt));
 }
 fail('METHOD_NOT_ALLOWED',405);
}

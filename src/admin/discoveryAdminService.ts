import {sql,fail,body,text,safeJson} from './types.ts';
import {audit} from './auditService.ts';
import {reviewItem} from '../discovery/reviewService.ts';
import {preview,execute} from './bulkService.ts';
const actions=['approve','reject','convert','duplicate'],read=(db,id)=>sql(db,'SELECT id,status,title,url,source_id,classification,classification_confidence,last_seen_at,updated_at FROM (SELECT *,last_seen_at AS updated_at FROM discovery_items) WHERE id=?',id).first();
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
 if(p==='/api/admin/discovery/bulk-preview'&&request.method==='GET')return preview(request,env,actor,'discovery',actions,read);
 if(p==='/api/admin/discovery/bulk-action'&&request.method==='POST'){
  const b=await body(request);
  return execute(request,env,actor,'discovery',actions,b,read,async(row,action,opt)=>{
   if(action==='reject'&&!text(opt.reason,500))fail('REJECTION_REASON_REQUIRED');
   if(action==='duplicate'){
    if(row.status!=='pending_review')fail('INVALID_TRANSITION',409);
    const update=await sql(db,"UPDATE discovery_items SET status='duplicate',reviewed_at=CURRENT_TIMESTAMP,reviewed_by=? WHERE id=? AND status='pending_review'",actor.admin_scope,row.id).run();
    if(update.meta?.changes!==1)fail('INVALID_TRANSITION',409);
    // 0010 legacy CHECK supports 'rejected', not 'duplicate'; preserve exact target status and reason.
    await sql(db,"INSERT INTO discovery_review_log(id,item_id,admin_id,action,previous_status,new_status,reason) VALUES(?,?,?,'duplicate','pending_review','duplicate',?)",crypto.randomUUID(),row.id,actor.admin_scope,'Ditandai duplikat: '+text(opt.reason,300)).run();
    return {id:row.id,status:'duplicate'};
   }
   if(action==='convert'&&row.status==='pending_review')await reviewItem(db,row.id,{id:actor.admin_scope},'approve',{});
   const result=await reviewItem(db,row.id,{id:actor.admin_scope},action,{rejection_reason:opt.reason,project_name:opt.project_name||row.title,chain:opt.chain});
   return {id:row.id,status:result.status};
  });
 }
 fail('METHOD_NOT_ALLOWED',405);
}

import {sql,fail,body,text} from './types.ts';
import {audit} from './auditService.ts';
import {reviewItem} from '../discovery/reviewService.ts';
import {preview,execute} from './bulkService.ts';
import {validateSource,DiscoveryError} from '../discovery/types.ts';
import {fetchDiscoverySource} from '../discovery/ingestService.ts';
const sourceFields=new Set(['name','source_type','feed_url','project_hint','trust_level','enabled']);
function sourceInput(data){
 if(Object.keys(data).some(key=>!sourceFields.has(key)))fail('INVALID_SOURCE_FIELDS');
 if(Object.hasOwn(data,'enabled')&&typeof data.enabled!=='boolean')fail('INVALID_SOURCE_ENABLED');
 try{return validateSource(data);}catch(error){if(error instanceof DiscoveryError)fail(error.message,error.status);throw error;}
}
async function sourceWrite(db,query,...params){
 try{return await sql(db,query,...params).run();}
 catch(error){if(/UNIQUE constraint failed: discovery_sources.feed_url/i.test(error?.message||''))fail('SOURCE_ALREADY_EXISTS',409);throw error;}
}
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
 if(p==='/api/admin/discovery/sources'){
  if(request.method==='GET'){
   const result=await db.prepare('SELECT id,name,source_type,feed_url,project_hint,enabled,trust_level,last_fetched_at,last_item_at,last_error,error_at,new_item_count,created_at,updated_at FROM discovery_sources ORDER BY name,id LIMIT 200').all();
   return {sources:result.results||[]};
  }
  if(request.method==='POST'){
   const input=await body(request),data=sourceInput({...input,enabled:input.enabled===undefined?false:input.enabled});
   const id=crypto.randomUUID();
   await sourceWrite(db,'INSERT INTO discovery_sources(id,name,source_type,feed_url,project_hint,enabled,trust_level) VALUES(?,?,?,?,?,?,?)',
    id,data.name,data.source_type,data.feed_url,data.project_hint,data.enabled,data.trust_level);
   await audit(env,request,actor,'discovery.source.create','discovery_source',id,{},{
    id,name:data.name,source_type:data.source_type,enabled:data.enabled,trust_level:data.trust_level});
   return {id,created:true,enabled:!!data.enabled};
  }
  fail('METHOD_NOT_ALLOWED',405);
 }
 const sourceMatch=/^\/api\/admin\/discovery\/sources\/([a-zA-Z0-9_-]{1,160})(?:\/(fetch))?$/.exec(p);
 if(sourceMatch){
  const id=sourceMatch[1],source=await sql(db,'SELECT * FROM discovery_sources WHERE id=?',id).first();
  if(!source)fail('SOURCE_NOT_FOUND',404);
  if(sourceMatch[2]==='fetch'){
   if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);
   if(!source.enabled)fail('SOURCE_DISABLED',409);
   if(!env.DISCOVERY_QUEUE)fail('DISCOVERY_QUEUE_UNAVAILABLE',503);
   const result=await fetchDiscoverySource(env,source);
   await audit(env,request,actor,'discovery.source.fetch','discovery_source',id,{},{
    id,status:result.error?'failed':'queued',reason:result.error||''});
   if(result.error)fail(result.error,502);
   return {id,...result};
  }
  if(request.method!=='PUT')fail('METHOD_NOT_ALLOWED',405);
  const changes=await body(request);
  if(!Object.keys(changes).length)fail('EMPTY_SOURCE_UPDATE');
  if(Object.keys(changes).some(key=>!sourceFields.has(key)))fail('INVALID_SOURCE_FIELDS');
  if(Object.hasOwn(changes,'enabled')&&typeof changes.enabled!=='boolean')fail('INVALID_SOURCE_ENABLED');
  const candidate=Object.fromEntries([...sourceFields].map(key=>[key,changes[key]===undefined?source[key]:changes[key]]));
  candidate.enabled=changes.enabled===undefined?!!source.enabled:changes.enabled;
  const data=sourceInput(candidate);
  const feedChanged=data.feed_url!==source.feed_url;
  const parserChanged=data.source_type!==source.source_type;
  const sourceChanged=feedChanged||parserChanged;
  // Replacing the feed endpoint or parser requires a fresh operator review.
  // Never keep automatic polling enabled on a newly configured source.
  if(sourceChanged)data.enabled=0;
  // Parser changes invalidate conditional HTTP cursors as well: a 304 from
  // the previous feed format is not evidence of a successful new-format parse.
  const updated=await sourceWrite(db,
   'UPDATE discovery_sources SET name=?,source_type=?,feed_url=?,project_hint=?,enabled=?,trust_level=?,updated_at=CURRENT_TIMESTAMP'+
   (sourceChanged?',etag=NULL,last_modified=NULL,last_fetched_at=NULL,last_error=NULL,error_at=NULL':'')+
   ' WHERE id=?'+(sourceChanged?' AND NOT EXISTS(SELECT 1 FROM discovery_items WHERE source_id=?)':''),
   data.name,data.source_type,data.feed_url,data.project_hint,data.enabled,data.trust_level,id,...(sourceChanged?[id]:[]));
  if(updated.meta?.changes!==1)fail('SOURCE_HISTORY_LOCKED',409);
  await audit(env,request,actor,'discovery.source.update','discovery_source',id,{
   id,name:source.name,source_type:source.source_type,enabled:source.enabled,trust_level:source.trust_level},{
   id,name:data.name,source_type:data.source_type,enabled:data.enabled,trust_level:data.trust_level});
  return {id,updated:true,enabled:!!data.enabled};
 }
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

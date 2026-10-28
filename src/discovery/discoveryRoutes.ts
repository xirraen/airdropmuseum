import {verifyTelegram} from '../auth.mjs';
import {cleanText,validateSource,DiscoveryError,CLASSIFICATIONS,ITEM_STATUSES} from './types.ts';
import {fetchDiscoverySource} from './ingestService.ts';
import {reviewItem} from './reviewService.ts';
const sql=(db,q,...args)=>db.prepare(q).bind(...args);
const fail=(code,status=400)=>{throw new DiscoveryError(code,status)};
function json(value,status=200,headers={}){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
async function readJson(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('JSON_REQUIRED',415);
 if(Number(request.headers.get('Content-Length'))>16384)fail('BODY_TOO_LARGE',413);
 const reader=request.body?.getReader();if(!reader)fail('JSON_REQUIRED');
 let length=0,text='';const decoder=new TextDecoder();
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();fail('BODY_TOO_LARGE',413);}text+=decoder.decode(value,{stream:true});}
 try{const data=JSON.parse(text+decoder.decode());if(!data||typeof data!=='object'||Array.isArray(data))fail('INVALID_JSON');return data;}
 catch(error){if(error instanceof DiscoveryError)throw error;fail('INVALID_JSON');}
}
async function auth(request,env){
 const db=env.DB;let user=null;
 const cookie=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)am_session=([a-f0-9]{64})(?:;|$)/);
 if(cookie){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cookie[1]));
  const token=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  user=await sql(db,'SELECT u.id FROM am_sessions s JOIN am_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',token,Math.floor(Date.now()/1000)).first();
 }
 if(!user&&env.TELEGRAM_BOT_TOKEN&&request.headers.get('X-Telegram-Init-Data')){
  const tg=await verifyTelegram(request.headers.get('X-Telegram-Init-Data'),env.TELEGRAM_BOT_TOKEN);
  user={id:'tg:'+tg.id};
 }
 if(!user)fail('LOGIN_REQUIRED',401);
 const allow=(env.MODERATOR_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!allow.includes(user.id))fail('ADMIN_REQUIRED',403);
 return user;
}
async function throttle(db,request){
 const forwarded=request.headers.get('CF-Connecting-IP')||'unknown';
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(forwarded));
 const key='discovery:'+([...new Uint8Array(hash)].slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join(''))+':'+Math.floor(Date.now()/3600000);
 const limit=['GET','HEAD'].includes(request.method)?240:50;
 const result=await sql(db,'INSERT INTO am_rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?',
  key+':'+(request.method==='GET'?'read':'write'),Math.floor(Date.now()/1000)+7200,limit).run();
 if(result.meta?.changes!==1)fail('RATE_LIMITED',429);
}
export async function discoveryRoutes(request,env,baseHeaders={}){
 const url=new URL(request.url),path=url.pathname,method=request.method,db=env.DB;
 try{
  if(!db)fail('DATABASE_UNAVAILABLE',503);
  if(!await sql(db,'SELECT version FROM am_core_schema WHERE version=6').first())fail('DISCOVERY_MIGRATION_REQUIRED',503);
  const admin=await auth(request,env);
  await throttle(db,request);
  if(!['GET','POST','PUT','DELETE'].includes(method))fail('METHOD_NOT_ALLOWED',405);
  if(method!=='GET'&&request.headers.get('Origin')!==url.origin)fail('SAME_ORIGIN_REQUIRED',403);
  if(path==='/api/discovery/sources'){
   if(method==='GET'){
    const rows=await db.prepare('SELECT * FROM discovery_sources ORDER BY name LIMIT 200').all();
    return json({sources:rows.results});
   }
   if(method==='POST'){
    const b=validateSource(await readJson(request)),id=crypto.randomUUID();
    await sql(db,'INSERT INTO discovery_sources(id,name,source_type,feed_url,project_hint,enabled,trust_level) VALUES(?,?,?,?,?,?,?)',
     id,b.name,b.source_type,b.feed_url,b.project_hint,b.enabled,b.trust_level).run();
    return json({id,created:true},201);
   }
   fail('METHOD_NOT_ALLOWED',405);
  }
  const sourceMatch=/^\/api\/discovery\/sources\/([a-zA-Z0-9-]+)(?:\/(fetch))?$/.exec(path);
  if(sourceMatch){
   const id=sourceMatch[1],source=await sql(db,'SELECT * FROM discovery_sources WHERE id=?',id).first();
   if(!source)fail('SOURCE_NOT_FOUND',404);
   if(sourceMatch[2]){
    if(method!=='POST')fail('METHOD_NOT_ALLOWED',405);
    const result=await fetchDiscoverySource(env,source);
    return json(result,result.error?502:202);
   }
   if(method==='DELETE'){
    const existing=await sql(db,'SELECT id FROM discovery_items WHERE source_id=? LIMIT 1',id).first();
    if(existing)fail('SOURCE_HAS_DISCOVERY_HISTORY',409);
    await sql(db,'DELETE FROM discovery_sources WHERE id=?',id).run();return json({deleted:true});
   }
   if(method==='PUT'){
    const b=validateSource({...source,...await readJson(request)});
    await sql(db,'UPDATE discovery_sources SET name=?,source_type=?,feed_url=?,project_hint=?,enabled=?,trust_level=?,etag=NULL,last_modified=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?',
     b.name,b.source_type,b.feed_url,b.project_hint,b.enabled,b.trust_level,id).run();
    return json({updated:true});
   }
   fail('METHOD_NOT_ALLOWED',405);
  }
  if(path==='/api/discovery/review'){
   if(method!=='GET')fail('METHOD_NOT_ALLOWED',405);
   const params=url.searchParams,status=params.get('status')||'pending_review',kind=params.get('classification')||'',
    source=params.get('source')||'',date=params.get('date')||'',confidence=params.get('confidence')||'';
   if(!ITEM_STATUSES.includes(status)&&status!=='all')fail('INVALID_FILTER');
   if(kind&&!CLASSIFICATIONS.includes(kind))fail('INVALID_FILTER');
   if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))fail('INVALID_FILTER');
   const min=confidence===''?null:Number(confidence);
   if(min!==null&&(!Number.isFinite(min)||min<0||min>1))fail('INVALID_FILTER');
   let query='SELECT i.*,s.name AS source_name,s.trust_level FROM discovery_items i JOIN discovery_sources s ON s.id=i.source_id WHERE 1=1';
   const values=[];
   if(status!=='all'){query+=' AND i.status=?';values.push(status);}
   if(kind){query+=' AND i.classification=?';values.push(kind);}
   if(source){query+=' AND i.source_id=?';values.push(source);}
   if(date){query+=' AND date(COALESCE(i.published_at,i.first_seen_at))=?';values.push(date);}
   if(min!==null){query+=' AND i.classification_confidence>=?';values.push(min);}
   query+=' ORDER BY i.first_seen_at DESC LIMIT 100';
   const rows=await sql(db,query,...values).all();return json({items:rows.results});
  }
  const itemMatch=/^\/api\/discovery\/items\/([a-zA-Z0-9-]+)(?:\/(approve|reject|convert))?$/.exec(path);
  if(itemMatch){
   const id=itemMatch[1],action=itemMatch[2];
   if(!action){
    if(method!=='GET')fail('METHOD_NOT_ALLOWED',405);
    const item=await sql(db,'SELECT i.*,s.name AS source_name FROM discovery_items i JOIN discovery_sources s ON s.id=i.source_id WHERE i.id=?',id).first();
    if(!item)fail('ITEM_NOT_FOUND',404);
    const logs=await sql(db,'SELECT action,admin_id,previous_status,new_status,reason,created_at FROM discovery_review_log WHERE item_id=? ORDER BY created_at DESC LIMIT 40',id).all();
    return json({item,review_log:logs.results});
   }
   if(method!=='POST')fail('METHOD_NOT_ALLOWED',405);
   const body=action==='approve'?{}:await readJson(request);
   return json(await reviewItem(db,id,admin,action,body));
  }
  fail('NOT_FOUND',404);
 }catch(error){
  if(error instanceof DiscoveryError)return json({error:error.message},error.status,baseHeaders);
  if(error?.message==='UNAUTHORIZED')return json({error:'LOGIN_REQUIRED'},401,baseHeaders);
  if(/UNIQUE constraint failed/i.test(error?.message||''))return json({error:'SOURCE_OR_ITEM_ALREADY_EXISTS'},409,baseHeaders);
  return json({error:'DISCOVERY_SERVICE_UNAVAILABLE'},503,baseHeaders);
 }
}

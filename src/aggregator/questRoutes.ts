import {verifyTelegram} from '../auth.mjs';
import {rejectSensitive} from '../aggregator-secrets.mjs';
import {err,httpsURL,DISCLAIMER} from './questTypes.ts';
import {createQuest,editQuest,deleteQuest,listQuests,myQuests,quest,setProgress,campaignEligibility} from './questService.ts';
import {pointsSummary,userStreak,statement as s} from './pointsService.ts';
import {nextActions} from './nextActionService.ts';
const routeRoot='/api/aggregator';
async function jsonBody(req){
 if(!req.headers.get('Content-Type')?.startsWith('application/json'))err('JSON_REQUIRED',415);
 if(Number(req.headers.get('Content-Length'))>16384)err('BODY_TOO_LARGE',413);
 const reader=req.body?.getReader();if(!reader)err('JSON_REQUIRED',415);
 const chunks=[];let n=0;for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>16384){await reader.cancel();err('BODY_TOO_LARGE',413)}chunks.push(value)}
 const buf=new Uint8Array(n);let i=0;for(const chunk of chunks){buf.set(chunk,i);i+=chunk.length}
 let parsed;try{parsed=JSON.parse(new TextDecoder().decode(buf))}catch{err('INVALID_JSON')}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))err('INVALID_JSON');rejectSensitive(parsed);return parsed;
}
async function admin(req,env){
 if(!env.AGGREGATOR_ADMIN_TOKEN)return false;
 const token=req.headers.get('Authorization')||'';
 if(!token.startsWith('Bearer '))return false;
 const key=token.slice(7);
 const hash=async x=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)));
 const [a,b]=await Promise.all([hash(key),hash(env.AGGREGATOR_ADMIN_TOKEN)]);
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
async function scope(req,env,required=true){
 const data=req.headers.get('X-Telegram-Init-Data');
 if(!data){if(required)err('TELEGRAM_VERIFICATION_REQUIRED',401);return null}
 try{const user=await verifyTelegram(data,env.TELEGRAM_BOT_TOKEN);return 'tg:'+user.id}catch{err('TELEGRAM_VERIFICATION_REQUIRED',401)}
}
async function limit(db,req,path){
 const input=req.headers.get('CF-Connecting-IP')||'unknown';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join('');
 const period=60,now=Math.floor(Date.now()/1000),bucket=Math.floor(now/period);
 const r=await s(db,'INSERT INTO aggregator_rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?','quest:'+hash+':'+bucket,now+120,path==='write'?30:120).run();
 if(!r.meta?.changes)err('RATE_LIMITED',429);
}
const validScope=v=>typeof v==='string'&&/^tg:[0-9]{1,20}$/.test(v);
export async function questRoutes(req,env={},headers={}){
 const path=new URL(req.url).pathname.slice(routeRoot.length),url=new URL(req.url),method=req.method,db=env.DB;
 const json=(body,code=200)=>new Response(JSON.stringify(body),{status:code,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 try{
  if(!db)err('DATABASE_UNAVAILABLE',503);
  const migrated=await s(db,'SELECT version FROM am_core_schema WHERE version=8').first();
  if(!migrated)err('QUEST_MIGRATION_REQUIRED',503);
  const write=!['GET','HEAD'].includes(method);
  if(write){const origin=req.headers.get('Origin');if(origin&&origin!==url.origin)err('ORIGIN_NOT_ALLOWED',403)}
  await limit(db,req,write?'write':'read');
  const isAdmin=await admin(req,env);
  const detail=path.match(/^\/campaigns\/([a-z0-9-]{1,80})\/quests$/);
  if(detail&&method==='GET')return json({...await listQuests(db,detail[1],await scope(req,env,false),url.searchParams),disclaimer:DISCLAIMER});
  if(detail&&method==='POST'){if(!isAdmin)err('ADMIN_REQUIRED',403);return json({quest:await createQuest(db,detail[1],await jsonBody(req))},201)}
  const item=path.match(/^\/quests\/([a-f0-9-]{36})$/);
  if(item&&method==='PUT'){if(!isAdmin)err('ADMIN_REQUIRED',403);return json({quest:await editQuest(db,item[1],await jsonBody(req))})}
  if(item&&method==='DELETE'){if(!isAdmin)err('ADMIN_REQUIRED',403);return json(await deleteQuest(db,item[1]))}
  if(path==='/quests/my'&&method==='GET'){
   const uid=await scope(req,env),quests=await myQuests(db,uid,url.searchParams),points=await pointsSummary(db,uid,{page:url.searchParams.get('ledger_page'),limit:url.searchParams.get('ledger_limit')});
   return json({...quests,...points,streak:await userStreak(db,uid,url.searchParams.get('tz')||'UTC'),disclaimer:DISCLAIMER});
  }
  if(path==='/points'&&method==='GET'){const uid=await scope(req,env);return json({...await pointsSummary(db,uid,{page:url.searchParams.get('page'),limit:url.searchParams.get('limit')}),streak:await userStreak(db,uid,url.searchParams.get('tz')||'UTC')})}
  const progress=path.match(/^\/quests\/([a-f0-9-]{36})\/(progress|evidence)$/);
  if(progress&&['POST','PUT'].includes(method)){
   const b=await jsonBody(req);
   const uid=isAdmin&&validScope(b.user_scope)?b.user_scope:await scope(req,env);
   if(progress[2]==='evidence'){
    const q=await quest(db,progress[1]);if(!q)err('QUEST_NOT_FOUND',404);
    if(q.verification_method!=='url_submission')err('EVIDENCE_NOT_SUPPORTED');
    b.evidence_url=httpsURL(b.evidence_url,false);b.status='submitted';
   }
   if(b.status==='verified'&&!isAdmin)err('VERIFICATION_NOT_ALLOWED',403);
   const record=await setProgress(db,uid,progress[1],b,isAdmin?'admin':'user');
   return json({progress:record,disclaimer:DISCLAIMER});
  }
  const campaignProgress=path.match(/^\/campaigns\/([a-z0-9-]{1,80})\/progress$/);
  if(campaignProgress&&method==='GET'){
   const uid=await scope(req,env);
   const result=await campaignEligibility(db,uid,campaignProgress[1]);
   return json({...result,points:await pointsSummary(db,uid,{limit:1}),streak:await userStreak(db,uid,url.searchParams.get('tz')||'UTC'),disclaimer:DISCLAIMER});
  }
  if(path==='/next-actions'&&method==='GET')return json({...await nextActions(db,await scope(req,env)),disclaimer:DISCLAIMER});
  err('METHOD_NOT_ALLOWED',405);
 }catch(error){
  return json({error:error.message||'SERVICE_UNAVAILABLE'},error.status||503);
 }
}

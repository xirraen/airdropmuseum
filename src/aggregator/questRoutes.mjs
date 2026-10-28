import {aggregatorUser,aggregatorAdmin} from './auth.mjs';
import {requireDecision} from './decisionGuard.mjs';
import {verifyTelegram} from '../auth.mjs';
import {digest} from '../aggregator-jobs.mjs';
import {createQuest,editQuest,deleteQuest,questById,campaignQuests,myQuests,campaignProgress,changeProgress,submitEvidence} from './questService.mjs';
import {pointsSummary,userStreak,ledger} from './pointsService.mjs';
import {nextActions} from './nextActionService.mjs';
import {problem} from './questTypes.mjs';
const user=aggregatorUser;
async function admin(request,env){return aggregatorAdmin(request,env,'quest.write','quest.manage');}
async function body(request){if(!request.headers.get('Content-Type')?.startsWith('application/json'))problem('JSON_REQUIRED',415);if(Number(request.headers.get('Content-Length'))>16384)problem('BODY_TOO_LARGE',413);let raw='';if(!request.body)problem('JSON_REQUIRED');for await(const chunk of request.body){raw+=new TextDecoder().decode(chunk);if(raw.length>16384)problem('BODY_TOO_LARGE',413)}let b;try{b=JSON.parse(raw)}catch{problem('INVALID_JSON')}if(!b||typeof b!=='object'||Array.isArray(b))problem('INVALID_INPUT');return b;}
const num=(url,key,fallback,max)=>{const value=url.searchParams.get(key);if(value===null)return fallback;if(!/^\d+$/.test(value))problem('INVALID_PAGINATION');const n=Number(value);if(n<0||n>max)problem('INVALID_PAGINATION');return n;};
export async function questRoutes(request,env,headers={}){
 const url=new URL(request.url),path=url.pathname.slice('/api/aggregator'.length),method=request.method;
 const respond=(data,status=200)=>Response.json(data,{status,headers:{...headers,'Cache-Control':'no-store'}});
 const campaign=path.match(/^\/campaigns\/([a-z0-9-]{1,80})\/(quests|progress)$/);
 const quest=path.match(/^\/quests\/([0-9a-f-]{36})(?:\/(progress|evidence))?$/);
 const tracked=path==='/quests/my'||path==='/next-actions'||!!campaign||!!quest;
 if(!tracked)return null;
 try{
 if(!env.DB)return respond({error:'DATABASE_UNAVAILABLE'},503);
 if(!['GET','HEAD'].includes(method)){const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)problem('ORIGIN_NOT_ALLOWED',403);}
 const limit=num(url,'limit',25,100),offset=num(url,'offset',0,100000);
 if(campaign?.[2]==='quests'&&['GET','HEAD'].includes(method)){
  let scope=null;if(request.headers.get('X-Telegram-Init-Data'))scope=await user(request,env);
  return respond(await campaignQuests(env.DB,campaign[1],scope,{limit,offset}));
 }
 if(campaign?.[2]==='quests'&&method==='POST'){await admin(request,env);return respond(await createQuest(env.DB,campaign[1],await body(request)),201);}
 if(quest&&!quest[2]&&method==='PUT'){await admin(request,env);return respond(await editQuest(env.DB,quest[1],await body(request)));}
 if(quest&&!quest[2]&&method==='DELETE'){await admin(request,env);return respond(await deleteQuest(env.DB,quest[1]));}
 if(path==='/quests/my'&&['GET','HEAD'].includes(method)){
  const scope=await user(request,env),[progress,points,history,streak]=await Promise.all([myQuests(env.DB,scope,{limit,offset}),pointsSummary(env.DB,scope),ledger(env.DB,scope,{limit,offset}),userStreak(env.DB,scope,url.searchParams.get('timezone')||'UTC')]);
  return respond({progress,points,ledger:history,streak});
 }
 if(campaign?.[2]==='progress'&&['GET','HEAD'].includes(method))return respond(await campaignProgress(env.DB,campaign[1],await user(request,env)));
 if(path==='/next-actions'&&['GET','HEAD'].includes(method))return respond(await nextActions(env.DB,await user(request,env),{limit:num(url,'limit',100,100)||100,offset}));
 if(quest&&quest[2]==='progress'&&['POST','PUT'].includes(method)){
  const b=await body(request);let scope,actor='user';
  if(b.user_scope!==undefined){
   await admin(request,env);actor='admin';scope=b.user_scope;if(typeof scope!=='string')problem('USER_SCOPE_REQUIRED');
  }else scope=await user(request,env);
  if(actor==='user'&&b.status==='verified')problem('VERIFICATION_REQUIRED',403);
  const record=await questById(env.DB,quest[1]);if(!record)problem('QUEST_NOT_FOUND',404);
  await requireDecision(env.DB,scope,record.campaign_id);
  return respond({progress:await changeProgress(env.DB,scope,quest[1],b,actor)});
 }
 if(quest&&quest[2]==='evidence'&&method==='POST'){
  const scope=await user(request,env),record=await questById(env.DB,quest[1]);if(!record)problem('QUEST_NOT_FOUND',404);
  await requireDecision(env.DB,scope,record.campaign_id);return respond({progress:await submitEvidence(env.DB,scope,quest[1],await body(request))});
 }
 return respond({error:'METHOD_NOT_ALLOWED'},405);
 }catch(err){const status=err.status||503;return respond({error:status===503?'QUEST_TRACKER_UNAVAILABLE':err.message},status);}
}

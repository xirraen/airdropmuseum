import {exportJournal} from './exportService.ts';
import {erasurePreview,eraseJournal} from './privacyService.ts';
import {platformUser} from '../platform-api.mjs';
import {JournalError,fail,sql,bodyJson,requiredId,json,cutoff,expected,refs} from './types.ts';
import {createDecision,decisions} from './decisionService.ts';
import {rebuild,reconcile} from './projectionService.ts';
import {addEvidence,addActivity,reviseHypothesis,compensate,consent} from './evidenceService.ts';
import {recordOutcome,finalize} from './outcomeService.ts';
import {patterns,weekly,recordGeneratedInsight} from './patternService.ts';
import {evidenceChainCard} from './evidenceCardService.ts';
function originGuard(req){
 const u=new URL(req.url);
 if(req.headers.get('Origin')!==u.origin||req.headers.get('Sec-Fetch-Site')==='cross-site')fail('ORIGIN_DENIED',403);
}
const overview=state=>({aggregate_id:state.aggregate_id,campaign_id:state.campaign_id,version:state.version,
 status:state.status,decision:state.decision,decision_cutoff_at:state.decision_cutoff_at,
 outcome:state.outcome,outcome_cutoff_at:state.outcome_cutoff_at,first_outcome_at:state.first_outcome_at,analysis_consent:state.analysis_consent,
 activities:state.activities,hypothesis:state.hypothesis,evidence:state.evidence,timeline:state.timeline,
 finalized_at:state.finalized_at,created_at:state.created_at,updated_at:state.updated_at,insights:state.insights});
export async function autopsyRoutes(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method,head=method==='HEAD';
 try{
  const card=/^\/api\/autopsy\/evidence-card\/([a-zA-Z0-9_-]{1,160})$/.exec(path);
  if(card){if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
   return json(await evidenceChainCard(env,card[1]),200,head);
  }
  if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
  if(!await sql(env.DB,'SELECT version FROM am_core_schema WHERE version=11').first())fail('ARCHITECTURE_MIGRATION_REQUIRED',503);
  if(!['GET','HEAD','POST'].includes(method))fail('METHOD_NOT_ALLOWED',405);
  if(method==='POST')originGuard(request);
  const user=await platformUser(request,env,false);
  if(!user)fail('LOGIN_REQUIRED',401);
  const scope=user.id;
  if(!await sql(env.DB,'SELECT version FROM am_core_schema WHERE version=16').first())fail('PRIVACY_MIGRATION_REQUIRED',503);
  if(path==='/api/autopsy/privacy'){
   if(['GET','HEAD'].includes(method))return json(await erasurePreview(env.DB,scope),200,head);
   const result=await eraseJournal(env,scope,await bodyJson(request));
   return json(result,result.backup_replay_protected?200:202);
  }
  if(path==='/api/autopsy/decision-status'){
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   const campaign=requiredId(url.searchParams.get('campaign_id'));
   const row=await sql(env.DB,'SELECT aggregate_id FROM decision_entries WHERE user_scope=? AND campaign_id=?',scope,campaign).first();
   const state=row?await rebuild(env.DB,scope,row.aggregate_id):null;
   if(!state||state.status==='cancelled'||!state.decision)fail('DECISION_REQUIRED',409);
   return json({decision_status:'ready',aggregate_id:state.aggregate_id,private:true},200,head);
  }
  if(path==='/api/autopsy/export'){if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);return json(await exportJournal(env.DB,scope,url.searchParams),200,head);}
  if(path==='/api/autopsy/decisions'){
   if(method==='POST'){
    const result=await createDecision(env.DB,scope,await bodyJson(request));
    return json({aggregate_id:result.state.aggregate_id,version:result.version,state:overview(result.state),private:true},201);
   }
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):50;
   return json({items:await decisions(env.DB,scope,limit),private:true},200,head);
  }
  if(path==='/api/autopsy/insights/patterns'){
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   return json({...await patterns(env.DB,scope),private:true},200,head);
  }
  if(path==='/api/autopsy/insights/weekly'){
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   return json({...await weekly(env.DB,scope),private:true},200,head);
  }
  // Disable old direct-mutation routes. Existing private rows must be migrated separately.
  if(path==='/api/autopsy'||path==='/api/decisions'||path.startsWith('/api/decisions/'))
   fail('LEGACY_DIRECT_WRITES_DISABLED',410);
  const match=/^\/api\/autopsy\/([a-zA-Z0-9_-]{1,160})(?:\/(evidence|activity|hypothesis|outcome|finalize|compensate|consent|replay))?$/.exec(path);
  if(!match)fail('NOT_FOUND',404);
  const aggregate=requiredId(match[1]),operation=match[2];
  const state=await rebuild(env.DB,scope,aggregate);
  if(!state)fail('NOT_FOUND',404);
  if(!operation){if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   return json({state:overview(state),private:true},200,head);}
  if(method!=='POST')fail('METHOD_NOT_ALLOWED',405);
  const body=await bodyJson(request);
  if(operation==='replay'){if(body.expected_version!==state.version)fail('VERSION_CONFLICT',409);return json({state:overview(await reconcile(env.DB,scope,aggregate)),private:true});}
  const action={
   evidence:()=>addEvidence(env.DB,scope,state,body),
   activity:()=>addActivity(env.DB,scope,state,body),
   hypothesis:()=>reviseHypothesis(env.DB,scope,state,body),
   outcome:()=>recordOutcome(env.DB,scope,state,body),
   finalize:()=>finalize(env.DB,scope,state,body),
   compensate:()=>compensate(env.DB,scope,state,body),
   consent:()=>consent(env.DB,scope,state,body)
  }[operation];
  if(!action)fail('NOT_FOUND',404);
  const result=await action();
  if(operation==='finalize'&&result.state.analysis_consent){
   try{
    const insight=await recordGeneratedInsight(env.DB,scope,result.state);
    if(insight)return json({version:insight.version,state:overview(insight.state),private:true},200);
   }catch{/* Finalization already committed. Insight can be recalculated from events on read. */}
  }
  return json({version:result.version,event_id:result.id,state:overview(result.state),private:true},200);
 }catch(error){
  const status=error instanceof JournalError?error.status:
    error?.message==='UNAUTHORIZED'||error?.message==='LOGIN_REQUIRED'?401:
    Number.isInteger(error?.status)&&error.status>=400&&error.status<500?error.status:503;
  const code=error instanceof JournalError?error.message:status===401?'LOGIN_REQUIRED':status===404?'NOT_FOUND':status===400?'INVALID_REQUEST':'SERVICE_UNAVAILABLE';
  return json({error:code},status,head);
 }
}

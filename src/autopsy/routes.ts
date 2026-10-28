import {platformUser} from '../platform-api.mjs';
import {JournalError,fail,sql,bodyJson,parseAutopsy,parseDecision,parseOutcome,campaignId} from './validation.ts';
import {buildPatterns,buildWeekly,weekRange} from './patterns.ts';
import {evidenceCard} from './evidenceCard.ts';
const sqlRow=(db,q,...p)=>sql(db,q,...p).first();
const noStore={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const respond=(value,status=200,head=false)=>new Response(head?null:JSON.stringify(value),{status,headers:{...noStore,'Content-Type':'application/json; charset=utf-8'}});
const clean=row=>{if(!row)return null;const {user_scope,...safe}=row;return {...safe,...(Object.hasOwn(safe,'evidence_json')?{evidence:JSON.parse(safe.evidence_json||'[]'),evidence_json:undefined}:{} )};};
function sameOrigin(request){
 const origin=new URL(request.url).origin;
 if(request.headers.get('Origin')!==origin||request.headers.get('Sec-Fetch-Site')==='cross-site')fail('ORIGIN_DENIED',403);
}
async function campaign(env,id,requireEnded=false){
 const row=await sqlRow(env.DB,'SELECT id,payload,review_status FROM am_core_exhibits WHERE id=? OR json_extract(payload,\'$.slug\')=? LIMIT 1',id,id);
 if(!row)fail('CAMPAIGN_NOT_FOUND',404);
 const p=JSON.parse(row.payload||'{}');
 if(['draft','pending_review','private_draft'].includes(row.review_status))fail('CAMPAIGN_NOT_REVIEWED',409);
 if(requireEnded){
  const ended=['completed','ended','closed','expired','claimed','archived'].includes(String(p.status||'').toLowerCase());
  const claimEnd=typeof p.claim_deadline_at==='string'?Date.parse(p.claim_deadline_at):NaN;
  if(!ended&&!(Number.isFinite(claimEnd)&&claimEnd<=Date.now()))fail('CAMPAIGN_NOT_FINISHED',409);
 }
 return row.id;
}
async function optInRows(db,user){
 const q=await sql(db,'SELECT activity_before_snapshot,activity_after_snapshot,quest_count,chain_count,gas_cost_usd,decision_source,outcome,consent_to_analysis,created_at FROM claim_autopsies WHERE user_scope=? AND consent_to_analysis=1 ORDER BY created_at DESC LIMIT 5001',user).all();
 if((q.results||[]).length>5000)fail('PATTERN_SAMPLE_LIMIT',422);
 return q.results||[];
}
async function savePatternSnapshot(db,user){
 const summary=buildPatterns(await optInRows(db,user));
 await sql(db,`INSERT INTO user_pattern_snapshots(id,user_scope,sample_size,period_start,period_end,snapshot_json)
 VALUES(?,?,?,?,?,?) ON CONFLICT(user_scope) DO UPDATE SET sample_size=excluded.sample_size,period_start=excluded.period_start,period_end=excluded.period_end,snapshot_json=excluded.snapshot_json,updated_at=CURRENT_TIMESTAMP`,
 crypto.randomUUID(),user,summary.sample_count,summary.period.from,summary.period.to,JSON.stringify(summary)).run();
}
export async function autopsyRoutes(request,env){
 const url=new URL(request.url),path=url.pathname,method=request.method,head=method==='HEAD';
 try{
  const card= /^\/api\/evidence-card\/([a-zA-Z0-9_-]{1,160})$/.exec(path);
  if(card){
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
   return respond(await evidenceCard(env,card[1]),200,head);
  }
  if(!env.DB)fail('DATABASE_UNAVAILABLE',503);
  const version=await sqlRow(env.DB,'SELECT version FROM am_core_schema WHERE version=11');
  if(!version)fail('AUTOPSY_MIGRATION_REQUIRED',503);
  if(!['GET','HEAD','POST','PUT'].includes(method))fail('METHOD_NOT_ALLOWED',405);
  if(!['GET','HEAD'].includes(method))sameOrigin(request);
  const user=await platformUser(request,env,false);
  if(!user)fail('LOGIN_REQUIRED',401);
  const scope=user.id;
  if(path==='/api/autopsy'){
   if(method==='POST'){
    const data=parseAutopsy(await bodyJson(request)),campaign_id=await campaign(env,data.campaign_id,true),id=crypto.randomUUID();
    await sql(env.DB,`INSERT INTO claim_autopsies(id,user_scope,campaign_id,wallet_address,activity_before_snapshot,activity_after_snapshot,quest_count,chain_count,gas_cost_usd,bridge_cost_usd,research_minutes,decision_source,outcome,hypothesis,evidence_json,consent_to_analysis)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,scope,campaign_id,data.wallet_address,data.activity_before_snapshot,data.activity_after_snapshot,data.quest_count,data.chain_count,data.gas_cost_usd,data.bridge_cost_usd,data.research_minutes,data.decision_source,data.outcome,data.hypothesis,data.evidence_json,data.consent_to_analysis).run();
    if(data.consent_to_analysis){try{await savePatternSnapshot(env.DB,scope);}catch{/* Pattern cache is optional; raw personal record remains authoritative. */}}
    return respond({id,private:true,consent_to_analysis:!!data.consent_to_analysis,notice:'Catatan pribadi. Analisis hanya jika izin diberikan.'},201);
   }
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):30;
   if(!Number.isInteger(limit)||limit<1||limit>50)fail('INVALID_LIMIT');
   const rows=await sql(env.DB,'SELECT * FROM claim_autopsies WHERE user_scope=? ORDER BY created_at DESC,id DESC LIMIT ?',scope,limit).all();
   return respond({items:(rows.results||[]).map(clean),private:true,limit,notice:'Catatan hanya dapat diakses oleh pemilik akun.'},200,head);
  }
  const detail=/^\/api\/autopsy\/([a-zA-Z0-9_-]{1,160})$/.exec(path);
  if(detail){
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   const row=await sqlRow(env.DB,'SELECT * FROM claim_autopsies WHERE id=? AND user_scope=?',detail[1],scope);
   if(!row)fail('NOT_FOUND',404);
   return respond({item:clean(row),private:true},200,head);
  }
  if(path==='/api/decisions'){
   if(method!=='POST')fail('METHOD_NOT_ALLOWED',405);
   const entry=parseDecision(await bodyJson(request)),campaign_id=await campaign(env,entry.campaign_id),id=crypto.randomUUID();
   const exists=await sqlRow(env.DB,'SELECT id FROM decision_entries WHERE user_scope=? AND campaign_id=?',scope,campaign_id);
   if(exists)fail('DECISION_ALREADY_EXISTS',409);
   try{
    await sql(env.DB,`INSERT INTO decision_entries(id,user_scope,campaign_id,reason,primary_evidence_url,decision_source,time_budget_minutes,cost_ceiling_usd,realistic_expectations)
 VALUES(?,?,?,?,?,?,?,?,?)`,id,scope,campaign_id,entry.reason,entry.primary_evidence_url,entry.decision_source,entry.time_budget_minutes,entry.cost_ceiling_usd,entry.realistic_expectations).run();
   }catch{fail('DECISION_ALREADY_EXISTS',409);}
   return respond({id,campaign_id,follow_status:'following',private:true,notice:'Keputusan tersimpan sebelum status mengikuti ditetapkan.'},201);
  }
  const outcome=/^\/api\/decisions\/([a-zA-Z0-9_-]{1,160})\/outcome$/.exec(path);
  if(outcome){
   if(method!=='PUT')fail('METHOD_NOT_ALLOWED',405);
   const d=await sqlRow(env.DB,'SELECT id,campaign_id FROM decision_entries WHERE id=? AND user_scope=?',outcome[1],scope);
   if(!d)fail('NOT_FOUND',404);
   await campaign(env,d.campaign_id,true);
   const entry=parseOutcome(await bodyJson(request));
   await sql(env.DB,`INSERT INTO outcome_reviews(id,user_scope,decision_id,outcome,lessons)
 VALUES(?,?,?,?,?) ON CONFLICT(decision_id) DO UPDATE SET outcome=excluded.outcome,lessons=excluded.lessons,reviewed_at=CURRENT_TIMESTAMP WHERE outcome_reviews.user_scope=excluded.user_scope`,
 crypto.randomUUID(),scope,d.id,entry.outcome,entry.lessons).run();
   return respond({decision_id:d.id,outcome:entry.outcome,private:true,linked:true});
  }
  if(path==='/api/insights/patterns'){
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   const summary=buildPatterns(await optInRows(env.DB,scope));
   return respond({...summary,private:true,consent:'Hanya autopsy dengan consent_to_analysis=true yang dianalisis.'},200,head);
  }
  if(path==='/api/insights/weekly'){
   if(!['GET','HEAD'].includes(method))fail('METHOD_NOT_ALLOWED',405);
   const range=weekRange(),rows=await sql(env.DB,`SELECT d.id,d.campaign_id,d.decision_source,d.created_at,r.outcome,r.lessons FROM decision_entries d LEFT JOIN outcome_reviews r ON r.decision_id=d.id AND r.user_scope=d.user_scope
 WHERE d.user_scope=? AND d.created_at>=? AND d.created_at<? ORDER BY d.created_at DESC LIMIT 501`,scope,range.start.replace('T',' ').replace('Z',''),range.end.replace('T',' ').replace('Z','')).all();
   if((rows.results||[]).length>500)fail('WEEKLY_SAMPLE_LIMIT',422);
   return respond({...buildWeekly(rows.results||[],range),private:true},200,head);
  }
  fail('NOT_FOUND',404);
 }catch(err){
  const status=err instanceof JournalError?err.status:typeof err?.status==='number'&&err.status>=400&&err.status<500?err.status:503;
  const code=err instanceof JournalError?err.message:status===503?'SERVICE_UNAVAILABLE':'NOT_FOUND';
  return respond({error:code},status,head);
 }
}

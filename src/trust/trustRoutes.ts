import {platformUser,rate,digest} from '../platform-api.mjs';
import {TrustError,TRUST_TIERS,CAUTION,metadata,shortText,publicRun,statement} from './types.ts';
import {normalizeTrustUrl} from './domainPolicy.ts';
import {verifyCampaign,audit} from './verificationService.ts';
const sql=statement;
const error=(code,status=400)=>{throw new TrustError(code,status);};
const isAdmin=(user,env)=>!!user&&(env.MODERATOR_IDS||'').split(',').map(x=>x.trim()).includes(user.id);
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
async function readBody(request){
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))error('JSON_REQUIRED',415);
 if(Number(request.headers.get('Content-Length')||0)>16384)error('BODY_TOO_LARGE',413);
 const reader=request.body?.getReader();if(!reader)error('JSON_REQUIRED');
 let length=0,body='';const decoder=new TextDecoder();
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>16384){await reader.cancel();error('BODY_TOO_LARGE',413);}body+=decoder.decode(value,{stream:true});}
 try{const data=JSON.parse(body+decoder.decode());if(!data||Array.isArray(data)||typeof data!=='object')error('INVALID_BODY');return data;}catch(e){if(e instanceof TrustError)throw e;error('INVALID_BODY');}
}
async function access(db,id,admin){
 const campaign=await sql(db,'SELECT id,review_status FROM am_core_exhibits WHERE id=?',id).first();
 if(!campaign||(!admin&&['draft','pending_review','private_draft'].includes(campaign.review_status)))error('CAMPAIGN_NOT_FOUND',404);
 return campaign;
}
export async function trustRoutes(request,env,baseHeaders={}){
 const url=new URL(request.url),path=url.pathname,method=request.method,db=env.DB;
 try{
  if(!db)error('DATABASE_UNAVAILABLE',503);
  if(!await sql(db,'SELECT version FROM am_core_schema WHERE version=7').first())error('TRUST_MIGRATION_REQUIRED',503);
  if(!['GET','PUT','POST'].includes(method))error('METHOD_NOT_ALLOWED',405);
  if(method!=='GET'&&request.headers.get('Origin')!==url.origin)error('SAME_ORIGIN_REQUIRED',403);
  let user=null;try{user=await platformUser(request,env,false);}catch{}
  const admin=isAdmin(user,env);
  if(method!=='GET'){
   if(!admin)error(user?'ADMIN_REQUIRED':'LOGIN_REQUIRED',user?403:401);
   await rate(db,'trust:'+await digest(user.id)+':'+(path.endsWith('/verify')?'verify':'write'),path.endsWith('/verify')?3:40,3600);
  }
  if(path==='/api/trust/sources'&&method==='GET'){
   const campaignId=url.searchParams.get('campaign_id');
   if(campaignId){if(campaignId.length>160)error('INVALID_ID');await access(db,campaignId,admin);}
   const query="SELECT p.id,p.source_url,p.host,p.tier,p.trust_score,p.last_fetched_at,p.http_status,l.campaign_id,l.linked_from_official,l.official_domain_verified FROM source_trust_profiles p JOIN campaign_source_links l ON l.source_id=p.id JOIN am_core_exhibits e ON e.id=l.campaign_id WHERE l.enabled=1 AND (? IS NULL OR l.campaign_id=?)"+(admin?'':" AND e.review_status NOT IN ('draft','pending_review','private_draft')")+" ORDER BY p.updated_at DESC LIMIT 200";
   const rows=await sql(db,query,campaignId,campaignId).all();
   return json({sources:rows.results||[],notice:CAUTION},200,baseHeaders);
  }
  const campaign=/^\/api\/trust\/campaigns\/([a-zA-Z0-9_-]{1,160})\/(verify|verification|conflicts)$/.exec(path);
  if(campaign){
   const id=campaign[1],op=campaign[2];await access(db,id,admin);
   if(op==='verify'){
    if(method!=='POST')error('METHOD_NOT_ALLOWED',405);
    if(!admin)error('ADMIN_REQUIRED',403);
    return json(await verifyCampaign(env,id,{trigger:'manual',actor:user.id}),202,baseHeaders);
   }
   if(method!=='GET')error('METHOD_NOT_ALLOWED',405);
   if(op==='verification'){
    const rows=await sql(db,'SELECT * FROM verification_runs WHERE campaign_id=? ORDER BY started_at DESC LIMIT 30',id).all();
    const latest=rows.results?.[0];let result=null;
    if(latest&&latest.status==='complete'){try{result=JSON.parse(latest.result_json);}catch{}}
    return json({campaign_id:id,confidence_label:latest?.confidence_label||'needs_review',latest:publicRun(latest),result:result?{fields:result.fields,sources:result.sources,open_conflicts:result.open_conflicts,failed_sources:result.failed_sources}:null,runs:(rows.results||[]).map(publicRun),notice:CAUTION},200,baseHeaders);
   }
   const rows=await sql(db,"SELECT c.id,c.field,c.value_a,c.value_b,c.source_a,c.source_b,c.severity,c.status,c.created_at,c.updated_at,c.closed_at,p.source_url AS source_a_url,q.source_url AS source_b_url FROM source_conflicts c JOIN source_trust_profiles p ON p.id=c.source_a JOIN source_trust_profiles q ON q.id=c.source_b WHERE c.campaign_id=? ORDER BY CASE c.status WHEN 'open' THEN 0 ELSE 1 END,c.created_at DESC LIMIT 100",id).all();
   return json({conflicts:(rows.results||[]).map(c=>({...c,value_a:JSON.parse(c.value_a),value_b:JSON.parse(c.value_b)})),notice:CAUTION},200,baseHeaders);
  }
  if(path==='/api/trust/conflicts'&&method==='GET'){
   if(!admin)error('ADMIN_REQUIRED',403);
   const status=url.searchParams.get('status')||'open';if(!['open','resolved','ignored'].includes(status))error('INVALID_STATUS');
   const rows=await sql(db,"SELECT c.id,c.campaign_id,c.field,c.value_a,c.value_b,c.severity,c.status,c.created_at,p.source_url AS source_a_url,q.source_url AS source_b_url FROM source_conflicts c JOIN source_trust_profiles p ON p.id=c.source_a JOIN source_trust_profiles q ON q.id=c.source_b WHERE c.status=? ORDER BY CASE c.severity WHEN 'material' THEN 0 WHEN 'minor' THEN 1 ELSE 2 END,c.created_at DESC LIMIT 100",status).all();
   return json({conflicts:(rows.results||[]).map(c=>({...c,value_a:JSON.parse(c.value_a),value_b:JSON.parse(c.value_b)}))},200,baseHeaders);
  }
  const moderation=/^\/api\/trust\/conflicts\/([a-zA-Z0-9-]{1,160})\/(resolve|ignore)$/.exec(path);
  if(moderation){
   if(method!=='POST')error('METHOD_NOT_ALLOWED',405);if(!admin)error('ADMIN_REQUIRED',403);
   const id=moderation[1],action=moderation[2],body=await readBody(request),reason=shortText(body.reason,300);
   if(!reason)error('REASON_REQUIRED');
   const row=await sql(db,'SELECT * FROM source_conflicts WHERE id=?',id).first();
   if(!row)error('CONFLICT_NOT_FOUND',404);
   if(row.status!=='open')error('CONFLICT_ALREADY_CLOSED',409);
   const next=action==='resolve'?'resolved':'ignored';
   const updated=await sql(db,"UPDATE source_conflicts SET status=?,closed_at=CURRENT_TIMESTAMP,closed_by=?,reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'",next,user.id,reason,id).run();
   if(updated.meta?.changes!==1)error('CONFLICT_ALREADY_CLOSED',409);
   await audit(db,user.id,'conflict_'+next,'source_conflict',id,'open',next,reason);
   if(env.TRUST_CACHE)await env.TRUST_CACHE.delete('trust:campaign:'+row.campaign_id+':latest');
   return json({id,status:next,reviewed_by:user.id,notice:CAUTION},200,baseHeaders);
  }
  const source=/^\/api\/trust\/sources\/([a-zA-Z0-9_-]{1,160})$/.exec(path);
  if(source){
   if(method!=='PUT')error('METHOD_NOT_ALLOWED',405);if(!admin)error('ADMIN_REQUIRED',403);
   const body=await readBody(request),id=source[1],campaignId=shortText(body.campaign_id,160),urlText=normalizeTrustUrl(body.source_url);
   if(!campaignId)error('CAMPAIGN_REQUIRED');await access(db,campaignId,true);
   const existing=await sql(db,'SELECT * FROM source_trust_profiles WHERE id=?',id).first();
   if(existing&&existing.source_url!==urlText)error('SOURCE_URL_IMMUTABLE',409);
   const existsUrl=await sql(db,'SELECT id FROM source_trust_profiles WHERE source_url=?',urlText).first();
   if(existsUrl&&existsUrl.id!==id)error('SOURCE_URL_ALREADY_REGISTERED',409);
   const link=await sql(db,'SELECT * FROM campaign_source_links WHERE campaign_id=? AND source_id=?',campaignId,id).first();
   const enabled=body.enabled!==false?1:0,linked=body.linked_from_official===true?1:0,official=body.official_domain_verified===true?1:0,explorer=body.explorer_approved===true?1:0;
   const na=Array.isArray(body.not_applicable)?body.not_applicable.filter(x=>['snapshot_at','claim_opens_at','claim_deadline_at'].includes(x)).slice(0,3):[];
   // Operator-declared metadata is retained for review only, never treated as remotely verified.
   const declared=metadata(body.declared_metadata||{});
   if(!existing)await sql(db,'INSERT INTO source_trust_profiles(id,source_url,host) VALUES(?,?,?)',id,urlText,new URL(urlText).hostname).run();
   if(!link)await sql(db,'INSERT INTO campaign_source_links(id,campaign_id,source_id,source_url,registered_by,enabled,linked_from_official,official_domain_verified,explorer_approved,declared_metadata,not_applicable) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    crypto.randomUUID(),campaignId,id,urlText,user.id,enabled,linked,official,explorer,JSON.stringify(declared),JSON.stringify(na)).run();
   else await sql(db,'UPDATE campaign_source_links SET enabled=?,linked_from_official=?,official_domain_verified=?,explorer_approved=?,declared_metadata=?,not_applicable=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
    enabled,linked,official,explorer,JSON.stringify(declared),JSON.stringify(na),link.id).run();
   await audit(db,user.id,link?'source_updated':'source_registered','source_trust_profile',id,link?'registered':'','registered',campaignId);
   return json({id,campaign_id:campaignId,source_url:urlText,tier:TRUST_TIERS[4],notice:CAUTION},link?200:201,baseHeaders);
  }
  error('NOT_FOUND',404);
 }catch(e){
  if(e instanceof TrustError)return json({error:e.message},e.status,baseHeaders);
  if(e?.message==='RATE_LIMITED')return json({error:'RATE_LIMITED'},429,baseHeaders);
  if(/UNIQUE constraint failed/.test(e?.message||''))return json({error:'SOURCE_ALREADY_EXISTS'},409,baseHeaders);
  return json({error:'TRUST_SERVICE_UNAVAILABLE'},503,baseHeaders);
 }
}

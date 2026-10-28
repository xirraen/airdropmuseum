import {fail,sql,str,safeParse,publicUrl,iso,DISCLAIMER,digest} from './types.ts';
const FIELDS=['chain','category','status','snapshot_from','snapshot_to','deadline_from','deadline_to','kyc_required','updated_since'];
const alias='e';
const selected=`SELECT e.id,e.payload,e.source_url,e.updated_at,e.review_status,
 (SELECT MAX(finished_at) FROM verification_runs v WHERE v.campaign_id=e.id AND v.status='complete') AS last_verified_at,
 (SELECT COUNT(*) FROM campaign_source_links l WHERE l.campaign_id=e.id AND l.enabled=1) AS source_count,
 (SELECT confidence_label FROM verification_runs v WHERE v.campaign_id=e.id AND v.status='complete' ORDER BY started_at DESC LIMIT 1) AS confidence_label
 FROM am_core_exhibits e`;
const visible=`e.review_status NOT IN ('draft','pending_review','private_draft','unreviewed')
 AND json_extract(e.payload,'$.visibility')='public'
 AND e.source_url LIKE 'https://%'
 AND EXISTS(SELECT 1 FROM verification_runs v WHERE v.campaign_id=e.id AND v.status='complete' AND v.finished_at IS NOT NULL)`;
export function project(row){
 const p=safeParse(row.payload),url=publicUrl(row.source_url),verified=iso(row.last_verified_at);
 if(!url||!verified)return null;
 const urls=[url,...(Array.isArray(p.official_urls)?p.official_urls:[])].map(publicUrl).filter(Boolean);
 const chains=Array.isArray(p.chains)?p.chains.map(x=>str(x,40)).filter(Boolean).slice(0,16):[str(p.chain,40)].filter(Boolean);
 const d={slug:str(p.slug||row.id,160),name:str(p.name||p.project_name,180),project_name:str(p.project_name||p.name,180),category:str(p.category,80),status:str(p.status||row.review_status,80),chains,description:str(p.description,800),official_urls:[...new Set(urls)],source_url:url,snapshot_at:iso(p.snapshot_at),activity_start_at:iso(p.activity_start_at),activity_end_at:iso(p.activity_end_at),claim_opens_at:iso(p.claim_opens_at),claim_deadline_at:iso(p.claim_deadline_at),confidence_label:['high_confidence','medium_confidence','low_confidence','needs_review'].includes(row.confidence_label)?row.confidence_label:'needs_review',source_count:Number(row.source_count)||0,last_verified_at:verified,updated_at:iso(row.updated_at),disclaimer:DISCLAIMER};
 return d;
}
function filters(params){
 const where=[visible],args=[];
 for(const key of params.keys())if(!FIELDS.includes(key)&&!['limit','cursor'].includes(key))fail('UNKNOWN_FILTER');
 for(const k of FIELDS){const value=params.get(k);if(value===null)continue;if(value.length>80)fail('INVALID_FILTER');
  if(k==='kyc_required'){if(!['true','false'].includes(value))fail('INVALID_KYC');where.push("json_extract(e.payload,'$.kyc_required')=?");args.push(value==='true'?1:0);}
  else if(['snapshot_from','snapshot_to','deadline_from','deadline_to','updated_since'].includes(k)){
   const stamp=iso(value);if(!stamp)fail('INVALID_DATE');
   const col=k.startsWith('snapshot')?"json_extract(e.payload,'$.snapshot_at')":k.startsWith('deadline')?"json_extract(e.payload,'$.claim_deadline_at')":"e.updated_at";
   where.push(`datetime(${col}) ${k.endsWith('from')||k==='updated_since'?'>=':'<='} datetime(?)`);args.push(stamp);
  }else if(k==='chain'){where.push("(json_extract(e.payload,'$.chain')=? OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_type(e.payload,'$.chains')='array' THEN json_extract(e.payload,'$.chains') ELSE '[]' END) WHERE value=?))");args.push(value,value);}
  else{where.push(`json_extract(e.payload,'$.${k}')=?`);args.push(value);}
 }
 return {where,args};
}
function enc(obj){return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function dec(value){if(!/^[\w-]{1,512}$/.test(value))fail('INVALID_CURSOR');try{return JSON.parse(decodeURIComponent(escape(atob(value.replaceAll('-','+').replaceAll('_','/')))));}catch{fail('INVALID_CURSOR');}}
export async function listCampaigns(env,params,kind=null){
 const lim=params.get('limit')===null?50:Number(params.get('limit'));if(!Number.isSafeInteger(lim)||lim<1||lim>100)fail('INVALID_LIMIT');
 const clone=new URLSearchParams(params);clone.delete('cursor');clone.delete('limit');
 const fp=await digest([...clone.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('&')+'|'+(kind||'campaigns'));
 const {where,args}=filters(params);
 if(kind==='deadlines')where.push("json_extract(e.payload,'$.claim_deadline_at') IS NOT NULL");
 if(kind==='snapshots')where.push("json_extract(e.payload,'$.snapshot_at') IS NOT NULL");
 const cursor=params.get('cursor');
 if(cursor){const data=dec(cursor);if(data.f!==fp||!iso(data.t)||typeof data.id!=='string'||data.id.length>160)fail('INVALID_CURSOR');where.push('(e.updated_at<? OR (e.updated_at=? AND e.id<?))');args.push(data.t,data.t,data.id);}
 const found=await sql(env.DB,selected+' WHERE '+where.join(' AND ')+' ORDER BY e.updated_at DESC,e.id DESC LIMIT ?',...args,lim+1).all();
 const rows=found.results||[],more=rows.length>lim,chosen=rows.slice(0,lim),items=chosen.map(project).filter(Boolean);
 const end=chosen.at(-1),next_cursor=more&&end?enc({t:iso(end.updated_at),id:end.id,f:fp}):null;
 return {items,next_cursor,limit:lim,disclaimer:DISCLAIMER};
}
export async function campaignBySlug(env,slug){
 if(!/^[a-zA-Z0-9_-]{1,160}$/.test(slug))fail('NOT_FOUND',404);
 const row=await sql(env.DB,selected+' WHERE '+visible+" AND (e.id=? OR json_extract(e.payload,'$.slug')=?) LIMIT 1",slug,slug).first();
 if(!row)fail('NOT_FOUND',404);
 const campaign=project(row);if(!campaign)fail('NOT_FOUND',404);return {campaign,row};
}
export async function sources(env,slug){
 const {campaign,row}=await campaignBySlug(env,slug);
 const result=await sql(env.DB,`SELECT p.source_url,p.tier,p.last_fetched_at,l.official_domain_verified FROM campaign_source_links l JOIN source_trust_profiles p ON p.id=l.source_id WHERE l.enabled=1 AND l.campaign_id=? ORDER BY l.updated_at DESC LIMIT 100`,row.id).all();
 return {campaign_slug:campaign.slug,sources:(result.results||[]).map(x=>({source_url:publicUrl(x.source_url),source_type:x.tier,last_checked_at:iso(x.last_fetched_at),official_domain_verified:!!x.official_domain_verified})).filter(x=>x.source_url),disclaimer:DISCLAIMER};
}
export async function timeline(env,slug){
 const {campaign,row}=await campaignBySlug(env,slug);
 const runs=await sql(env.DB,"SELECT finished_at,confidence_label,status FROM verification_runs WHERE campaign_id=? AND status='complete' ORDER BY finished_at DESC LIMIT 50",row.id).all();
 return {campaign_slug:campaign.slug,timeline:(runs.results||[]).map(x=>({event_type:'source.verified',occurred_at:iso(x.finished_at),confidence_label:x.confidence_label,source_url:campaign.source_url})),disclaimer:DISCLAIMER};
}
export async function etagResponse(value,request,headers={},mime='application/json; charset=utf-8'){
 const content=typeof value==='string'?value:JSON.stringify(value),tag='"'+(await digest(content)).slice(0,32)+'"';
 const h={'Content-Type':mime,'ETag':tag,'Cache-Control':'public, max-age=60, stale-while-revalidate=120','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",...headers};
 return new Response(request.headers.get('If-None-Match')===tag?null:request.method==='HEAD'?null:content,{status:request.headers.get('If-None-Match')===tag?304:200,headers:h});
}

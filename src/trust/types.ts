export const TRUST_TIERS=['primary_official','official_social','independent','community','unknown'];
export const CONFIDENCE=['high_confidence','medium_confidence','low_confidence','needs_review'];
export const FIELDS=['project_name','chain','category','snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at','eligibility_rules','official_urls','token_contract','claim_contract'];
export const MATERIAL_FIELDS=new Set(['chain','snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at','eligibility_rules','official_urls','token_contract','claim_contract']);
export const DATE_FIELDS=new Set(['snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at']);
export const CAUTION='Skor ini adalah penilaian internal berbasis sumber publik, bukan jaminan keamanan atau legitimacy.';
export class TrustError extends Error {constructor(code,status=400){super(code);this.name='TrustError';this.status=status;}}
export const statement=(db,query,...params)=>db.prepare(query).bind(...params);
export function shortText(value,max=400){return typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';}
export function metadata(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return {};
 const out={};for(const key of FIELDS){let value=input[key];if(value===undefined||value===null||value==='')continue;
  if(key==='official_urls'){if(!Array.isArray(value))continue;value=value.filter(x=>typeof x==='string').slice(0,12).map(x=>shortText(x,500));}
  else if(key==='eligibility_rules'){if(typeof value==='object')value=JSON.stringify(value);value=shortText(value,600);}
  else if(typeof value==='string')value=shortText(value,500);
  else continue;
  if(value&&(!Array.isArray(value)||value.length))out[key]=value;
 }return out;
}
export function publicRun(row){
 if(!row)return null;let changes=[];try{changes=JSON.parse(row.changes_json||'[]');}catch{}
 return {id:row.id,campaign_id:row.campaign_id,status:row.status,started_at:row.started_at,finished_at:row.finished_at,confidence_label:row.confidence_label,error_code:row.error_code||null,changes:changes.map(c=>({field:c.field,old_value:c.old_value,new_value:c.new_value,source_url:c.source_url}))};
}

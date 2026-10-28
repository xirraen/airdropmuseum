import {rejectSecrets} from '../platform-api.mjs';
export class JournalError extends Error {
 constructor(code,status=400){super(code);this.name='JournalError';this.status=status;}
}
export function fail(code,status=400){throw new JournalError(code,status);}
export const sql=(db,query,...params)=>db.prepare(query).bind(...params);
export const ID=/^[a-zA-Z0-9_-]{1,160}$/;
export const OUTCOMES=['allocated','not_allocated','unknown'];
export const SOURCES=['official','community','aggregator','social','other','unknown'];
export function text(value,max=500,required=false){
 if(typeof value!=='string'||value.length>max)fail('INVALID_TEXT');
 const s=value.replace(/[\u0000-\u001f\u007f]/g,' ').trim();
 if(required&&!s)fail('REQUIRED_TEXT');
 if(/(?:seed\s*phrase|private\s*key|recovery\s*phrase|mnemonic|api[_ -]?key|bearer\s+[\w.-]{16,})/i.test(s))fail('SENSITIVE_INPUT_REFUSED');
 try{rejectSecrets(s);}catch{fail('SENSITIVE_INPUT_REFUSED');}
 return s;
}
export function number(value,max,integer=false){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||(integer&&!Number.isSafeInteger(value)))fail('INVALID_NUMBER');
 return value;
}
export function bool(value){if(typeof value!=='boolean')fail('INVALID_BOOLEAN');return value?1:0;}
export function choice(value,values){if(!values.includes(value))fail('INVALID_CHOICE');return value;}
export function campaignId(v){if(typeof v!=='string'||!ID.test(v))fail('INVALID_CAMPAIGN');return v;}
export function wallet(v){if(typeof v!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(v))fail('INVALID_PUBLIC_WALLET');return v.toLowerCase();}
export function https(v){
 if(typeof v!=='string'||v.length>1500)fail('INVALID_HTTPS_URL');
 let u;try{u=new URL(v);}catch{fail('INVALID_HTTPS_URL');}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.test)$/i.test(u.hostname)||/^[0-9.]+$/.test(u.hostname)||u.hostname.includes(':'))fail('INVALID_HTTPS_URL');
 // Do not persist query parameters or fragments that may carry credentials.
 u.search='';u.hash='';return u.href;
}
export function evidence(value){
 if(!Array.isArray(value)||value.length>12)fail('INVALID_EVIDENCE');
 return value.map(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))fail('INVALID_EVIDENCE');
  if(item.kind==='tx_hash'){
   if(typeof item.value!=='string'||!/^0x[a-fA-F0-9]{64}$/.test(item.value))fail('INVALID_TX_HASH');
   return {kind:'tx_hash',value:item.value.toLowerCase()};
  }
  if(!['screenshot','official_link'].includes(item.kind))fail('INVALID_EVIDENCE');
  return {kind:item.kind,value:https(item.value)};
 });
}
export function parseAutopsy(body){
 return {
  campaign_id:campaignId(body.campaign_id),wallet_address:wallet(body.wallet_address),
  activity_before_snapshot:bool(body.activity_before_snapshot),
  activity_after_snapshot:bool(body.activity_after_snapshot),
  quest_count:number(body.quest_count,10000,true),
  chain_count:number(body.chain_count,100,true),
  gas_cost_usd:number(body.gas_cost_usd,10000000),
  bridge_cost_usd:number(body.bridge_cost_usd,10000000),
  research_minutes:number(body.research_minutes,1000000,true),
  decision_source:choice(body.decision_source,SOURCES),
  outcome:choice(body.outcome,OUTCOMES),
  hypothesis:text(body.hypothesis??'',2000),
  evidence_json:JSON.stringify(evidence(body.evidence??[])),
  consent_to_analysis:bool(body.consent_to_analysis??false)
 };
}
export function parseDecision(body){
 return {
  campaign_id:campaignId(body.campaign_id),
  reason:text(body.reason,1500,true),
  primary_evidence_url:https(body.primary_evidence_url),
  decision_source:choice(body.decision_source,SOURCES),
  time_budget_minutes:number(body.time_budget_minutes,1000000,true),
  cost_ceiling_usd:number(body.cost_ceiling_usd,10000000),
  realistic_expectations:text(body.realistic_expectations,1500,true)
 };
}
export function parseOutcome(body){return {outcome:choice(body.outcome,OUTCOMES),lessons:text(body.lessons,2000,true)};}
export async function bodyJson(request){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))fail('JSON_REQUIRED',415);
 if(Number(request.headers.get('Content-Length')||0)>16384)fail('BODY_TOO_LARGE',413);
 if(!request.body)fail('INVALID_JSON');
 const reader=request.body.getReader(),parts=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();fail('BODY_TOO_LARGE',413);}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 let obj;try{obj=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_JSON');}
 if(!obj||typeof obj!=='object'||Array.isArray(obj))fail('INVALID_JSON');return obj;
}

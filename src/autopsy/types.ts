import {JournalError,fail,sql,campaignId,choice,text,number,https,bodyJson,OUTCOMES,SOURCES} from './validation.ts';
export {JournalError,fail,sql,campaignId,choice,text,number,https,bodyJson,OUTCOMES,SOURCES};
export const TYPES=Object.freeze(['decision_created','evidence_added','activity_recorded','hypothesis_updated','outcome_recorded','outcome_revised','autopsy_finalized','insight_generated','analysis_consent_changed','event_compensated']);
export const CLAIM_EVENTS=new Set(['decision_created','evidence_added','activity_recorded','hypothesis_updated','outcome_recorded','outcome_revised','autopsy_finalized']);
export const DISCLAIMER='Retrospektif berdasarkan catatan yang disetujui pengguna. Sampel terbatas, data dilaporkan sendiri, tidak membuktikan sebab-akibat, bukan prediksi, expected value, ataupun jaminan reward atau eligibility.';
export const INSUFFICIENT='Belum cukup data untuk pola yang dapat dipercaya';
export const ID=/^[\w-]{1,160}$/;
export function requiredId(v){if(typeof v!=='string'||!ID.test(v))fail('INVALID_ID');return v;}
export function cutoff(v){
 if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v))fail('KNOWLEDGE_CUTOFF_REQUIRED');
 const t=Date.parse(v);if(!Number.isFinite(t)||t>Date.now()+300000)fail('INVALID_KNOWLEDGE_CUTOFF');
 return new Date(t).toISOString();
}
export function refs(v){
 if(!Array.isArray(v)||v.length<1||v.length>20)fail('EVIDENCE_REFS_REQUIRED');
 const x=v.map(requiredId);if(new Set(x).size!==x.length)fail('DUPLICATE_EVIDENCE_REF');return x;
}
export function expected(v){if(!Number.isSafeInteger(v)||v<0)fail('EXPECTED_VERSION_REQUIRED');return v;}
export function outcome(v){return choice(v,OUTCOMES);}
export function evidenceBody(b){
 const kind=choice(b.kind,['tx_hash','official_link','screenshot']);
 const value=kind==='tx_hash'?(typeof b.value==='string'&&/^0x[a-fA-F0-9]{64}$/.test(b.value)?b.value.toLowerCase():(()=>{fail('INVALID_TX_HASH')})()):https(b.value);
 return {kind,value};
}
export function activityBody(b){
 return {phase:choice(b.phase,['before_snapshot','after_snapshot']),quest_count:number(b.quest_count,10000,true),
 chain_count:number(b.chain_count,100,true),gas_cost_usd:number(b.gas_cost_usd,10000000),
 bridge_cost_usd:number(b.bridge_cost_usd,10000000),research_minutes:number(b.research_minutes,1000000,true)};
}
export function decisionBody(b){
 return {campaign_id:campaignId(b.campaign_id),reason:text(b.reason,1500,true),
 primary_evidence_url:https(b.primary_evidence_url),decision_source:choice(b.decision_source,SOURCES),
 time_budget_minutes:number(b.time_budget_minutes,1000000,true),
 cost_ceiling_usd:number(b.cost_ceiling_usd,10000000),
 realistic_expectations:text(b.realistic_expectations,1500,true)};
}
export function json(value,status=200,head=false){return new Response(head?null:JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}

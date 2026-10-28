import {rejectSensitive} from './aggregator-secrets.js';
// Pure, shared policy. No wallet sessions, signing, approvals or transactions.
export const RULE_TYPES = ['token_balance','nft_holdings','protocol_interaction','tx_count','volume','lp_position','bridge_activity','governance_vote','snapshot_date','social_task','kyc_or_geo_restriction','custom_manual_task'];
export const STATUSES = ['confirmed','rumored','speculative','expired','archived'];
export const CATEGORIES = ['token_airdrop','points','testnet','nft','retroactive'];
export const SOURCE_TYPES = ['official_docs','official_blog','contract','explorer','community','news'];
export const ALERT_TYPES = ['new_campaign','snapshot_7d','claim_open','deadline_72h','eligibility_change','new_quest','source_changed'];
export const iso = () => new Date().toISOString();
export function timestamp(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value))throw Error('INVALID_TIMESTAMP');const d=new Date(value);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value.slice(0,10))throw Error('INVALID_TIMESTAMP');return d.toISOString();}
export function https(value) {
 if(typeof value!=='string'||value.length>2048)throw Error('INVALID_HTTPS_URL');
 const u=new URL(value); const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!h.includes('.')||h.endsWith('.')||h.includes(':')||/^\d+(\.\d+){3}$/.test(h)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(h))throw Error('INVALID_HTTPS_URL');
 u.hash=''; return u.href;
}
export function escapeHTML(value) {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function escapeMarkdown(value) {return String(value??'').replace(/[\\_*\[\]()~`>#+\-=|{}.!<>]/g,'\\$&');}
export function address(value,chain) {
 if(typeof value!=='string')throw Error('INVALID_ADDRESS');
 if(chain==='solana'){
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value))throw Error('INVALID_SOLANA_ADDRESS');
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;for(const c of value)n=n*58n+BigInt(alphabet.indexOf(c));
  let bytes=0;for(let v=n;v>0n;v>>=8n)bytes++;bytes+=(value.match(/^1*/)?.[0].length||0);if(bytes!==32)throw Error('INVALID_SOLANA_ADDRESS');return value;
 }
 if(!/^eip155:[1-9]\d{0,9}$/.test(chain)||!/^0x[a-fA-F0-9]{40}$/.test(value))throw Error('INVALID_EVM_ADDRESS');
 return value.toLowerCase();
}
const string=(v,max=300)=>typeof v==='string'?v.slice(0,max):'';
export function safeLabel(v){v=string(v,80);if(!/^[\p{L}\p{N} ._\-]{0,60}$/u.test(v)||v.trim().split(/\s+/).length>6||/(private|mnemonic|seed|secret)/i.test(v))throw Error('INVALID_LABEL');return v;}
export function evidence(input,now=iso()) {
 if(!input||!SOURCE_TYPES.includes(input.source_type)||!['system','user'].includes(input.verified_by))throw Error('INVALID_EVIDENCE');
 timestamp(input.captured_at);
 if(!Number.isFinite(Date.parse(input.captured_at))||Date.parse(input.captured_at)>Date.parse(now)+30000)throw Error('INVALID_EVIDENCE_TIME');
 return {source_url:https(input.source_url),source_type:input.source_type,captured_at:new Date(input.captured_at).toISOString(),note:string(input.note,500),verified_by:input.verified_by};
}
export function campaign(input,now=iso()) {
 rejectSensitive(input);
 if(!input||!STATUSES.includes(input.status)||!CATEGORIES.includes(input.category)||!Array.isArray(input.official_urls)||!input.official_urls.length||!Array.isArray(input.chain)||!input.chain.length)throw Error('INVALID_CAMPAIGN');
 if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.slug)||!string(input.name,120).trim())throw Error('INVALID_CAMPAIGN');
 const urls=[...new Set(input.official_urls.slice(0,10).map(https))],sources=(input.source_evidence||[]).slice(0,30).map(e=>evidence(e,now));
 if(!sources.some(e=>urls.includes(e.source_url)&&['official_docs','official_blog','contract'].includes(e.source_type)))throw Error('OFFICIAL_EVIDENCE_REQUIRED');
 const chain=[...new Set(input.chain)];for(const c of chain)if(c!=='solana'&&!/^eip155:[1-9]\d{0,9}$/.test(c))throw Error('INVALID_CHAIN');
 const rules=(input.eligibility_rules||[]).slice(0,40).map((r,i)=>{if(!RULE_TYPES.includes(r.rule_type))throw Error('INVALID_RULE');const p=r.parameters||{};if(typeof p!=='object'||Array.isArray(p))throw Error('INVALID_RULE_PARAMETERS');return {id:string(r.id,80)||'rule-'+i,rule_type:r.rule_type,parameters:JSON.parse(JSON.stringify(p))}});
 if(new Set(rules.map(r=>r.id)).size!==rules.length)throw Error('DUPLICATE_RULE_ID');
 const out={id:input.slug,slug:input.slug,name:string(input.name,120),project_id:string(input.project_id,80),chain,category:input.category,status:input.status,official_urls:urls,description:string(input.description,2000),eligibility_rules:rules,risk_flags:(input.risk_flags||[]).slice(0,20).map(v=>string(v,200)),source_evidence:sources,created_at:now,updated_at:now,last_verified_at:sources.map(e=>e.captured_at).sort().at(-1),reward_type:string(input.reward_type,50),gas_cost_estimate:input.gas_cost_estimate==null?null:Number(input.gas_cost_estimate),kyc_requirement:['required','not_required','unknown'].includes(input.kyc_requirement)?input.kyc_requirement:'unknown',estimated_effort:Math.max(0,Math.min(100,Number(input.estimated_effort)||0))};
 if(out.gas_cost_estimate!==null&&(!Number.isFinite(out.gas_cost_estimate)||out.gas_cost_estimate<0))throw Error('INVALID_GAS_ESTIMATE');
 for(const key of ['snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at']){out[key]=input[key]?timestamp(input[key]):null;}
 for(const [a,b] of [['activity_start_at','activity_end_at'],['claim_opens_at','claim_deadline_at']])if(out[a]&&out[b]&&out[a]>out[b])throw Error('INVALID_DATE_RANGE');
 if(input.claim_endpoint){const endpoint=https(input.claim_endpoint);if(!urls.some(u=>new URL(u).origin===new URL(endpoint).origin))throw Error('CLAIM_ENDPOINT_NOT_OFFICIAL');out.claim_endpoint=endpoint;}
 out.distributor=input.distributor?address(input.distributor,chain[0]):null;
 return out;
}
export function effectiveStatus(c,now=iso()){return c.status!=='archived'&&c.claim_deadline_at&&Date.parse(c.claim_deadline_at)<Date.parse(now)?'expired':c.status;}
export function aggregateEligibility(results){if(!results.length)return 'unknown';for(const s of ['failed','action_required','manual_check','unknown'])if(results.some(r=>r.evaluation_status===s))return s;return 'passed';}
export function evaluateRule(rule,observations=[],context={}) {
 const now=context.now||iso(),p=rule.parameters||{};let status='unknown',reason='Data terverifikasi belum tersedia untuk menilai syarat ini.',refs=[];
 if(!RULE_TYPES.includes(rule.rule_type))throw Error('INVALID_RULE');
 if(['social_task','kyc_or_geo_restriction','custom_manual_task'].includes(rule.rule_type)){status=rule.rule_type==='social_task'?'action_required':'manual_check';reason=rule.rule_type==='kyc_or_geo_restriction'?'Ketentuan KYC atau wilayah perlu diperiksa manual; data identitas tidak dikumpulkan.':'Quest belum diverifikasi; periksa dan selesaikan secara manual.';}
 else {
  const observation=observations.find(o=>o.rule_id===rule.id&&o.rule_type===rule.rule_type&&o.chain===context.chain&&o.address===context.address&&o.verified===true&&Array.isArray(o.evidence_refs)&&o.evidence_refs.length&&o.evidence_refs.every(e=>{try{evidence(e,now);return true}catch{return false}})&&Number.isFinite(Date.parse(o.observed_at))&&Date.parse(o.observed_at)<=Date.parse(now)&&Date.parse(now)-Date.parse(o.observed_at)<=900000&&(!context.snapshot_at||(o.snapshot_at===context.snapshot_at&&o.historical===true)));
  if(observation){
   refs=observation.evidence_refs.map(e=>evidence(e,now));
   if(rule.rule_type==='snapshot_date'){
    const date=Date.parse(observation.value),cutoff=Date.parse(p.before||context.snapshot_at);if(Number.isFinite(date)&&Number.isFinite(cutoff)){status=date<=cutoff?'passed':'failed';reason=status==='passed'?'Aktivitas tercatat sebelum snapshot berdasarkan bukti sumber.':'Aktivitas tercatat setelah snapshot.';}
   }else if(['protocol_interaction','bridge_activity','governance_vote'].includes(rule.rule_type)){
    if(typeof observation.value==='boolean'&&(observation.value||observation.complete===true)){status=observation.value?'passed':'failed';reason=observation.value?'Wallet memenuhi syarat aktivitas berdasarkan bukti sumber.':'Tidak ditemukan aktivitas yang disyaratkan dalam cakupan sumber yang lengkap.';}
   }else {
    try{const raw=String(observation.value),min=String(p.min??'1');if(!/^\d+(\.\d+)?$/.test(raw)||!/^\d+(\.\d+)?$/.test(min))throw Error();const compare=(a,b)=>{const [ai,af='']=a.split('.'),[bi,bf='']=b.split('.'),n=Math.max(af.length,bf.length);return BigInt(ai+af.padEnd(n,'0'))>=BigInt(bi+bf.padEnd(n,'0'))};status=compare(raw,min)?'passed':'failed';reason=status==='passed'?'Nilai yang terverifikasi memenuhi ambang syarat.':'Nilai yang terverifikasi berada di bawah ambang syarat.';}catch{/* Unknown, never zero on provider errors. */}
   }
  }
 }
 return {rule_id:rule.id,rule_type:rule.rule_type,parameters:p,evaluation_status:status,evaluated_at:now,evidence_refs:refs,human_reason:reason};
}
export function priority(c,results=[],interests=[],now=iso()){
 if(['expired','archived'].includes(effectiveStatus(c,now)))return {label:'Prioritas Rendah',score:0};
 const hours=c.claim_deadline_at?(Date.parse(c.claim_deadline_at)-Date.parse(now))/3600000:Infinity;
 const progress=results.length?results.filter(r=>r.evaluation_status==='passed').length/results.length:0;
 const official=(c.source_evidence||[]).filter(e=>['official_docs','official_blog','contract'].includes(e.source_type));const freshness=official.length?Math.max(...official.map(e=>Date.parse(e.captured_at))):0;const confidence=official.length?(Date.parse(now)-freshness<=30*86400000?15:7):0;
 const score=(hours<=72?30:hours<=168?20:0)+progress*25+confidence+(interests.includes(c.category)?10:0)+Math.max(0,10-c.estimated_effort/10)+(c.gas_cost_estimate==null?0:Math.max(0,10-c.gas_cost_estimate));
 return {label:score>=60?'Prioritas Tinggi':score>=35?'Prioritas Sedang':'Prioritas Rendah',score:Math.round(score)};
}
export function scheduledAlerts(c,now=iso()){
 if(['expired','archived'].includes(effectiveStatus(c,now)))return [];
 const t=Date.parse(now),within=(date,h)=>date&&Date.parse(date)>=t&&Date.parse(date)-t<=h*3600000,out=[];
 if(within(c.snapshot_at,168))out.push('snapshot_7d');if(within(c.claim_deadline_at,72))out.push('deadline_72h');if(c.status==='confirmed'&&c.claim_opens_at&&Date.parse(c.claim_opens_at)<=t)out.push('claim_open');return out;
}
export function exportWatchlist(wallets,legacy=null){rejectSensitive(legacy);return {version:1,kind:'aggregator-core',wallets:wallets.map(w=>({chain:w.chain,address:address(w.address,w.chain),label:safeLabel(w.label||'')})),legacy};}
export function importWatchlist(data){rejectSensitive(data);if(data?.kind==='aggregator-core'&&data.version===1&&Array.isArray(data.wallets)&&data.wallets.length<=100)return exportWatchlist(data.wallets,data.legacy);if([1,2].includes(data?.version)&&!data.kind&&Array.isArray(data.saved)&&data.done&&typeof data.done==='object'&&!Array.isArray(data.done))return {version:1,kind:'aggregator-core',wallets:[],legacy:data};throw Error('INVALID_BACKUP');}

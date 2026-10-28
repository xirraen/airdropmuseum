import {https} from '../../dist/aggregator-core.js';
export const QUEST_TYPES=Object.freeze(['social','testnet_task','mainnet_task','bridge','swap','liquidity','governance','referral','kyc','custom']);
export const VERIFICATION_METHODS=Object.freeze(['manual','wallet_activity','url_submission','admin_review','none']);
export const QUEST_STATUSES=Object.freeze(['todo','in_progress','submitted','verified','failed','expired','not_applicable']);
const human={manual:'manual',none:'manual',url_submission:'pengiriman URL',wallet_activity:'aktivitas wallet',admin_review:'ulasan admin'};
export const MANUAL_TRANSITIONS=Object.freeze({
 todo:['in_progress','submitted','not_applicable'],in_progress:['submitted','failed','not_applicable','todo'],
 submitted:['todo','failed','not_applicable'],failed:['todo','in_progress'],not_applicable:['todo'],
 verified:['failed'],expired:[]});
export function problem(code,status=400){throw Object.assign(new Error(code),{status});}
export function member(value,values,code){if(!values.includes(value))problem(code);return value;}
export function plain(value,max=200,required=false){
 if(value===undefined||value===null)value='';
 if(typeof value!=='string'||value.length>max||required&&!value.trim())problem('INVALID_TEXT');
 if(/[\u0000-\u001f\u007f]/.test(value))problem('INVALID_TEXT');
 if(/(?:seed\s*phrase|private\s*key|mnemonic)/i.test(value))problem('SENSITIVE_DATA_REJECTED');
 return value.trim();
}
export function secureUrl(value,optional=true){
 if(value==null||value===''){if(optional)return null;problem('EVIDENCE_REQUIRED');}
 if(typeof value!=='string'||value.length>2048)problem('INVALID_URL');
 try{return https(value)}catch{problem('INVALID_HTTPS_URL');}
}
export function optionalWallet(w){
 if(w==null||w==='')return null;
 if(typeof w!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(w))problem('INVALID_PUBLIC_WALLET');
 return w.toLowerCase();
}
export function positiveInt(v,name,max=100000){if(!Number.isSafeInteger(v)||v<0||v>max)problem('INVALID_'+name);return v;}
export function timestamp(v){if(v==null||v==='')return null;if(!Number.isSafeInteger(v)||v<0||v>253402300799)problem('INVALID_TIMESTAMP');return v;}
export function questPayload(b){
 if(!b||typeof b!=='object'||Array.isArray(b))problem('INVALID_INPUT');
 const starts_at=timestamp(b.starts_at),ends_at=timestamp(b.ends_at);
 if(starts_at!=null&&ends_at!=null&&starts_at>ends_at)problem('INVALID_DATE_RANGE');
 const weight=b.weight===undefined?1:Number(b.weight);
 if(!Number.isFinite(weight)||weight<0||weight>100)problem('INVALID_WEIGHT');
 return {title:plain(b.title,160,true),description:plain(b.description||'',4000),
 quest_type:member(b.quest_type,QUEST_TYPES,'INVALID_QUEST_TYPE'),
 verification_method:member(b.verification_method,VERIFICATION_METHODS,'INVALID_VERIFICATION_METHOD'),
 points:positiveInt(b.points??0,'POINTS'),weight,starts_at,ends_at,official_url:secureUrl(b.official_url),
 required:b.required===undefined?1:b.required===true||b.required===1?1:b.required===false||b.required===0?0:problem('INVALID_REQUIRED')};
}
export function transition(previous,next,method,actor='user'){
 member(next,QUEST_STATUSES,'INVALID_STATUS');member(method,VERIFICATION_METHODS,'INVALID_VERIFICATION_METHOD');
 if(previous===next)return true;
 if(next==='expired')problem('EXPIRED_IS_DERIVED');
 if(actor==='admin'&&next==='verified'){
  if(!['admin_review','url_submission'].includes(method))problem('VERIFICATION_METHOD_NOT_ADMIN');
  if(previous!=='submitted')problem('REVIEW_REQUIRES_SUBMISSION');
  return true;
 }
 if(actor==='evaluator'&&next==='verified'&&method==='wallet_activity'&&['todo','in_progress','submitted','failed'].includes(previous))return true;
 if(next==='verified')problem('VERIFICATION_REQUIRED',403);
 if(previous==='verified'){if(actor!=='admin'&&actor!=='evaluator')problem('VERIFIED_IMMUTABLE',403);return next==='failed'||problem('INVALID_TRANSITION');}
 if(method==='admin_review'&&actor==='user')return ['submitted','not_applicable'].includes(next)&&previous!==next||problem('INVALID_TRANSITION');
 if(method==='url_submission'&&next==='submitted')return true;
 if(method==='wallet_activity'&&actor==='user'&&next==='submitted')problem('WALLET_VERIFICATION_REQUIRED',403);
 if(method==='none'||method==='manual'||method==='url_submission'||method==='wallet_activity')
  return MANUAL_TRANSITIONS[previous]?.includes(next)||problem('INVALID_TRANSITION');
 return MANUAL_TRANSITIONS[previous]?.includes(next)||problem('INVALID_TRANSITION');
}
export const DISCLAIMER='Status quest adalah catatan pribadi dan bukan jaminan eligibility atau reward.';
export function questBadge(status,expires,now=Math.floor(Date.now()/1000)){
 if(status==='verified')return 'Terverifikasi';
 if(expires!=null&&expires<=now||status==='expired')return 'Kedaluwarsa';
 if(status==='submitted')return 'Menunggu verifikasi';
 return 'Draft lokal';
}
export function eligibilityFromQuest(quest,progress){
 if(!quest?.required)return null;
 if(progress?.status!=='verified')return {evaluation_status:'manual_check',human_reason:'Quest wajib belum memiliki bukti verifikasi yang sah.',evidence_refs:[]};
 if(!['wallet_activity','admin_review','url_submission'].includes(quest.verification_method))
  return {evaluation_status:'manual_check',human_reason:'Pelacakan manual tidak membuktikan eligibility.',evidence_refs:[]};
 if(!progress.evidence_url)return {evaluation_status:'manual_check',human_reason:'Bukti verifikasi belum tersedia.',evidence_refs:[]};
 return {evaluation_status:'passed',human_reason:'Quest wajib terverifikasi berdasarkan metode dan tautan bukti; keputusan final tetap pada proyek.',evidence_refs:[{source_url:secureUrl(progress.evidence_url),source_type:'official_docs'}]};
}

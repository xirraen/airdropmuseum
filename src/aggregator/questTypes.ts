// Shared Sprint 4 policies: all inputs are untrusted.
export const QUEST_TYPES=['social','testnet_task','mainnet_task','bridge','swap','liquidity','governance','referral','kyc','custom'];
export const METHODS=['manual','wallet_activity','url_submission','admin_review','none'];
export const STATUSES=['todo','in_progress','submitted','verified','failed','expired','not_applicable'];
export const DISCLAIMER='Status quest adalah catatan pribadi dan bukan jaminan eligibility atau reward.';
export function err(code,status=400){throw Object.assign(new Error(code),{status});}
export function oneOf(value,values,name){if(!values.includes(value))err('INVALID_'+name);return value;}
export function string(value,max,name,{optional=false}={}){if(value==null&&optional)return '';if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))err('INVALID_'+name);return value.trim();}
export function httpsURL(value,optional=true){
 if((value==null||value==='')&&optional)return null;
 const raw=string(value,2048,'HTTPS_URL');
 let url;try{url=new URL(raw)}catch{err('INVALID_HTTPS_URL');}
 const h=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!h.includes('.')||h.endsWith('.')||h.includes(':')||/^\d+(\.\d+){3}$/.test(h)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(h))err('INVALID_HTTPS_URL');
 url.hash='';return url.href;
}
export function wallet(value){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(value))err('INVALID_WALLET_ADDRESS');
 return value.toLowerCase();
}
export function integer(value,min,max,name){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)err('INVALID_'+name);return value;}
export function finite(value,min,max,name){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)err('INVALID_'+name);return value;}
export function timestamp(value){if(value==null||value==='')return null;return integer(value,0,4102444800000,'TIMESTAMP');}
export function now(){return Date.now();}
export function expired(q,time=now()){return q.ends_at!=null&&q.ends_at<time;}
export function transition(method,from,to,actor='user'){
 oneOf(method,METHODS,'METHOD');oneOf(to,STATUSES,'STATUS');oneOf(from,STATUSES,'STATUS');
 if(from===to)return true;
 if(actor==='system')return method==='wallet_activity'&&to==='verified'||to==='expired';
 if(actor==='admin')return (to==='verified'&&['admin_review','url_submission'].includes(method))||from==='verified'&&to==='failed'||(to!=='verified'&&transition(method,from,to,'user'));
 if(to==='verified'||from==='verified'||to==='expired')return false;
 if(method==='admin_review')return ['submitted','not_applicable'].includes(to)&&!['verified','expired'].includes(from);
 if(method==='url_submission')return to==='submitted'||(from==='submitted'&&to==='todo')||to==='not_applicable';
 if(method==='wallet_activity')return ['todo','in_progress','submitted','failed','not_applicable'].includes(to);
 const edges={todo:['in_progress','submitted','not_applicable'],in_progress:['submitted','failed','not_applicable','todo'],submitted:['todo','failed','not_applicable'],failed:['todo','in_progress'],not_applicable:['todo']};
 return (edges[from]||[]).includes(to);
}
export function cleanQuest(b,previous={}){
 const q={title:string(b.title??previous.title,160,'TITLE'),description:string(b.description??previous.description??'',2000,'DESCRIPTION',{optional:true}),
 quest_type:oneOf(b.quest_type??previous.quest_type,QUEST_TYPES,'QUEST_TYPE'),verification_method:oneOf(b.verification_method??previous.verification_method,METHODS,'VERIFICATION_METHOD'),
 points:integer(b.points??previous.points??0,0,100000,'POINTS'),weight:finite(b.weight??previous.weight??1,0,100,'WEIGHT'),
 starts_at:timestamp(b.starts_at??previous.starts_at??null),ends_at:timestamp(b.ends_at??previous.ends_at??null),
 official_url:httpsURL(b.official_url??previous.official_url),
 required:integer(b.required??previous.required??1,0,1,'REQUIRED'),
 rule_id:b.rule_id===null?null:(b.rule_id??previous.rule_id)?string(b.rule_id??previous.rule_id,80,'RULE_ID'):null};
 if(q.starts_at&&q.ends_at&&q.starts_at>q.ends_at)err('INVALID_DATE_RANGE');
 return q;
}
export function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function escapeMarkdown(value){return String(value??'').replace(/[\\_*\[\]()~`>#+\-=|{}.!<>]/g,'\\$&');}

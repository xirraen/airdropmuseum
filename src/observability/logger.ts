// Do not accept arbitrary request bodies, URLs, error objects, identities or headers.
const EVENTS=new Set(['request_completed','auth_failed','rate_limited','discovery_item_processed','discovery_item_failed','verification_run_completed','conflict_detected','wallet_scan_completed','wallet_scan_failed','alert_sent','alert_failed','webhook_delivered','webhook_failed','queue_message_failed','cron_job_completed','cron_job_failed','uncaught_error']);
const LEVELS=new Set(['debug','info','warn','error']);
const STATUS=new Set(['ok','failed','degraded','limited','unauthorized','error']);
const SAFE_META=new Set(['route','method','http_status','error_class','attempt','batch_size','count','service','job','duration_bucket']);
export function classifyError(error){
 const text=String(error?.code||error?.message||'').toLowerCase();
 if(/invalid|validation|payload|body_too_large|json_required/.test(text))return 'validation';
 if(/auth|csrf|forbidden|permission|unauthorized|login/.test(text))return 'auth';
 if(/rate|quota|limit/.test(text))return 'rate_limit';
 if(/upstream|fetch|timeout|network|provider/.test(text))return 'upstream';
 if(/database|sqlite|d1|sql/.test(text))return 'database';
 if(/queue|delivery/.test(text))return 'queue';
 return 'unknown';
}
export function safeMetadata(source={}){
 const result={};
 if(!source||typeof source!=='object')return result;
 for(const [key,value] of Object.entries(source)){
  if(!SAFE_META.has(key))continue;
  if(typeof value==='number'&&Number.isFinite(value))result[key]=Math.max(0,Math.min(1000000,value));
  else if(typeof value==='boolean')result[key]=value;
  else if(typeof value==='string'&&/^[a-zA-Z0-9_./:-]{1,90}$/.test(value))result[key]=value;
 }
 return result;
}
export function logEvent({level='info',event,request_id='system',component='worker',duration_ms,status='ok',metadata={}}){
 if(!EVENTS.has(event))return;
 const entry={timestamp:new Date().toISOString(),level:LEVELS.has(level)?level:'info',event,request_id:/^[a-f0-9-]{36}$/i.test(request_id)?request_id:'system',component:/^[a-z0-9_-]{1,40}$/i.test(component)?component:'worker',status:STATUS.has(status)?status:'error',metadata:safeMetadata(metadata)};
 if(Number.isFinite(duration_ms))entry.duration_ms=Math.max(0,Math.round(duration_ms));
 console.log(JSON.stringify(entry));
}

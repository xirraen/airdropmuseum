import {logEvent} from '../observability/logger.ts';
export const METRIC_EVENTS=['api_request','discovery_item_processed','discovery_item_failed','verification_run','conflict_detected','webhook_delivery','alert_sent','alert_failed','wallet_scan_completed','wallet_scan_failed'];
export function metric(env,event,status='ok',duration=0,count=1){
 if(!METRIC_EVENTS.includes(event))return;
 try{env.ANALYTICS?.writeDataPoint({blobs:[event,status],doubles:[Math.max(0,duration),Math.max(0,count)],indexes:[event]});}catch{}
 const mapped=event==='verification_run'?'verification_run_completed':event==='webhook_delivery'?(status==='ok'?'webhook_delivered':'webhook_failed'):event;
 if(mapped==='api_request')return; // emitted once as request_completed by gateway
 logEvent({event:mapped,component:'aggregator',level:status==='ok'?'info':'warn',status:status==='ok'?'ok':'failed',duration_ms:duration,metadata:{count}});
}

export const METRIC_EVENTS=['api_request','discovery_item_processed','discovery_item_failed','verification_run','conflict_detected','webhook_delivery','alert_sent','wallet_scan_completed','wallet_scan_failed'];
export function metric(env,event,status='ok',duration=0,count=1){
 if(!METRIC_EVENTS.includes(event))return;
 try{env.ANALYTICS?.writeDataPoint({blobs:[event,status],doubles:[Math.max(0,duration),Math.max(0,count)],indexes:[event]});}catch{}
}

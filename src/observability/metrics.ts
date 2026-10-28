import {logEvent} from './logger.ts';
export function counter(env,event,status='ok',metadata={},request_id='system'){
 logEvent({event,status,request_id,component:'operations',metadata});
 // Only aggregate categories; never include request URL, IP, wallet, key, user or payload.
 try{env.ANALYTICS?.writeDataPoint({blobs:[event,status],doubles:[1]});}catch{}
}

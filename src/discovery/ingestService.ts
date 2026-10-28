import {normalizeUrl,DiscoveryError} from './types.ts';
import {parseFeed} from './feedParser.ts';
const MAX_BYTES=524288;
function scrub(code){return ['FETCH_FAILED','FEED_TOO_LARGE','FEED_TIMEOUT','INVALID_XML_FEED','INVALID_JSON_FEED','UNSAFE_XML','INVALID_FEED','QUEUE_UNAVAILABLE','UNSAFE_FEED_HOST','INVALID_HTTPS_URL'].includes(code)?code:'DISCOVERY_FETCH_FAILED';}
async function boundedResponse(response){
 const reader=response.body?.getReader();if(!reader)throw new DiscoveryError('INVALID_FEED');
 const pieces=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new DiscoveryError('FEED_TOO_LARGE',413);}pieces.push(value);}}
 finally{try{reader.releaseLock();}catch{}}
 const data=new Uint8Array(size);let n=0;for(const part of pieces){data.set(part,n);n+=part.byteLength;}
 return new TextDecoder('utf-8',{fatal:true}).decode(data);
}
async function download(url,headers,fetcher){
 for(let i=0;i<3;i++){
  const response=await fetcher(url,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(9000)});
  if([301,302,303,307,308].includes(response.status)){
   if(i===2)throw new DiscoveryError('FETCH_FAILED',502);
   const next=response.headers.get('location');if(!next)throw new DiscoveryError('FETCH_FAILED',502);
   const nextUrl=normalizeUrl(new URL(next,url).href);
   if(new URL(nextUrl).hostname!==new URL(url).hostname)throw new DiscoveryError('FETCH_FAILED',502);
   url=nextUrl;continue;
  }
  return response;
 }
 throw new DiscoveryError('FETCH_FAILED',502);
}
export async function fetchDiscoverySource(env,source,{fetcher=fetch}={}){
 const db=env.DB;
 if(!env.DISCOVERY_QUEUE)throw new DiscoveryError('QUEUE_UNAVAILABLE',503);
 const url=normalizeUrl(source.feed_url);
 const headers={'Accept':'application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml;q=0.8'};
 if(source.etag)headers['If-None-Match']=source.etag;
 if(source.last_modified)headers['If-Modified-Since']=source.last_modified;
 try{
  const response=await download(url,headers,fetcher);
  if(response.status===304){await db.prepare('UPDATE discovery_sources SET last_fetched_at=CURRENT_TIMESTAMP,last_error=NULL,error_at=NULL,new_item_count=0 WHERE id=?').bind(source.id).run();return {queued:0,not_modified:true};}
  if(!response.ok)throw new DiscoveryError('FETCH_FAILED',502);
  const content=await boundedResponse(response);
  const items=parseFeed(content,source.source_type,url);
  // Only short metadata travels through the queue; no article bodies or private data.
  for(let i=0;i<items.length;i+=10){
   await env.DISCOVERY_QUEUE.sendBatch(items.slice(i,i+10).map(item=>({body:{source_id:source.id,item}})));
  }
  const etag=response.headers.get('etag'),modified=response.headers.get('last-modified');
  await db.prepare('UPDATE discovery_sources SET last_fetched_at=CURRENT_TIMESTAMP,etag=?,last_modified=?,last_error=NULL,error_at=NULL,new_item_count=0,updated_at=CURRENT_TIMESTAMP WHERE id=?')
   .bind(etag?.slice(0,200)||null,modified?.slice(0,200)||null,source.id).run();
  return {queued:items.length,not_modified:false};
 }catch(error){
  const code=error?.name==='TimeoutError'?'FEED_TIMEOUT':scrub(error?.message);
  await db.prepare('UPDATE discovery_sources SET last_fetched_at=CURRENT_TIMESTAMP,last_error=?,error_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(code,source.id).run();
  return {queued:0,error:code};
 }
}
export async function consumeDiscoveryBatch(batch,env,{store}={}){
 const insert=store||((await import('./dedupeService.ts')).storeDiscoveredItem);
 for(const message of batch.messages){
  try{await insert(env.DB,message.body);message.ack();}
  catch(error){
   // Do not log raw URLs, feed bodies, credentials or exception strings.
   if(message.attempts>=4){try{await env.DB.prepare('UPDATE discovery_sources SET last_error=?,error_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind('QUEUE_ITEM_FAILED',String(message.body?.source_id||'')).run();}catch{}}
   message.retry();
  }
 }
}

import {TrustError,metadata,shortText} from './types.ts';
import {upstreamFetch} from '../security/upstream.ts';
import {normalizeTrustUrl,allowRegisteredSource,validateRedirect} from './domainPolicy.ts';
import {sha256,sourceFingerprint} from './fingerprint.ts';
const MAX_BYTES=262144,TTL=21600,WAIT=9000;
const metaAttr=(tag,name)=>{const m=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))','i').exec(tag);return m?m[1]??m[2]??m[3]:'';};
function decodeText(value){return shortText(String(value||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gi,t=>({ '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '}[t.toLowerCase()]||'')),500);}
function extractHTML(html){
 const fields={};const links=[];let scanned=0;
 for(const match of html.matchAll(/<meta\b[^>]*>/gi)){
  if(scanned++>=160)break;const tag=match[0],name=(metaAttr(tag,'name')||metaAttr(tag,'property')).toLowerCase();
  const key=name.replace(/^(am:|airdrop:|campaign:)/,'');
  if(name==='og:title')fields.project_name=decodeText(metaAttr(tag,'content'));
  if(['project_name','chain','category','snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at','eligibility_rules','token_contract','claim_contract'].includes(key))fields[key]=decodeText(metaAttr(tag,'content'));
  if(key==='official_urls'){try{fields.official_urls=JSON.parse(metaAttr(tag,'content'));}catch{}}
 }
 for(const match of html.matchAll(/<(?:a|link)\b[^>]*>/gi)){
  if(links.length>=20)break;const href=metaAttr(match[0],'href');try{const u=normalizeTrustUrl(href);if(/^(x\.com|twitter\.com|t\.me|telegram\.me|discord\.com|discord\.gg|github\.com)$/.test(new URL(u).hostname))links.push(u);}catch{}
 }
 return {metadata:metadata(fields),social_urls:[...new Set(links)]};
}
function extractJSON(raw){let data;try{data=JSON.parse(raw);}catch{throw new TrustError('INVALID_SOURCE_JSON',502);}
 if(!data||typeof data!=='object')throw new TrustError('INVALID_SOURCE_JSON',502);
 let target=data.fields||data.airdrop||data.campaign||data._airdrop||data;
 if(Array.isArray(data.items)){target=data.items.find(i=>i?.fields||i?.airdrop||i?._airdrop);target=target?.fields||target?.airdrop||target?._airdrop||{};}
 return {metadata:metadata(target),social_urls:[]};
}
function extractXML(raw){
 const fields={};for(const key of ['project_name','chain','category','snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at','eligibility_rules','token_contract','claim_contract']){
  const pattern=new RegExp('<(?:am:|airdrop:)?'+key+'\\b[^>]*>([^<]{1,700})<\\/','i'),match=pattern.exec(raw);
  if(match)fields[key]=decodeText(match[1]);
 }return {metadata:metadata(fields),social_urls:[]};
}
async function readBounded(response,max=MAX_BYTES){
 const contentLength=Number(response.headers.get('content-length')||0);if(contentLength>max)throw new TrustError('SOURCE_TOO_LARGE',413);
 if(!response.body)throw new TrustError('SOURCE_EMPTY',502);
 const reader=response.body.getReader(),parts=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new TrustError('SOURCE_TOO_LARGE',413);}parts.push(value);}}
 finally{try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(total);let p=0;for(const chunk of parts){bytes.set(chunk,p);p+=chunk.length;}
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new TrustError('INVALID_SOURCE_ENCODING',502);}
}
function robotsAllows(text,path){
 let active=false,group=false,best=-1,allow=true;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.split('#')[0].trim();if(!line)continue;const at=line.indexOf(':');if(at<0)continue;
  const field=line.slice(0,at).trim().toLowerCase(),value=line.slice(at+1).trim();
  if(field==='user-agent'){if(group){active=false;group=false;}if(value==='*'){active=true;}continue;}
  if(!active)continue;
  if(field==='allow'||field==='disallow'){group=true;if(!value)continue;const prefix=value.split('*')[0].replace(/\$$/,'');
   if(path.startsWith(prefix)&&prefix.length>=best){if(prefix.length>best||field==='allow'){best=prefix.length;allow=field==='allow';}}
  }
 }return allow;
}
async function checkRobots(url,fetcher){
 const u=new URL(url),robots=u.origin+'/robots.txt';
 const r=await upstreamFetch(robots,{fetcher,timeoutMs:WAIT,retries:1,headers:{Accept:'text/plain'}});
 validateRedirect(r);
 if(r.status===404||r.status===410)return true;
 if(!r.ok)throw new TrustError('ROBOTS_UNAVAILABLE',502);
 const body=await readBounded(r,32768);
 if(!robotsAllows(body,u.pathname))throw new TrustError('ROBOTS_DISALLOWS',403);
 return true;
}
export async function fetchTrustSource(env,link,{fetcher=fetch,now=Date.now()}={}){
 const url=allowRegisteredSource(link,link.campaign_id),key='trust:source:'+await sha256(url);
 const cached=env.TRUST_CACHE?await env.TRUST_CACHE.get(key,'json'):null;
 if(cached&&now-Date.parse(cached.fetched_at)<TTL*1000)return {...cached,from_cache:true};
 const headers={Accept:'text/html, application/json, application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml'};
 if(link.etag)headers['If-None-Match']=link.etag;
 if(link.last_modified)headers['If-Modified-Since']=link.last_modified;
 try{
  // Fail closed for web pages. Fetching robots.txt is not crawling the page.
  await checkRobots(url,fetcher);
  const response=await upstreamFetch(url,{fetcher,timeoutMs:WAIT,retries:1,method:'GET',headers});
  validateRedirect(response);
  if(response.status===304){
   const prev=metadata(JSON.parse(link.extracted_metadata||'{}'));
   if(!link.content_hash)throw new TrustError('MISSING_304_BASELINE',502);
   const existing={fetched_at:new Date(now).toISOString(),content_hash:link.content_hash,metadata:prev,social_urls:[],http_status:304,etag:link.etag||null,last_modified:link.last_modified||null};
   if(env.TRUST_CACHE)await env.TRUST_CACHE.put(key,JSON.stringify(existing),{expirationTtl:TTL});
   return existing;
  }
  if(!response.ok)throw new TrustError('SOURCE_HTTP_ERROR',502);
  const type=(response.headers.get('content-type')||'').toLowerCase().split(';')[0].trim();
  if(!['text/html','application/xhtml+xml','application/json','application/feed+json','application/rss+xml','application/atom+xml','application/xml','text/xml'].includes(type))throw new TrustError('UNSUPPORTED_SOURCE_CONTENT_TYPE',415);
  const body=await readBounded(response);
  const extracted=type.includes('json')?extractJSON(body):type.includes('xml')||type.includes('rss')||type.includes('atom')?extractXML(body):extractHTML(body);
  const result={fetched_at:new Date(now).toISOString(),content_hash:await sourceFingerprint(extracted.metadata),metadata:extracted.metadata,social_urls:extracted.social_urls,http_status:response.status,etag:shortText(response.headers.get('etag')||'',200)||null,last_modified:shortText(response.headers.get('last-modified')||'',200)||null};
  if(env.TRUST_CACHE){await env.TRUST_CACHE.put(key,JSON.stringify(result),{expirationTtl:TTL});await env.TRUST_CACHE.put('trust:fingerprint:'+result.content_hash,JSON.stringify({fetched_at:result.fetched_at,content_hash:result.content_hash}),{expirationTtl:TTL});}
  return result;
 }catch(error){if(error instanceof TrustError)throw error;throw new TrustError(error?.name==='TimeoutError'?'SOURCE_TIMEOUT':'SOURCE_FETCH_FAILED',502);}
}

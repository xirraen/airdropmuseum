export const CRYPTORANK_SOURCE_URL='https://api.cryptorank.io/v2/drophunting/activities?limit=100';
export const ROOTDATA_EVENTS_URL='https://api.rootdata.com/open/get_event';
export const ROOTDATA_FUNDING_URL='https://api.rootdata.com/open/get_fac';
export const DEFILLAMA_PROTOCOLS_URL='https://api.llama.fi/protocols';
export const SOURCE_TYPES = ['rss','atom','json_feed'];
export const TRUST_LEVELS = ['high','medium','low'];
export const CLASSIFICATIONS = ['airdrop','points','testnet','quest','claim','snapshot','unknown'];
export const ITEM_STATUSES = ['pending_review','approved','rejected','converted','duplicate','error'];
export class DiscoveryError extends Error {
 constructor(message,status=400){super(message);this.name='DiscoveryError';this.status=status;}
}
export function cleanText(value,max=500){
 if(typeof value!=='string')return '';
 return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')
  .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):' ';})
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi,(_,e)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[e.toLowerCase()]))
  .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
export function normalizeUrl(value){
 if(typeof value!=='string'||value.length>2048)throw new DiscoveryError('INVALID_HTTPS_URL');
 let url;
 try{url=new URL(value.trim());}catch{throw new DiscoveryError('INVALID_HTTPS_URL');}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw new DiscoveryError('INVALID_HTTPS_URL');
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||
 host.endsWith('.test')||host.endsWith('.invalid')||/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.includes(':')||
 !/^[a-z0-9.-]+$/.test(host)||host.split('.').some(p=>!p||p.startsWith('-')||p.endsWith('-')))throw new DiscoveryError('UNSAFE_FEED_HOST');
 url.hostname=host;url.hash='';url.port='';
 for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||/^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref_src|igshid)$/i.test(key))url.searchParams.delete(key);
 return url.href;
}
// Source revision covers both its canonical endpoint and parser format.
// The optional type preserves compatibility with messages emitted before this
// version, whose hash used the feed URL alone.
export async function sourceVersion(feedUrl,sourceType){
 const url=normalizeUrl(feedUrl);
 if(sourceType!==undefined&&!SOURCE_TYPES.includes(sourceType))throw new DiscoveryError('INVALID_SOURCE_TYPE');
 const input=sourceType===undefined?url:url+'\n'+sourceType;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
 return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function validateSource(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new DiscoveryError('INVALID_SOURCE');
 const name=cleanText(body.name,120),source_type=body.source_type,feed_url=normalizeUrl(body.feed_url),
 project_hint=cleanText(body.project_hint||'',120),trust_level=body.trust_level||'low';
 if(!name||!SOURCE_TYPES.includes(source_type)||!TRUST_LEVELS.includes(trust_level))throw new DiscoveryError('INVALID_SOURCE');
 if(new URL(feed_url).hostname==='api.cryptorank.io'&&(feed_url!==CRYPTORANK_SOURCE_URL||source_type!=='json_feed'))throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT');
 if(new URL(feed_url).hostname==='api.rootdata.com'&&(![ROOTDATA_EVENTS_URL,ROOTDATA_FUNDING_URL].includes(feed_url)||source_type!=='json_feed'))throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT');
 if(new URL(feed_url).hostname==='api.llama.fi'&&(feed_url!==DEFILLAMA_PROTOCOLS_URL||source_type!=='json_feed'))throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT');
 if(['airdrops.io','www.airdrops.io'].includes(new URL(feed_url).hostname)&&(feed_url!=='https://airdrops.io/feed/'||source_type!=='rss'))throw new DiscoveryError('PROVIDER_FEED_URL_UNAPPROVED');
 return {name,source_type,feed_url,project_hint,trust_level,enabled:body.enabled===false||body.enabled===0?0:1};
}
export function safeDate(value){
 if(!value||typeof value!=='string')return null;
 const t=Date.parse(value);return Number.isFinite(t)&&t>=0&&t<=Date.now()+86400000?new Date(t).toISOString():null;
}

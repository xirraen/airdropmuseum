import {cleanText,normalizeUrl,safeDate,DiscoveryError,CRYPTORANK_SOURCE_URL} from './types.ts';

const HTTPS_AIRDROPS_HOSTS=new Set(['airdrops.io','www.airdrops.io']);
const HTTPS_CRYPTORANK_HOSTS=new Set(['cryptorank.io','www.cryptorank.io','api.cryptorank.io']);

export function requireProviderRights(source,env={}){
 const url=new URL(normalizeUrl(source.feed_url));
 if(url.href===CRYPTORANK_SOURCE_URL&&source.source_type==='json_feed'){
  if(url.href!==CRYPTORANK_SOURCE_URL)throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT');
  if(env.CRYPTORANK_API_LICENSED!=='YES')throw new DiscoveryError('PROVIDER_LICENSE_REQUIRED',403);
  if(typeof env.CRYPTORANK_API_KEY!=='string'||!env.CRYPTORANK_API_KEY.trim())throw new DiscoveryError('PROVIDER_KEY_REQUIRED',503);
  return 'cryptorank';
 }
 if(HTTPS_CRYPTORANK_HOSTS.has(url.hostname))throw new DiscoveryError('PROVIDER_API_REQUIRED',403);
 if(HTTPS_AIRDROPS_HOSTS.has(url.hostname)){
  if(url.hostname!=='airdrops.io'||url.pathname!=='/feed/'||url.search)throw new DiscoveryError('PROVIDER_FEED_URL_UNAPPROVED');
  if(env.AIRDROPS_IO_LICENSED!=='YES')throw new DiscoveryError('PROVIDER_LICENSE_REQUIRED',403);
  if(source.source_type!=='rss')throw new DiscoveryError('INVALID_SOURCE_TYPE');
  return 'airdrops_io';
 }
 return 'general';
}

// CryptoRank API v2 Drophunting: only short identifiers/status metadata.
// Provider status is NOT an independent claim confirmation.
export function parseCryptoRankActivities(text){
 let json;try{json=JSON.parse(text);}catch{throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);}
 if(!json||!Array.isArray(json.data))throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);
 const items=json.data.slice(0,40).flatMap(row=>{
  if(!row||!Number.isSafeInteger(row.id)||row.id<=0)return [];
  const key=typeof row.key==='string'?row.key.trim().toLowerCase():'';
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)||key.length>100)return [];
  const name=cleanText(row.coin?.name||row.name||'',120);
  if(!name)return [];
  const providerStatus=cleanText(row.status||'UNKNOWN',40).toUpperCase();
  const providerReward=cleanText(row.reward||'unspecified',40);
  const title=cleanText(name+' — '+providerReward,240);
  const url=normalizeUrl('https://cryptorank.io/drophunting/'+key+'-activity'+row.id);
  const seconds=Number(row.lastStatusUpdate);
  const epoch=seconds<1e12?seconds*1000:seconds;
  const published_at=Number.isFinite(epoch)&&epoch>0&&epoch<8640000000000000?
   safeDate(new Date(epoch).toISOString()):null;
  return [{external_id:'cryptorank-v2:'+row.id,url,title,
   summary:cleanText('CryptoRank provider status: '+providerStatus+'. Reward: '+providerReward+'. Not independently confirmed; verify official project sources before publication.',500),
   published_at}];
 });
 if(json.data.length>0&&!items.length)throw new DiscoveryError('PROVIDER_SCHEMA_UNSUPPORTED',502);
 return items;
}

export async function downloadCryptoRank(url,env,fetcher){
 if(url!==CRYPTORANK_SOURCE_URL)throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT');
 const response=await fetcher(url,{method:'GET',redirect:'error',cache:'no-store',
  headers:{'Accept':'application/json','X-Api-Key':env.CRYPTORANK_API_KEY},
  signal:AbortSignal.timeout(9000)});
 if(response.status===401||response.status===403)throw new DiscoveryError('PROVIDER_AUTH_FAILED',502);
 if(response.status===429)throw new DiscoveryError('PROVIDER_RATE_LIMITED',503);
 if(!response.ok)throw new DiscoveryError('FETCH_FAILED',502);
 return response;
}

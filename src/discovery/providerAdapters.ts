import {cleanText,normalizeUrl,safeDate,DiscoveryError,CRYPTORANK_SOURCE_URL,ROOTDATA_EVENTS_URL,ROOTDATA_FUNDING_URL,DEFILLAMA_PROTOCOLS_URL} from './types.ts';

const HTTPS_AIRDROPS_HOSTS=new Set(['airdrops.io','www.airdrops.io']);
const HTTPS_CRYPTORANK_HOSTS=new Set(['cryptorank.io','www.cryptorank.io','api.cryptorank.io']);

export function requireProviderRights(source,env={}){
 const url=new URL(normalizeUrl(source.feed_url));
 if(url.href===CRYPTORANK_SOURCE_URL&&source.source_type==='json_feed'){
  if(env.CRYPTORANK_API_LICENSED!=='YES')throw new DiscoveryError('PROVIDER_LICENSE_REQUIRED',403);
  if(typeof env.CRYPTORANK_API_KEY!=='string'||!env.CRYPTORANK_API_KEY.trim())throw new DiscoveryError('PROVIDER_KEY_REQUIRED',503);
  return 'cryptorank';
 }
 if(HTTPS_CRYPTORANK_HOSTS.has(url.hostname))throw new DiscoveryError('PROVIDER_API_REQUIRED',403);
 if([ROOTDATA_EVENTS_URL,ROOTDATA_FUNDING_URL].includes(url.href)&&source.source_type==='json_feed'){
  if(env.ROOTDATA_API_LICENSED!=='YES')throw new DiscoveryError('PROVIDER_LICENSE_REQUIRED',403);
  if(typeof env.ROOTDATA_API_KEY!=='string'||!env.ROOTDATA_API_KEY.trim())throw new DiscoveryError('PROVIDER_KEY_REQUIRED',503);
  return url.href===ROOTDATA_FUNDING_URL?'rootdata_funding':'rootdata';
 }
 if(url.hostname==='api.rootdata.com')throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT',403);
 if(url.href===DEFILLAMA_PROTOCOLS_URL&&source.source_type==='json_feed'){
  if(env.DEFILLAMA_DATA_LICENSED!=='YES')throw new DiscoveryError('PROVIDER_LICENSE_REQUIRED',403);
  return 'defillama';
 }
 if(url.hostname==='api.llama.fi')throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT',403);

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

const firstString=(...values)=>values.find(v=>typeof v==='string'&&v.trim())||'';
const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:0;
const safeResource=value=>{try{return normalizeUrl(value);}catch{return '';}};

// Source data only identifies projects for further research. TVL does not
// constitute a tokenless claim, eligibility proof or airdrop confirmation.
export function parseDefiLlamaProtocols(text){
 let rows;try{rows=JSON.parse(text);}catch{throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);}
 if(!Array.isArray(rows))throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);
 const ranked=rows.filter(row=>row&&typeof row==='object'&&
  (!row.symbol||row.symbol===null)&&number(row.tvl)>=5_000_000&&
  typeof row.slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)&&
  typeof row.name==='string'&&row.name.trim().length>0
 ).sort((a,b)=>number(b.tvl)-number(a.tvl)).slice(0,40);
 return ranked.map(row=>({
  external_id:'defillama:'+row.slug,
  url:normalizeUrl('https://defillama.com/protocol/'+row.slug),
  title:cleanText(row.name,240),
  summary:cleanText('DeFiLlama TVL (USD): '+Math.round(number(row.tvl)).toLocaleString('en-US')+
   '. Token symbol absent from this dataset; token issuance and airdrop status UNVERIFIED. Category: '+
   cleanText(firstString(row.category,'Unknown'),50)+'. Verify with project official sources.',500),
  published_at:null
 }));
}

// RootData Pro event type 21 is an incentive-related event, not proof
// that a token distribution or wallet allocation has been announced.
export function parseRootDataIncentiveEvents(text){
 let body;try{body=JSON.parse(text);}catch{throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);}
 if(body?.result!==200||!Array.isArray(body?.data?.items))throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);
 const rows=body.data.items.slice(0,10).filter(r=>r&&Number(r.type)===21&&
  Number.isSafeInteger(Number(r.id))&&Number(r.id)>0);
 return rows.flatMap(row=>{
  const url=safeResource(row.site_url);
  const name=cleanText(firstString(row.name),120);
  if(!url||!name)return [];
  const eventTitle=cleanText(firstString(row.description,row.o_name?.en_value,row.type_name),140);
  return [{
   external_id:'rootdata-event:'+row.id,
   url,
   title:cleanText(name+' — '+(eventTitle||'Incentive event'),240),
   summary:cleanText('RootData event type 21 (incentive). Project: '+name+
    '. Incentive metadata only; not proof of airdrop eligibility, token distribution or claim.',500),
   published_at:safeDate(row.hap_date)
  }];
 });
}

export function parseRootDataFundingRounds(text){
 let body;try{body=JSON.parse(text);}catch{throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);}
 if(body?.result!==200||!Array.isArray(body?.data?.items))throw new DiscoveryError('INVALID_PROVIDER_RESPONSE',502);
 return body.data.items.slice(0,10).flatMap(row=>{
  if(!row||!Number.isSafeInteger(Number(row.id))||Number(row.id)<=0)return [];
  const url=safeResource(row.source_url);
  const name=cleanText(firstString(row.name),120);
  if(!url||!name)return [];
  const amount=number(row.amount);
  const round=cleanText(firstString(row.rounds,'unspecified round'),60);
  return [{external_id:'rootdata-funding:'+row.id,url,
   title:cleanText(name+' — '+round+' funding',240),
   summary:cleanText('RootData funding disclosure: '+name+'; '+round+
    '; amount USD '+(amount?Math.round(amount).toLocaleString('en-US'):'undisclosed')+
    '. Funding does NOT imply any future airdrop, token issuance or eligibility. Verify cited announcement.',500),
   published_at:safeDate(row.published_time&&/^\d{4}-\d{2}$/.test(row.published_time)?row.published_time+'-01':row.published_time)
  }];
 });
}

export async function downloadRootData(url,env,fetcher){
 if(![ROOTDATA_EVENTS_URL,ROOTDATA_FUNDING_URL].includes(url))throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT');
 const response=await fetcher(url,{
  method:'POST',redirect:'error',cache:'no-store',
  headers:{Accept:'application/json','Content-Type':'application/json',apikey:env.ROOTDATA_API_KEY,language:'en'},
  body:JSON.stringify(url===ROOTDATA_FUNDING_URL?{page:1,page_size:10}:{page:1,page_size:10,type:21}),
  signal:AbortSignal.timeout(12000)
 });
 if(response.status===401||response.status===403)throw new DiscoveryError('PROVIDER_AUTH_FAILED',502);
 if(response.status===429)throw new DiscoveryError('PROVIDER_RATE_LIMITED',503);
 if(!response.ok)throw new DiscoveryError('FETCH_FAILED',502);
 return response;
}
export async function downloadDefiLlama(url,fetcher){
 if(url!==DEFILLAMA_PROTOCOLS_URL)throw new DiscoveryError('INVALID_PROVIDER_ENDPOINT');
 const response=await fetcher(url,{method:'GET',redirect:'error',cache:'no-store',
  headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(response.status===429)throw new DiscoveryError('PROVIDER_RATE_LIMITED',503);
 if(!response.ok)throw new DiscoveryError('FETCH_FAILED',502);
 return response;
}

import {address,https,iso,effectiveStatus,evidence} from '../dist/aggregator-core.js';
// Per-isolate cache is an optimization only; no wallet responses enter shared HTTP caches.
const cache=new Map();
export async function readJSON(url,{body,headers={},fetcher=fetch,ttl=0,cacheKey=url}={}){
 url=https(url);const old=cache.get(cacheKey);if(ttl&&old&&old.until>Date.now())return structuredClone(old.value);
 for(let attempt=0;attempt<3;attempt++){
  try{
   const r=await fetcher(url,{method:body?'POST':'GET',redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
   if(!r.ok){if(r.status!==429&&r.status<500)throw Object.assign(Error('UPSTREAM_REJECTED'),{permanent:true});throw Error('UPSTREAM_UNAVAILABLE')}
   if(Number(r.headers.get('content-length'))>262144)throw Object.assign(Error('UPSTREAM_TOO_LARGE'),{permanent:true});
   const reader=r.body.getReader();let size=0,text='';const decoder=new TextDecoder();for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw Object.assign(Error('UPSTREAM_TOO_LARGE'),{permanent:true})}text+=decoder.decode(value,{stream:true})}text+=decoder.decode();const value=JSON.parse(text);
   if(ttl){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(cacheKey,{value,until:Date.now()+ttl})}return structuredClone(value);
  }catch(e){if(e.permanent||attempt===2)throw e;await new Promise(resolve=>setTimeout(resolve,100*2**attempt));}
 }
}
export function allowed(url,env,key='AGGREGATOR_ALLOWED_HOSTS'){
 const u=new URL(https(url)),hosts=String(env[key]||'').split(',').map(h=>h.trim().toLowerCase()).filter(Boolean);if(!hosts.includes(u.hostname))throw Error('SOURCE_NOT_ALLOWED');return u.href;
}
const ref=(url,note,at=iso(),source_type='explorer')=>({source_url:https(url),source_type,captured_at:at,note,verified_by:'system'});
export async function rpc(env,chain,method,params,fetcher=fetch){
 const methods=['eth_getBalance','eth_getTransactionCount','eth_call','getBalance'];if(!methods.includes(method))throw Error('READ_ONLY_METHOD_REQUIRED');
 const url=https(env[chain==='solana'?'RPC_SOLANA':'RPC_'+chain.split(':')[1]]||'');const data=await readJSON(url,{body:{jsonrpc:'2.0',id:1,method,params},fetcher});if(data.error||data.result==null)throw Error('RPC_UNAVAILABLE');return {value:data.result,url};
}
export async function portfolio(env,wallet,fetcher=fetch){
 const at=iso(),w={chain:wallet.chain,address:address(wallet.address,wallet.chain)};
 try{const result=await rpc(env,w.chain,w.chain==='solana'?'getBalance':'eth_getBalance',w.chain==='solana'?[w.address,{commitment:'finalized'}]:[w.address,'finalized'],fetcher);const raw=w.chain==='solana'?result.value.value:result.value;
  if(w.chain==='solana'&&!Number.isSafeInteger(raw))throw Error('INVALID_BALANCE');const balance=BigInt(raw).toString();return {...w,balance,balance_unit:w.chain==='solana'?'lamports':'wei',protocol_activity:[],scanned_at:at,status:'observed',evidence_refs:[ref(new URL(result.url).origin+'/','Saldo utama saat scan; bukan saldo saat snapshot.',at)]};
 }catch{return {...w,balance:null,balance_unit:w.chain==='solana'?'lamports':'wei',protocol_activity:[],scanned_at:at,status:'unknown',evidence_refs:[],human_reason:'RPC belum dikonfigurasi atau tidak tersedia.'};}
}
export async function observations(env,c,wallet,fetcher=fetch){
 const values=[],at=iso(),chain=wallet.chain,addr=address(wallet.address,chain),historical=!!c.snapshot_at;
 if(env.AGGREGATOR_INDEXER_URL){try{
  const base=https(env.AGGREGATOR_INDEXER_URL),u=new URL(base);u.searchParams.set('address',addr);u.searchParams.set('chain',chain);u.searchParams.set('campaign',c.id);if(c.snapshot_at)u.searchParams.set('snapshot_at',c.snapshot_at);
  const data=await readJSON(u.href,{fetcher,headers:env.AGGREGATOR_INDEXER_TOKEN?{Authorization:'Bearer '+env.AGGREGATOR_INDEXER_TOKEN}:{}});
  // The operator-configured indexer must bind evidence to the exact normalized rule.
  for(const o of (Array.isArray(data.observations)?data.observations:[]).slice(0,40)){
   const rule=c.eligibility_rules.find(r=>r.id===o.rule_id&&r.rule_type===o.rule_type);if(!rule||JSON.stringify(o.parameters)!==JSON.stringify(rule.parameters))continue;
   if(o.address!==addr||o.chain!==chain||o.verified!==true||!['string','boolean','number'].includes(typeof o.value)||String(o.value).length>1000)continue;
   o.evidence_refs=(o.evidence_refs||[]).slice(0,10).map(e=>evidence(e,at));values.push(o);
  }
 }catch{/* Provider failure yields unknown rules. */}}
 if(chain==='solana'||historical)return values;
 for(const r of c.eligibility_rules){if(values.some(o=>o.rule_id===r.id))continue;try{
  let method,params;const p=r.parameters;
  if(r.rule_type==='tx_count'){method='eth_getTransactionCount';params=[addr,'finalized'];}
  if(['token_balance','nft_holdings'].includes(r.rule_type)){
   if(r.rule_type==='token_balance'&&p.native===true){method='eth_getBalance';params=[addr,'finalized'];}
   else{const contract=address(p.contract,chain);method='eth_call';params=[{to:contract,data:'0x70a08231'+addr.slice(2).padStart(64,'0')},'finalized'];}
  }
  if(!method)continue;const result=await rpc(env,chain,method,params,fetcher);if(!/^0x[0-9a-f]+$/i.test(result.value))continue;
  values.push({rule_id:r.id,rule_type:r.rule_type,chain,address:addr,value:BigInt(result.value).toString(),observed_at:at,verified:true,historical:false,evidence_refs:[ref(new URL(result.url).origin+'/','Pembacaan RPC finalized. Nilai dalam unit integer terkecil; bukan bukti historis.',at)]});
 }catch{/* Never coerce missing balance/activity into zero. */}}
 return values;
}
export async function checkClaim(env,c,wallet,fetcher=fetch,now=iso()){
 const out={campaign_id:c.id,status:'manual_check',checked_at:now,evidence_refs:[],human_reason:'Perlu pemeriksaan manual',official_url:c.official_urls[0],distributor:c.distributor||null,chain:wallet.chain,deadline:c.claim_deadline_at};
 if(c.status!=='confirmed'||effectiveStatus(c,now)==='expired'||!c.claim_opens_at||Date.parse(c.claim_opens_at)>Date.parse(now)){out.status='unknown';out.human_reason='Campaign belum berada dalam periode claim terkonfirmasi.';return out;}
 if(!c.claim_endpoint||!c.chain.includes(wallet.chain))return out;
 try{
  const endpoint=allowed(c.claim_endpoint,env);if(!c.official_urls.some(u=>new URL(u).origin===new URL(endpoint).origin))return out;
  const u=new URL(endpoint);u.searchParams.set('address',address(wallet.address,wallet.chain));u.searchParams.set('chain',wallet.chain);const data=await readJSON(u.href,{fetcher});
  if(data.address!==address(wallet.address,wallet.chain)||data.chain!==wallet.chain||data.campaign_id!==c.id||!['claimable','already_claimed','not_eligible'].includes(data.status)||data.verified!==true||!Number.isFinite(Date.parse(data.checked_at))||Date.parse(data.checked_at)>Date.parse(now)+30000||Date.parse(now)-Date.parse(data.checked_at)>900000)return out;
  return {...out,status:data.status,human_reason:({claimable:'Sumber resmi melaporkan alokasi yang dapat diperiksa untuk claim.',already_claimed:'Sumber resmi melaporkan alokasi telah diklaim.',not_eligible:'Sumber resmi melaporkan alamat tidak memenuhi alokasi.'})[data.status],evidence_refs:[ref(endpoint,'Respons endpoint resmi terikat pada alamat, chain, campaign dan waktu pemeriksaan.',now,'official_docs')]};
 }catch{return out;}
}

// Public TON mainnet account data. No wallet signature, claim, send, or approve endpoints.
const ADDRESS=/^(-1|0):[0-9a-f]{64}$/i;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const text=(v,max=80)=>typeof v==='string'?v.trim().slice(0,max):'';
function units(value,decimals=9){
 const n=typeof value==='string'&&/^\d{1,100}$/.test(value)?value:'0';
 const precision=Number.isInteger(decimals)&&decimals>=0&&decimals<=18?decimals:9;
 const digits=n.padStart(precision+1,'0');
 const pos=precision?digits.length-precision:digits.length;
 const integer=digits.slice(0,pos).replace(/^0+(?=\d)/,'');
 if(!precision)return integer;
 const fractional=digits.slice(pos).slice(0,6).replace(/0+$/,'');
 return integer+(fractional?'.'+fractional:'');
}
async function getJSON(url,fetcher){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
 try{
  const response=await fetcher(url,{method:'GET',signal:controller.signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('UPSTREAM_HTTP_'+response.status);
  const contentType=response.headers?.get('content-type')||'';
  if(contentType&&!contentType.includes('json'))throw Error('UPSTREAM_NOT_JSON');
  const payload=await response.json();
  if(!payload||typeof payload!=='object')throw Error('UPSTREAM_BAD_RESPONSE');
  return payload;
 }finally{clearTimeout(timer);}
}
function accountFromTonapi(data){
 if(typeof data?.balance!=='number'&&typeof data?.balance!=='string')throw Error('ACCOUNT_BALANCE_MISSING');
 const raw=String(data.balance);
 if(!/^\d+$/.test(raw))throw Error('ACCOUNT_BALANCE_INVALID');
 return{ton:units(raw,9),status:text(data.status,40)||'unknown',provider:'TonAPI'};
}
function jettonsFromTonapi(data){
 if(!Array.isArray(data?.balances))throw Error('JETTON_SHAPE');
 return data.balances.filter(item=>item&&item.jetton&&/^\d+$/.test(String(item.balance)))
  .slice(0,30).map(item=>({
   name:text(item.jetton.name,60)||'Jetton',symbol:text(item.jetton.symbol,14)||'JETTON',
   decimals:Number.isInteger(item.jetton.decimals)?item.jetton.decimals:9,
   amount:units(String(item.balance),item.jetton.decimals)
  })).filter(item=>item.amount!=='0').slice(0,15);
}
function eventsFromTonapi(data){
 if(!Array.isArray(data?.events))throw Error('EVENT_SHAPE');
 return data.events.slice(0,8).map(event=>{
  const first=Array.isArray(event.actions)?event.actions.find(a=>a?.type):null;
  const type=text(first?.type,30)||'Activity';
  let amount=null;
  if(type==='TonTransfer'&&/^\d+$/.test(String(first?.TonTransfer?.amount||'')))
   amount=units(String(first.TonTransfer.amount),9)+' TON';
  else if(type==='JettonTransfer'&&/^\d+$/.test(String(first?.JettonTransfer?.amount||'')))
   amount=units(String(first.JettonTransfer.amount),Number(first?.JettonTransfer?.jetton?.decimals??9))+' '+text(first?.JettonTransfer?.jetton?.symbol,14);
  const ts=Number(event.timestamp);
  return{id:text(event.event_id,100),type,amount,time:Number.isFinite(ts)&&ts>0?new Date(ts*1000).toISOString():''};
 }).filter(e=>e.time);
}
async function toncenterBalance(address,fetcher){
 const uri='https://toncenter.com/api/v2/getAddressInformation?address='+encodeURIComponent(address);
 const data=await getJSON(uri,fetcher);
 if(data.ok!==true||!data.result||!/^\d+$/.test(String(data.result.balance)))throw Error('TONCENTER_UNAVAILABLE');
 return{ton:units(String(data.result.balance),9),status:text(data.result.state,40)||'unknown',provider:'TON Center'};
}
async function toncenterHistory(address,fetcher){
 const uri='https://toncenter.com/api/v2/getTransactions?address='+encodeURIComponent(address)+'&limit=8';
 const data=await getJSON(uri,fetcher);
 if(data.ok!==true||!Array.isArray(data.result))throw Error('TONCENTER_HISTORY_UNAVAILABLE');
 return data.result.slice(0,8).map(tx=>{
  const seconds=Number(tx.utime),messages=[tx.in_msg,...(tx.out_msgs||[])].filter(Boolean);
  const value=messages.find(m=>/^\d+$/.test(String(m.value)));
  return{
   id:text(tx.transaction_id?.hash,100),
   type:'Transaction',
   amount:value?units(String(value.value),9)+' TON':null,
   time:Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():''
  };
 }).filter(e=>e.time);
}
export async function getTonWalletSnapshot(address,fetcher=fetch){
 const raw=typeof address==='string'?address.trim():'';
 if(!ADDRESS.test(raw))return{error:'INVALID_TON_ADDRESS',status:400};
 const base='https://tonapi.io/v2/accounts/'+encodeURIComponent(raw);
 let account=null,jettons=[],events=[],jettonsAvailable=false,eventsAvailable=false;
 try{account=accountFromTonapi(await getJSON(base,fetcher));}catch{}
 if(!account){
  try{account=await toncenterBalance(raw,fetcher);}catch{}
 }
 if(!account)return{error:'TON_DATA_UNAVAILABLE',status:503};
 // Anonymous TonAPI is limited to ~1 RPS; make requests sequentially.
 await wait(1120);
 try{jettons=jettonsFromTonapi(await getJSON(base+'/jettons',fetcher));jettonsAvailable=true;}catch{}
 await wait(1120);
 try{events=eventsFromTonapi(await getJSON(base+'/events?limit=8',fetcher));eventsAvailable=true;}catch{
  try{events=await toncenterHistory(raw,fetcher);eventsAvailable=true;}catch{}
 }
 return{status:200,data:{
  network:'TON mainnet',address:raw,ton:account.ton,accountStatus:account.status,
  source:account.provider,jettons,jettonsAvailable,events,eventsAvailable,
  checkedAt:new Date().toISOString()
 }};
}

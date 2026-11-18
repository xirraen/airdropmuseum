import test from 'node:test';
import assert from 'node:assert/strict';
import {getTonWalletSnapshot} from '../mini/ton-wallet.mjs';
const address='0:'+('a'.repeat(64));
const payload=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const noWait=async()=>{};
test('rejects invalid or off-format addresses without querying provider',async()=>{
 let calls=0;
 for(const bad of ['','../../etc','EQ12345','-239:'+('a'.repeat(64)),'0:'+('z'.repeat(64))]){
  const out=await getTonWalletSnapshot(bad,async()=>{calls++;throw Error('NETWORK_MUST_NOT_BE_CALLED')},noWait);
  assert.deepEqual(out,{error:'INVALID_TON_ADDRESS',status:400});
 }
 assert.equal(calls,0);
});
test('actual TON mainnet snapshot formats nanos, jettons, NFTs and meaningful indexed actions',async()=>{
 const hits=[];
 const fetcher=async uri=>{
  const u=new URL(uri);hits.push(u.pathname);
  if(u.pathname.endsWith('/jettons'))return payload({balances:[
   {balance:'12500000000',jetton:{name:'Community Token',symbol:'COM',decimals:9}},
   {balance:'0',jetton:{name:'Zero Token',symbol:'ZERO',decimals:9}}
  ]});
  if(u.pathname.endsWith('/events'))return payload({events:[
   {event_id:'hash123',timestamp:1795010000,actions:[{type:'TonTransfer',TonTransfer:{amount:'1500000000'}}]},
   {event_id:'hash456',timestamp:1795010040,actions:[{type:'JettonTransfer',JettonTransfer:{amount:'250000',jetton:{symbol:'COM',decimals:5}}}]}
  ]});
  if(u.pathname.endsWith('/nfts'))return payload({nft_items:[
   {address:'EQ123456',metadata:{name:'Museum Badge'},collection:{name:'Museum Collection'}}
  ]});
  if(u.pathname.includes('/accounts/'))return payload({balance:'123456789012',status:'active'});
  throw Error('Unexpected endpoint '+uri);
 };
 const out=await getTonWalletSnapshot(address,fetcher,noWait);
 assert.equal(out.status,200);
 assert.equal(out.data.ton,'123.456789');
 assert.equal(out.data.accountStatus,'active');
 assert.equal(out.data.source,'TonAPI');
 assert.equal(out.data.network,'TON mainnet');
 assert.equal(out.data.jettonsAvailable,true);
 assert.equal(out.data.jettons.length,1);
 assert.equal(out.data.jettons[0].amount,'12.5');
 assert.equal(out.data.nftsAvailable,true);
 assert.equal(out.data.nfts[0].name,'Museum Badge');
 assert.equal(out.data.eventsAvailable,true);
 assert.equal(out.data.events[0].amount,'1.5 TON');
 assert.equal(out.data.events[1].amount,'2.5 COM');
 assert.equal(hits.length,4);
});
test('TON Center provides balance and transaction history if TonAPI account or events fail',async()=>{
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  if(url.includes('tonapi.io'))throw Error('TonAPI unavailable');
  if(url.includes('getAddressInformation'))return payload({ok:true,result:{balance:'9000000000',state:'active'}});
  if(url.includes('getTransactions'))return payload({ok:true,result:[{
   utime:1795010100,transaction_id:{hash:'abcd'},in_msg:{value:'1200000000'},out_msgs:[]
  }]});
  throw Error('Unknown request');
 };
 const out=await getTonWalletSnapshot(address,fetcher,noWait);
 assert.equal(out.status,200);
 assert.equal(out.data.ton,'9');
 assert.equal(out.data.source,'TON Center');
 assert.equal(out.data.jettonsAvailable,false);
 assert.equal(out.data.nftsAvailable,false);
 assert.equal(out.data.eventsAvailable,true);
 assert.equal(out.data.events[0].amount,'1.2 TON');
 assert.equal(calls.filter(x=>x.includes('toncenter.com')).length,2);
});
test('when one supplementary provider is unavailable, do not invent asset counts',async()=>{
 const fetcher=async url=>{
  if(url.includes('tonapi.io/v2/accounts/')&&!url.includes('/jettons')&&!url.includes('/events')&&!url.includes('/nfts'))
   return payload({balance:'0',status:'uninit'});
  throw Error('DATA_UNAVAILABLE');
 };
 const out=await getTonWalletSnapshot(address,fetcher,noWait);
 assert.equal(out.status,200);
 assert.equal(out.data.ton,'0');
 assert.equal(out.data.jettonsAvailable,false);
 assert.equal(out.data.eventsAvailable,false);
 assert.equal(out.data.nftsAvailable,false);
});
test('when account data is entirely unavailable, return service-unavailable instead of zero',async()=>{
 const r=await getTonWalletSnapshot(address,async()=>{throw Error('RPC_ERROR')},noWait);
 assert.deepEqual(r,{error:'TON_DATA_UNAVAILABLE',status:503,upstream:{tonapi:'NETWORK_ERROR',toncenter:'NETWORK_ERROR'}});
});

test('preserves 9-digit nanoTON and 18-digit Jetton dust instead of hiding nonzero assets',async()=>{
 const request=async uri=>{
  if(uri.includes('/jettons'))return payload({balances:[
   {balance:'1',jetton:{name:'One attounit',symbol:'DUST',decimals:18}},
   {balance:'1',jetton:{name:'Nano-token',symbol:'NANO',decimals:9}},
   {balance:'0',jetton:{name:'Empty token',symbol:'EMPTY',decimals:18}}
  ]});
  if(uri.includes('/events'))return payload({events:[
   {event_id:'nano',timestamp:1795010000,actions:[{type:'TonTransfer',TonTransfer:{amount:'1'}}]},
   {event_id:'dust',timestamp:1795010001,actions:[{type:'JettonTransfer',JettonTransfer:{amount:'1',jetton:{symbol:'DUST',decimals:18}}}]}
  ]});
  if(uri.includes('/nfts'))return payload({nft_items:[]});
  return payload({balance:'1',status:'active'});
 };
 const out=await getTonWalletSnapshot(address,request,noWait);
 assert.equal(out.status,200);
 assert.equal(out.data.ton,'0.000000001');
 assert.deepEqual(out.data.jettons.map(j=>j.amount),['0.000000000000000001','0.000000001']);
 assert.equal(out.data.events[0].amount,'0.000000001 TON');
 assert.equal(out.data.events[1].amount,'0.000000000000000001 DUST');
});
test('out-of-range event timestamp is excluded without hiding valid account and activity',async()=>{
 const request=async uri=>{
  if(uri.includes('/jettons'))return payload({balances:[]});
  if(uri.includes('/events'))return payload({events:[
   {event_id:'bad',timestamp:99999999999999,actions:[{type:'TonTransfer',TonTransfer:{amount:'1'}}]},
   {event_id:'good',timestamp:1795010000,actions:[{type:'TonTransfer',TonTransfer:{amount:'2000000000'}}]}
  ]});
  if(uri.includes('/nfts'))return payload({nft_items:[]});
  return payload({balance:'5000000000',status:'active'});
 };
 const out=await getTonWalletSnapshot(address,request,noWait);
 assert.equal(out.status,200);
 assert.equal(out.data.ton,'5');
 assert.equal(out.data.eventsAvailable,true);
 assert.equal(out.data.events.length,1);
 assert.equal(out.data.events[0].id,'good');
});
test('unsafe floating point balances never become a fabricated exact on-chain value',async()=>{
 const request=async uri=>{
  if(uri.includes('toncenter.com'))throw Error('UPSTREAM_UNAVAILABLE');
  if(uri.includes('/v2/accounts/'))return payload({balance:9007199254740992,status:'active'});
  throw Error('Unexpected endpoint');
 };
 const out=await getTonWalletSnapshot(address,request,noWait);
 assert.equal(out.status,503);
 assert.equal(out.upstream.tonapi,'INVALID_RESPONSE');
});

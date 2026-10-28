import test from 'node:test';
import assert from 'node:assert/strict';
import {UniversalProvider} from '@walletconnect/universal-provider';
import {readOnlyProvider,publicAddresses} from '../dist/wallet-provider.js';
import {createWalletConnect,sessionAccounts,validPairingUri} from '../dist/walletconnect-adapter.js';
const address='0x'+'1'.repeat(40),projectId='a'.repeat(32);
test('production UniversalProvider import exposes the actual init API',()=>assert.equal(typeof UniversalProvider.init,'function'));
test('read-only facade rejects every signing and transaction method before transport',async()=>{
 let count=0;const p=readOnlyProvider({request:async()=>{count++;return []}});
 for(const method of ['personal_sign','eth_sign','eth_signTypedData_v4','eth_sendTransaction','eth_sendRawTransaction','wallet_sendCalls','wallet_grantPermissions'])
  await assert.rejects(()=>p.request({method}),/READ_ONLY/);
 assert.equal(count,0);
});
test('address and payload boundaries reject malformed or oversized values',async()=>{
 for(const list of [[address.repeat(2)],Array(33).fill(address),['seed phrase'],null])assert.throws(()=>publicAddresses(list));
 assert.deepEqual(publicAddresses([address,address]),[address]);
 let touched=false;const p=readOnlyProvider({request:async()=>{touched=true}});
 await assert.rejects(()=>p.request({method:'eth_call',params:['x'.repeat(32769)]}),/TOO_LARGE/);assert.equal(touched,false);
});
test('CAIP session and pairing URI are strictly bounded',()=>{
 assert.deepEqual(sessionAccounts({namespaces:{eip155:{accounts:['eip155:1:'+address]}}},1),[address]);
 assert.throws(()=>sessionAccounts({namespaces:{eip155:{accounts:Array(129).fill('eip155:1:'+address)}}},1));
 for(const uri of ['javascript:alert(1)','wc:bad','wc:'+'a'.repeat(64)+'@2?relay-protocol=irn&symKey=short'])assert.throws(()=>validPairingUri(uri));
 const uri='wc:'+'a'.repeat(64)+'@2?relay-protocol=irn&symKey='+'b'.repeat(64);assert.equal(validPairingUri(uri),uri);
});
test('protocol adapter negotiates only read methods and disconnects cleanly',async()=>{
 let offered,disconnected=false;const listeners=new Map();
 const universal={session:null,on:(n,cb)=>listeners.set(n,cb),removeListener:n=>listeners.delete(n),async connect(opts){offered=opts;this.session={namespaces:{eip155:{accounts:['eip155:1:'+address,'eip155:8453:'+address]}}};},request:async()=>null,setDefaultChain(){},async disconnect(){disconnected=true;},abortPairingAttempt(){}};
 const p=await createWalletConnect({projectId},{factory:{init:async()=>universal}});
 assert.ok(offered.namespaces.eip155.methods.every(m=>!m.includes('sign')&&!m.includes('send')));
 assert.deepEqual(await p.request({method:'eth_requestAccounts'}),[address]);
 await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x2105'}]});
 assert.equal(await p.request({method:'eth_chainId'}),'0x2105');
 await assert.rejects(()=>p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xa'}]}),/UNSUPPORTED/);
 assert.equal(listeners.has('display_uri'),false);await p.disconnect();assert.equal(disconnected,true);
});
test('initialization fails closed for missing project ID without network access',async()=>{
 let touched=false;await assert.rejects(()=>createWalletConnect({projectId:''},{factory:{init:()=>{touched=true}}}),/PROJECT_ID/);assert.equal(touched,false);
});

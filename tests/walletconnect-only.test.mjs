import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWalletConnect} from '../dist/walletconnect-adapter.js';

const platform=readFileSync(new URL('../dist/platform.js',import.meta.url),'utf8');
const address='0x'+'1'.repeat(40),projectId='a'.repeat(32);

test('WalletConnect is the only wallet transport in the platform UI',()=>{
 assert.doesNotMatch(platform,/window\.ethereum|window\.solana|data-wallet-login/);
 assert.match(platform,/async function getProvider\(\)/);
 assert.match(platform,/createWalletConnect\(/);
 assert.match(platform,/if\('walletconnect'in d\)return await loginWallet\(\)/);
 assert.match(platform,/walletDisconnect'in d/);
 assert.match(platform,/WalletConnect terputus\. Sesi akun Telegram\/email tetap aktif/);
});
test('WalletConnect still denies signing, raw transactions and privilege grants',async()=>{
 const calls=[];
 const session={expiry:Math.floor(Date.now()/1000)+3600,namespaces:{eip155:{accounts:['eip155:1:'+address]}}};
 const universal={session,on(){},removeListener(){},request:async args=>{calls.push(args);return null},async disconnect(){}};
 const wallet=await createWalletConnect({projectId},{factory:{init:async()=>universal}});
 assert.deepEqual(await wallet.request({method:'eth_accounts'}),[address]);
 for(const method of ['personal_sign','eth_signTypedData_v4','eth_sendTransaction','eth_sendRawTransaction','wallet_sendCalls','wallet_grantPermissions'])
  await assert.rejects(()=>wallet.request({method,params:[]}),/READ_ONLY/);
 assert.equal(calls.length,0);
});
test('WalletConnect sessions are explicitly disconnected and not used as platform login',()=>{
 assert.match(platform,/await previous\?\.disconnect\?\.\(\)/);
 assert.match(platform,/Sesi akun Telegram\/email tetap aktif/);
 assert.doesNotMatch(platform,/walletSignatureLogin|signInWithEthereum/);
});

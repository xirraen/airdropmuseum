import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {readOnlyProvider,publicAddresses} from '../dist/wallet-provider.js';
const address='0x'+'1'.repeat(40);
test('retired wallet connector is absent from production dependency tree and published Worker assets',async()=>{
 const deps=JSON.parse(readFileSync('package.json','utf8')).dependencies;
 const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 assert.ok(!('@walletconnect/universal-provider' in deps));
 assert.ok(!lock.packages['node_modules/@walletconnect/universal-provider']);
 assert.ok(!lock.packages['node_modules/picomatch']);
 assert.ok(!readFileSync('scripts/build-worker.mjs','utf8').includes('dist/walletconnect-adapter.js'));
 assert.equal((await worker.fetch(new Request('https://museum.example.org/walletconnect-bundle.js'))).status,404);
 assert.equal((await worker.fetch(new Request('https://museum.example.org/api/platform/wallets'))).status,404);
});
test('internal defensive wallet facade still rejects signing without touching transport',async()=>{
 let attempts=0;
 const p=readOnlyProvider({request:async()=>{attempts++;return []}});
 for(const method of ['personal_sign','eth_sign','eth_signTypedData_v4','eth_sendTransaction','wallet_sendCalls']){
  await assert.rejects(()=>p.request({method}),/READ_ONLY/);
 }
 assert.equal(attempts,0);
});
test('public address validation rejects a seed phrase, duplicates and oversized payloads',()=>{
 for(const list of [[address.repeat(2)],Array(33).fill(address),['seed phrase'],null])
  assert.throws(()=>publicAddresses(list));
 assert.deepEqual(publicAddresses([address,address]),[address]);
});

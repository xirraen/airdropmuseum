import test from 'node:test';
import assert from 'node:assert/strict';
import {assertWalletBundleReachability} from '../scripts/wallet-bundle-reachability.mjs';

const meta=(inputs)=>({outputs:{'dist/walletconnect-bundle.js':{inputs}}});
test('browser wallet bundle check allows an excluded transitive module',()=>{
 assert.equal(assertWalletBundleReachability(meta({
  'dist/walletconnect-adapter.js':{bytesInOutput:123},
  'node_modules/picomatch/index.js':{bytesInOutput:0}
 })).emitted_inputs,2);
});
test('browser wallet bundle check rejects emitted vulnerable glob modules',()=>{
 for(const path of ['node_modules/picomatch/index.js','node_modules/anymatch/index.js',
  'node_modules/unstorage/node_modules/picomatch/index.js',
  'node_modules\\anymatch\\index.js']){
  assert.throws(()=>assertWalletBundleReachability(meta({[path]:{bytesInOutput:1}})),
   /VULNERABLE_GLOB_MODULE_BUNDLED/);
 }
});
test('browser wallet bundle check rejects missing and ambiguous metadata',()=>{
 assert.throws(()=>assertWalletBundleReachability({}),/WALLET_BUNDLE_OUTPUT_UNVERIFIED/);
 assert.throws(()=>assertWalletBundleReachability({outputs:{
  'dist/walletconnect-bundle.js':{inputs:{}},'other/walletconnect-bundle.js':{inputs:{}}
 }}),/WALLET_BUNDLE_OUTPUT_UNVERIFIED/);
});

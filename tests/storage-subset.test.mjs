import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createStorage} from '../vendor/unstorage/dist/index.mjs';
import fsLite from '../vendor/unstorage/drivers/fs-lite.mjs';

test('vendored upstream runtime hashes remain unchanged',async()=>{
 const root=new URL('../vendor/unstorage/',import.meta.url);
 const hashes=JSON.parse(await readFile(new URL('upstream-sha256.json',root),'utf8'));
 for(const [path,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(new URL(path,root))).digest('hex'),hash,path);
});
test('browser-style custom storage preserves WalletConnect session values',async()=>{
 const data=new Map();const storage=createStorage({driver:{name:'test-idb',getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),getKeys:()=>[...data.keys()]}});
 const session={topic:'a'.repeat(64),namespaces:{eip155:{accounts:['eip155:1:0x'+'1'.repeat(40)]}}};
 await storage.setItem('wc@2:client:session',JSON.stringify(session));
 assert.deepEqual(await storage.getItem('wc@2:client:session'),session);
 assert.equal((await storage.getItems(await storage.getKeys())).length,1);
 await storage.removeItem('wc@2:client:session');assert.equal(await storage.getItem('wc@2:client:session'),null);
});
test('ESM and CommonJS fs-lite retain persistence and reject unsupported drivers',async()=>{
 const base=await mkdtemp(join(tmpdir(),'museum-storage-'));
 try{
  const storage=createStorage({driver:fsLite({base})});await storage.setItem('wc:session',{accounts:['public-address']});
  const rootRequire=createRequire(import.meta.url);const require=createRequire(rootRequire.resolve('@walletconnect/keyvaluestorage'));const cjs=require('unstorage');const driver=require('unstorage/drivers/fs-lite');
  const reopened=cjs.createStorage({driver:driver({base})});assert.deepEqual(await reopened.getItem('wc:session'),{accounts:['public-address']});
  await reopened.removeItem('wc:session');assert.deepEqual(await storage.getKeys(),[]);
  assert.throws(()=>require('unstorage/drivers/fs'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
 }finally{await rm(base,{recursive:true,force:true});}
});

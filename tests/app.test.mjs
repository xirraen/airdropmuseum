import test from 'node:test';import assert from 'node:assert/strict';
import {createInvitePayload} from '../dist/referral.js';import {parseBackup} from '../dist/progress.js';import {projects} from './fixtures/sample-projects.mjs';import worker from '../src/worker.mjs';
test('backup imports known projects and completed tasks only',()=>{assert.deepEqual(parseBackup(JSON.stringify({version:1,saved:['prism','prism'],done:{'prism:0':true,'prism:1':false}}),projects),{saved:['prism'],done:{'prism:0':true}})});
test('rejects unknown projects, invalid task ids and wrong types',()=>{for(const data of [{version:2,saved:[],done:{}},{version:1,saved:['unknown'],done:{}},{version:1,saved:[],done:{'prism:99':true}},{version:1,saved:[],done:{'prism:0':'true'}},{version:1,saved:[],done:[]}])assert.throws(()=>parseBackup(JSON.stringify(data),projects))});
test('public catalog refuses unavailable D1 instead of serving examples',async()=>{const r=await worker.fetch(new Request('https://museum.test/api/projects'));const body=await r.json();assert.equal(r.status,503);assert.equal(body.error,'DATABASE_UNAVAILABLE')});
test('Worker serves only three public assets with correct MIME types',async()=>{
 for(const [path,type] of [['/','text/html'],['/core-five.js','text/javascript'],['/core-five.css','text/css']]){
  const r=await worker.fetch(new Request('https://museum.test'+path));assert.equal(r.status,200,path);
  assert.ok(r.headers.get('Content-Type').startsWith(type));
  assert.ok((await r.arrayBuffer()).byteLength>0);
 }
 for(const path of ['/app.js','/catalog.js','/style.css','/admin.html','/platform-bundle.js','/walletconnect-bundle.js'])
  assert.equal((await worker.fetch(new Request('https://museum.test'+path))).status,404,path);
});
test('unsupported methods and unknown paths are rejected',async()=>{assert.equal((await worker.fetch(new Request('https://museum.test/',{method:'POST'}))).status,405);assert.equal((await worker.fetch(new Request('https://museum.test/missing'))).status,404)});
test('HEAD returns no body for static assets',async()=>{const r=await worker.fetch(new Request('https://museum.test/',{method:'HEAD'}));assert.equal(await r.text(),'')});

test('worker applies browser security headers to static and API responses',async()=>{
 const r=await worker.fetch(new Request('https://museum.test/'));
 assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
 assert.equal(r.headers.get('Strict-Transport-Security'),'max-age=31536000');
 assert.match(r.headers.get('Content-Security-Policy'),/default-src 'self'/);
 assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors/);
 const api=await worker.fetch(new Request('https://museum.test/api/health'));
 assert.equal(api.headers.get('X-Content-Type-Options'),'nosniff');
 assert.ok((await api.json()).ok);
});

test('referral invitation is a canonical link without tracking parameters or rewards',()=>{const payload=createInvitePayload('https://museum.test/gallery?email=private#profile');assert.equal(payload.url,'https://museum.test/');assert.doesNotMatch(payload.url,/email=|#/);assert.match(payload.text,/contoh di dalamnya fiktif/i);assert.match(payload.text,/bukan rekomendasi investasi/i);assert.match(payload.text,/atau jaminan hadiah/i)});

test('core Mini App profile describes local state and removes referral tools',async()=>{
 const r=await worker.fetch(new Request('https://museum.test/core-five.js'));const js=await r.text();
 assert.equal(r.status,200);assert.match(js,/Data lima tab disimpan secara lokal/);
 assert.match(js,/XP adalah progres lokal/);assert.doesNotMatch(js,/data-referral/);
});
test('uncompressed assets render exact HTML and JS under varying accept-encoding',async()=>{
 for(const headers of [{},{'Accept-Encoding':'gzip, br'}]){
  const html=await worker.fetch(new Request('https://museum.test/',{headers}));
  assert.ok((await html.text()).startsWith('<!doctype html>'));
  assert.equal(html.headers.get('Content-Encoding'),null);
  const js=await worker.fetch(new Request('https://museum.test/core-five.js',{headers}));
  assert.match(await js.text(),/const TABS=/);
  assert.equal(js.headers.get('Content-Encoding'),null);
 }
});

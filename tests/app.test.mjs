import test from 'node:test';import assert from 'node:assert/strict';
import {createInvitePayload} from '../dist/referral.js';import {parseBackup} from '../dist/progress.js';import {projects} from '../dist/catalog.js';import worker from '../src/worker.mjs';
test('backup imports known projects and completed tasks only',()=>{assert.deepEqual(parseBackup(JSON.stringify({version:1,saved:['prism','prism'],done:{'prism:0':true,'prism:1':false}}),projects),{saved:['prism'],done:{'prism:0':true}})});
test('rejects unknown projects, invalid task ids and wrong types',()=>{for(const data of [{version:2,saved:[],done:{}},{version:1,saved:['unknown'],done:{}},{version:1,saved:[],done:{'prism:99':true}},{version:1,saved:[],done:{'prism:0':'true'}},{version:1,saved:[],done:[]}])assert.throws(()=>parseBackup(JSON.stringify(data),projects))});
test('catalog explicitly identifies demonstration data',async()=>{const r=await worker.fetch(new Request('https://museum.test/api/projects'));const body=await r.json();assert.equal(body.mode,'demo');assert.equal(body.projects.length,6)});
test('worker serves all assets with correct MIME types',async()=>{for(const [path,type] of [['/','text/html'],['/app.js','text/javascript'],['/catalog.js','text/javascript'],['/style.css','text/css'],['/brand.jpg','image/jpeg'],['/referral.js','text/javascript'],['/museum-ui.css','text/css'],['/navigation.js','text/javascript'],['/rewards.js','text/javascript'],['/workbench.js','text/javascript']]){const r=await worker.fetch(new Request('https://museum.test'+path));assert.equal(r.status,200);assert.ok(r.headers.get('Content-Type').startsWith(type));assert.ok((await r.arrayBuffer()).byteLength>0)}});
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

test('profile invite section explains qualification and XP limits',async()=>{const r=await worker.fetch(new Request('https://museum.test/app.js'));const app=await r.text();assert.match(app,/Salin\/bagikan tautan tidak memberi XP/);assert.match(app,/10 referral memenuhi syarat per hari UTC/);assert.match(app,/XP tidak dapat ditukar uang atau token/);assert.match(app,/navigator.share/)});
test('compressed stored assets are decoded to valid HTML and JavaScript before serving',async()=>{for(const headers of [{},{'Accept-Encoding':'gzip, br'}]){const html=await worker.fetch(new Request('https://museum.test/',{headers}));assert.ok((await html.text()).startsWith('<!doctype html>'));assert.equal(html.headers.get('Content-Encoding'),null);const js=await worker.fetch(new Request('https://museum.test/platform-bundle.js',{headers}));assert.ok((await js.text()).includes('export{'));assert.equal(js.headers.get('Content-Encoding'),null)}});

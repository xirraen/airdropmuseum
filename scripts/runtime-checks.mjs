import assert from 'node:assert/strict';
const base=process.env.RUNTIME_TEST_ORIGIN||'http://localhost:8787';
const local=['localhost','127.0.0.1'].includes(new URL(base).hostname);
const staging=process.env.STAGING_SYNTHETIC_E2E==='1'&&[
 'https://airdrop-museum-e2e-direct.xirraen.workers.dev',
 'https://airdrop-museum-staging.airdrop-658.workers.dev'
].includes(new URL(base).origin);
if(!local&&!staging)throw Error('Runtime synthetic tests require localhost or the dedicated synthetic staging origin');
async function request(path,options={}){
 const r=await fetch(base+path,{redirect:'manual',...options});
 const body=await r.text();let json;
 try{json=JSON.parse(body);}catch{}
 return {status:r.status,headers:r.headers,text:body,json};
}
const results=[];
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);}
await check('root serves exactly the five-tab app shell',async()=>{
 const r=await request('/');assert.equal(r.status,200);assert.match(r.text,/core-five\.css/);
 assert.match(r.text,/core-five\.js/);assert.match(r.text,/id="mobile-nav"/);
 assert.doesNotMatch(r.text,/walletconnect-bundle|admin\.html|decision-lab\.html/);
});
await check('core assets serve valid types with no additional public bundles',async()=>{
 for(const [path,type] of [['/index.html','text/html'],['/core-five.css','text/css'],['/core-five.js','text/javascript']]){
  const r=await request(path);assert.equal(r.status,200,path);assert.match(r.headers.get('Content-Type'),new RegExp(type));assert.ok(r.text.length>100);
 }
});
await check('old independent screens are inaccessible by direct URL',async()=>{
 for(const path of ['/aggregator.html','/discovery.html','/trust.html','/decision-lab.html','/portfolio.html','/admin','/admin.html','/museum.html']){
  const r=await request(path);assert.equal(r.status,404,path);
 }
});
await check('legacy frontend JS and CSS assets are not served',async()=>{
 for(const path of ['/app.js','/admin.js','/aggregator-ui-bundle.js','/platform-bundle.js','/walletconnect-bundle.js','/walletconnect-adapter.js','/trust-tab.js','/mini-ui.css','/museum-ui.css']){
  assert.equal((await request(path)).status,404,path);
 }
});
await check('admin and extra tool APIs are revoked even without a browser',async()=>{
 for(const path of ['/api/admin/overview','/api/platform/profile','/api/autopsy/decisions','/api/aggregator/campaigns','/api/discovery/sources','/api/trust/conflicts','/api/me/state','/api/decisions','/v1/airdrops','/docs/api']){
  assert.equal((await request(path)).status,404,path);
 }
});
await check('direct-write calls to removed admin and journal tools are denied',async()=>{
 for(const path of ['/api/admin/session','/api/autopsy/decisions','/api/aggregator/admin/campaigns','/api/platform/auth/telegram','/v1/events']){
  const r=await request(path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{}'});
  assert.equal(r.status,404,path);
 }
});
await check('only read methods are allowed on essential APIs',async()=>{
 for(const path of ['/api/health','/api/capabilities','/api/projects']){
  const r=await request(path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
  assert.equal(r.status,404,path);
 }
});
await check('health is available and reports an authenticated D1 schema',async()=>{
 const r=await request('/api/health');assert.equal(r.status,200);
 assert.equal(r.json?.ok,true);assert.equal(r.json?.database,'ready');
});
await check('capabilities respond without secret material',async()=>{
 const r=await request('/api/capabilities');assert.equal(r.status,200);assert.equal(r.json?.database,'ready');
 assert.ok(!/api_key|secret_value|private_key|mnemonic|session_token/.test(r.text));
});
await check('project listing comes from server D1, never fallback examples',async()=>{
 const r=await request('/api/projects');assert.equal(r.status,200);
 assert.equal(r.json?.mode,'live');assert.ok(Array.isArray(r.json?.projects));
});
await check('security headers protect Mini App and catalog',async()=>{
 for(const path of ['/','/api/projects']){
  const r=await request(path);
  assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
  assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors/);
  if(path==='/')assert.match(r.headers.get('Content-Security-Policy'),/https:\/\/web\.telegram\.org/);
  else assert.equal(r.headers.get('Content-Security-Policy'),"default-src 'none'; frame-ancestors 'none'");
  if(path==='/')assert.equal(r.headers.get('X-Frame-Options'),null);
 }
});
await check('HEAD responses have no body; arbitrary paths return 404',async()=>{
 for(const path of ['/','/core-five.js','/api/projects'])assert.equal((await request(path,{method:'HEAD'})).text,'');
 assert.equal((await request('/not-a-route')).status,404);
});
await check('unavailable non-core public APIs do not expose account records',async()=>{
 for(const path of ['/api/me/referral','/api/me/qualify','/api/autopsy/export','/api/admin/users','/api/aggregator/wallets','/api/public/partners']){
  const r=await request(path);assert.equal(r.status,404,path);
  assert.doesNotMatch(r.text,/user_scope|wallet_watchlist|session_hash|telegram_bot_token/i);
 }
});
console.log(JSON.stringify({runtime:staging?'Cloudflare Worker + synthetic staging D1':'workerd + local D1',passed:results.length,failed:0,public_routes:['/','/api/health','/api/capabilities','/api/projects'],restricted_test_scope:true}));

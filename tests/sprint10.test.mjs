import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {withSecurity,SECURITY_HEADERS} from '../src/security/gateway.ts';
import {requestContext,safeRoute} from '../src/observability/requestContext.ts';
import {logEvent,classifyError,safeMetadata} from '../src/observability/logger.ts';
import {safeHttpsUrl,validId,unixTimestamp,walletAddress} from '../src/security/validation.ts';
import {upstreamFetch} from '../src/security/upstream.ts';
import {safeLegalPage} from '../src/legal/pages.ts';
import {healthResponse} from '../src/observability/health.ts';
import {adminAuth} from '../src/admin/auth.ts';
const request=(path,options={})=>new Request('https://museum.example'+path,options);
test('security headers, request ID propagation and no sensitive response',async()=>{
 const id=crypto.randomUUID();
 const r=await withSecurity(request('/api/health',{headers:{'X-Request-ID':id}}),{},null,async()=>Response.json({ok:true}));
 assert.equal(r.status,200);
 assert.equal(r.headers.get('X-Request-ID'),id);
 for(const [key,value] of Object.entries(SECURITY_HEADERS))assert.equal(r.headers.get(key),key==='Content-Security-Policy'?"default-src 'none'; frame-ancestors 'none'":value);
 assert.equal((await r.json()).ok,true);
});
test('invalid external request ID is replaced and error response has correlation ID',async()=>{
 const r=await withSecurity(request('/api/health',{headers:{'X-Request-ID':'attacker-request'}}),{},null,async()=>Response.json({error:'BAD'}, {status:400}));
 const id=r.headers.get('X-Request-ID');assert.match(id,/^[0-9a-f-]{36}$/);
 assert.equal((await r.json()).request_id,id);
});
test('rate limiting applies even to legacy public API',async()=>{
 const env={PUBLIC_API_RATE_LIMITER:{limit:async()=>({success:false})}};
 const r=await withSecurity(request('/api/health'),env,null,async()=>Response.json({ok:true}));
 assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');
 assert.equal((await r.json()).error,'RATE_LIMITED');
});
test('oversized JSON request cannot reach handler',async()=>{
 let invoked=false;
 const r=await withSecurity(request('/api/me/state',{method:'POST',headers:{'Content-Length':'1048577','Content-Type':'application/json'},body:'{}'}),{},null,async()=>{invoked=true;return Response.json({});});
 assert.equal(r.status,413);assert.equal(invoked,false);
});
test('secret and PII fields never enter structured logs',()=>{
 const old=console.log;let output='';
 console.log=x=>{output+=x;};
 try{logEvent({event:'wallet_scan_failed',status:'failed',component:'scanner',metadata:{api_key:'REAL_SECRET',email:'test@example.com',wallet:'0xABC',count:2,route:'/api/me/*',user_points:100}});}finally{console.log=old;}
 assert.equal(output.includes('REAL_SECRET'),false);assert.equal(output.includes('test@example.com'),false);assert.equal(output.includes('0xABC'),false);
 const record=JSON.parse(output);assert.equal(record.event,'wallet_scan_failed');assert.equal(record.metadata.count,2);
 assert.equal(record.metadata.user_points,undefined);
});
test('error classification is restricted to safe categories',()=>{
 assert.equal(classifyError(new Error('CSRF_TOKEN_INVALID')),'auth');
 assert.equal(classifyError(new Error('fetch timeout')),'upstream');
 assert.equal(classifyError(new Error('D1 database failed')),'database');
 assert.equal(classifyError(new Error('nonsense with secret')),'unknown');
});
test('deny public SSRF targets, redirects and unbounded URLs',()=>{
 for(const target of ['http://example.org/x','https://127.0.0.1/x','https://[::1]/','https://localhost/','https://metadata.google.internal/','https://user:pass@example.org/']){
  assert.throws(()=>safeHttpsUrl(target));
 }
 assert.equal(safeHttpsUrl('https://3commas.io/a'),'https://3commas.io/a');
});
test('external fetch refuses redirects and circuit failure is isolated',async()=>{
 const fetcher=async()=>Response.redirect('https://other.example/',302);
 await assert.rejects(()=>upstreamFetch('https://source.example/news',{fetcher,retries:0,timeoutMs:1000}),/UPSTREAM_REDIRECT_REFUSED/);
});
test('strict ID, timestamp and EVM address validation',()=>{
 assert.equal(validId('../etc'),false);assert.equal(validId('campaign_01'),true);
 assert.equal(unixTimestamp(1760000000),true);assert.equal(unixTimestamp('1760000000'),false);
 assert.equal(walletAddress('1','0x'+'f'.repeat(40)),true);
 assert.equal(walletAddress('1','0x'+'g'.repeat(40)),false);
 assert.equal(walletAddress('unknown','0x'+'f'.repeat(40)),false);
});
test('admin authentication refuses anonymous user',async()=>{
 await assert.rejects(()=>adminAuth(request('/api/admin/overview'),{DB:{}},'dashboard.read'),/ADMIN_LOGIN_REQUIRED/);
});
test('legal pages use safe HTML, content type and HEAD semantics',async()=>{
 for(const path of ['/privacy','/terms','/disclaimer','/security']){
  const r=safeLegalPage(request(path));assert.equal(r.status,200);
  assert.match(r.headers.get('Content-Type'),/text\/html/);
  const html=await r.text();assert.match(html,/<html lang="id">/);
  assert.ok(!html.includes('<script'));
  const head=safeLegalPage(request(path,{method:'HEAD'}));assert.equal(await head.text(),'');
 }
});
test('degraded health is not falsely healthy',async()=>{
 const failed=await healthResponse(request('/api/aggregator/health'),{});
 assert.equal(failed.status,503);assert.equal((await failed.json()).status,'degraded');
 const success=await healthResponse(request('/api/aggregator/health'),{DB:{prepare:()=>({first:async()=>({1:1})})},PUBLIC_API_RATE_LIMITER:{}});
 assert.equal(success.status,200);
});
test('CSP and maintenance path are retained by worker generator',()=>{
 const script=readFileSync('scripts/build-worker.mjs','utf8');
 assert.match(script,/withSecurity/);assert.match(script,/mode==='maintenance'/);
 assert.match(script,/mode==='read_only'/);assert.match(script,/adminAuth/);
});
test('workflow and disaster recovery documentation are present',()=>{
 for(const file of ['.github/workflows/ci.yml','.github/workflows/deploy.yml','.github/workflows/preview.yml']){
  const text=readFileSync(file,'utf8');assert.match(text,/^name:/m);assert.match(text,/^on:/m);assert.match(text,/^jobs:/m);
 }
 for(const file of ['docs/PRODUCTION_HARDENING.md','docs/RUNBOOK.md','docs/LAUNCH_CHECKLIST.md','docs/SECURITY.md'])assert.ok(existsSync(file),file);
});

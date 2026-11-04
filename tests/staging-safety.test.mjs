import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import {scheduled} from '../src/delivery.mjs';
import {deliverAlerts} from '../src/aggregator-jobs.mjs';
import {sendWeeklyReports} from '../src/aggregator/reportService.mjs';
import {deliverPartnerWebhook} from '../src/publicApi/webhookService.ts';
import {platformApi} from '../src/platform-api.mjs';
import {withSecurity} from '../src/security/gateway.ts';
function database(){
 const sql=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));
 return {sql,prepare(q){const st=sql.prepare(q);let p=[];const s={bind(...v){p=v;return s;},first(){return st.get(...p)||null;},all(){return {results:st.all(...p)};},run(){return {meta:{changes:Number(st.run(...p).changes)}};}};return s;}};
}
test('staging delivery switch blocks every notification sender even with credentials configured',async()=>{
 const DB=database(),env={DB,SIDE_EFFECTS_ENABLED:'0',TELEGRAM_BOT_TOKEN:'test-only-bot',EMAIL_API_KEY:'test-only-key',MAIL_FROM:'test@example.org'};
 DB.sql.exec("INSERT INTO am_users(id,username) VALUES('tg:123','Test');INSERT INTO am_delivery_preferences(user_id,telegram,telegram_chat) VALUES('tg:123',1,'123');INSERT INTO am_delivery_queue(id,user_id,channel,payload) VALUES('test','tg:123','telegram','{}');");
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('OUTBOUND_FORBIDDEN');};
 try{
  await scheduled(env);await deliverAlerts(env);assert.deepEqual(await sendWeeklyReports(env),{skipped:true});
  let retried=0;await deliverPartnerWebhook({body:{delivery_id:'test'},retry({delaySeconds}){retried=delaySeconds;}},env);
  assert.equal(retried,300);
  const r=await platformApi(new Request('https://museum.test/api/platform/auth/email',{method:'POST',headers:{Origin:'https://museum.test','Content-Type':'application/json'},body:JSON.stringify({email:'test@example.org'})}),env);
  assert.equal(r.status,503);assert.equal((await r.json()).error,'EXTERNAL_DELIVERY_DISABLED');
  assert.equal(calls,0);assert.equal(DB.sql.prepare("SELECT attempts FROM am_delivery_queue WHERE id='test'").get().attempts,0);
 }finally{globalThis.fetch=original;DB.sql.close();}
});
test('staging HTML identifies synthetic authentication without modifying production pages',async()=>{
 const request=new Request('https://museum.test/'),next=()=>new Response('<html><body><main>Test</main></body></html>',{headers:{'Content-Type':'text/html'}});
 const stage=await withSecurity(request,{ENVIRONMENT:'staging',TELEGRAM_AUTH_MODE:'synthetic'},{},next);
 assert.equal(stage.headers.get('X-AirdropMuseum-Environment'),'staging');assert.match(await stage.text(),/autentikasi sintetis/);
 const production=await withSecurity(request,{},{},next);assert.doesNotMatch(await production.text(),/data-staging-banner/);
});

test('staging credential setup and cleanup refuse production before reading files or making requests',async()=>{
 const {spawnSync}=await import('node:child_process');
 for(const script of ['prepare-staging-load.mjs','cleanup-staging-load.mjs']){
  const r=spawnSync(process.execPath,['scripts/'+script],{encoding:'utf8',env:{PATH:process.env.PATH,RUNTIME_TEST_ORIGIN:'https://airdrop-museum.xirraen.workers.dev',STAGING_SYNTHETIC_E2E:'1',STAGING_PRIVATE_EVIDENCE_ROOT:'/nonexistent'}});
  assert.notEqual(r.status,0);assert.match(r.stderr,/DEDICATED_SYNTHETIC_STAGING_REQUIRED/);assert.doesNotMatch(r.stderr,/ENOENT/);
 }
});

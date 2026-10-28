import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const base=process.env.RUNTIME_TEST_ORIGIN||'http://localhost:8787';
const local=['localhost','127.0.0.1'].includes(new URL(base).hostname);
const staging=process.env.STAGING_SYNTHETIC_E2E==='1'&&new URL(base).origin==='https://airdrop-museum-e2e-direct.xirraen.workers.dev';
if(!local&&!staging)throw Error('Runtime synthetic tests require localhost or the dedicated synthetic staging origin');
const user=Math.floor(Date.now()/10),bot=staging?process.env.STAGING_TEST_BOT_TOKEN:'local-synthetic-bot-token';
if(!bot)throw Error('Synthetic staging token required');
function telegram(id){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id})});const data=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const key=createHmac('sha256','WebAppData').update(bot).digest();p.set('hash',createHmac('sha256',key).update(data).digest('hex'));return p.toString();}
async function call(path,method='GET',body,id=user){const r=await fetch(base+path,{method,headers:{Origin:base,...(id?{'X-Telegram-Init-Data':telegram(id)}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={text}}return {status:r.status,data,headers:r.headers};}
const results=[];async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);}
await check('real Worker serves blue dashboard, source-backed aggregator and Telegram frame policy',async()=>{const r=await call('/');assert.equal(r.status,200);assert.match(r.data.text,/mini-ui\.css/);const aggregator=await call('/aggregator.html');assert.equal(aggregator.status,200);assert.match(aggregator.data.text,/aggregator-modern\\.css/);assert.match(aggregator.data.text,/agg-mobile-nav/);assert.match(aggregator.data.text,/Katalog Airdrop/);assert.match(r.headers.get('Content-Security-Policy'),/https:\/\/web.telegram.org/);assert.equal(r.headers.get('X-Frame-Options'),null);});
await check('unauthenticated journal access denied',async()=>assert.equal((await call('/api/autopsy/decisions','GET',undefined,null)).status,401));
await check('Telegram signature creates HttpOnly session without wallet signing',async()=>{const r=await call('/api/platform/auth/telegram','POST',{});assert.equal(r.status,200);assert.match(r.headers.get('Set-Cookie'),/HttpOnly/);assert.equal((await call('/api/platform/auth/challenge','POST',{})).status,410);});
const created=await call('/api/autopsy/decisions','POST',{campaign_id:'runtime-ended',reason:'Synthetic test based on official source',primary_evidence_url:'https://official.example.org/docs',decision_source:'official',time_budget_minutes:15,cost_ceiling_usd:0,realistic_expectations:'No guaranteed allocation',expected_version:0,knowledge_cutoff_at:new Date().toISOString()});
assert.equal(created.status,201,JSON.stringify(created.data));let state=created.data.state;const aggregate=created.data.aggregate_id;
await check('cross-user read cannot expose journal',async()=>assert.equal((await call('/api/autopsy/'+aggregate,'GET',undefined,user+1)).status,404));
const body=()=>({expected_version:state.version,knowledge_cutoff_at:new Date().toISOString(),evidence_refs:[state.evidence[0].id]});
const command=async(op,fields)=>{const r=await call('/api/autopsy/'+aggregate+'/'+op,'POST',{...body(),...fields});assert.equal(r.status,200,op+': '+JSON.stringify(r.data));state=r.data.state;return r;};
await check('concurrent D1 writes accept one version and reject the other',async()=>{const payload={...body(),phase:'before_snapshot',quest_count:1,chain_count:1,gas_cost_usd:0,bridge_cost_usd:0,research_minutes:5};const writes=await Promise.all([call('/api/autopsy/'+aggregate+'/activity','POST',payload),call('/api/autopsy/'+aggregate+'/activity','POST',payload)]);assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);state=writes.find(r=>r.status===200).data.state;});
await check('HTTPS evidence and hypothesis commands succeed',async()=>{await command('evidence',{kind:'official_link',value:'https://official.example.org/additional'});await command('hypothesis',{hypothesis:'Synthetic retrospective hypothesis'});});
await check('invalid evidence and outcome revision are rejected',async()=>{const unsafe=await call('/api/autopsy/'+aggregate+'/evidence','POST',{...body(),kind:'official_link',value:'http://127.0.0.1'});assert.equal(unsafe.status,400);await command('outcome',{outcome:'unknown'});const revision=await call('/api/autopsy/'+aggregate+'/outcome','POST',{...body(),outcome:'not_allocated'});assert.equal(revision.status,400);await command('outcome',{outcome:'not_allocated',revision_reason:'Synthetic source correction'});});
await check('consent, finalization and projection repair run in workerd',async()=>{await command('consent',{enabled:true});await command('finalize',{note:'Synthetic final review'});await command('replay',{});});
await check('consent withdrawal removes cohort from future analysis',async()=>{await command('consent',{enabled:false});const r=await call('/api/autopsy/insights/patterns');assert.equal(r.status,200);assert.equal(r.data.sample_size,0);});
await check('admin scope and public evidence privacy are enforced',async()=>{assert.equal((await call('/api/admin/overview')).status,401);assert.equal((await call('/api/autopsy/evidence-card/'+aggregate,'GET',undefined,null)).status,404);});
await check('private export is bounded and owner-scoped',async()=>{const r=await call('/api/autopsy/export?limit=2');assert.equal(r.status,200);assert.equal(r.data.events.length,2);assert.ok(r.data.events.every(e=>e.user_scope==='tg:'+user));});
await check('large streamed journal payload is rejected',async()=>{const r=await call('/api/autopsy/decisions','POST',{reason:'x'.repeat(1048577)});assert.equal(r.status,413);});
await check('journal erasure requires explicit confirmation and preserves another owner',async()=>{
 const preview=await call('/api/autopsy/privacy');assert.equal(preview.status,200);assert.ok(preview.data.event_count>0);
 const wrong=await call('/api/autopsy/privacy','POST',{confirmation:'yes',expected_event_count:preview.data.event_count,expected_last_event_id:preview.data.last_event_id});assert.equal(wrong.status,400);
 const other=await call('/api/autopsy/privacy','POST',{confirmation:'HAPUS JURNAL SAYA',expected_event_count:preview.data.event_count,expected_last_event_id:preview.data.last_event_id},user+1);assert.equal(other.status,409);
});
let erasureReceipt;
await check('owner journal erasure removes private data and persists external restore protection',async()=>{
 const preview=await call('/api/autopsy/privacy');
 const erased=await call('/api/autopsy/privacy','POST',{confirmation:'HAPUS JURNAL SAYA',expected_event_count:preview.data.event_count,expected_last_event_id:preview.data.last_event_id});
 assert.equal(erased.status,200,JSON.stringify(erased.data));assert.equal(erased.data.live_erased,true);assert.equal(erased.data.backup_replay_protected,true);erasureReceipt=erased.data.request_id;
 assert.equal((await call('/api/autopsy/'+aggregate)).status,404);assert.equal((await call('/api/autopsy/export')).data.events.length,0);
});
console.log(JSON.stringify({runtime:staging?'Cloudflare Worker + remote synthetic D1':'workerd + local D1',passed:results.length,failed:0,aggregate_id:aggregate,erasure_request_id:erasureReceipt}));

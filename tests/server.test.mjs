import test from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import {api,limitedText} from '../src/api.mjs';import {verifyTelegram} from '../src/auth.mjs';
const token='TEST_ONLY_TOKEN',now=()=>Math.floor(Date.now()/1000);
function fixture(id=42,time=now()){const p=new URLSearchParams({auth_date:String(time),user:JSON.stringify({id,first_name:'Test'})});const text=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update(text).digest('hex'));return p.toString()}
function db(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001_core.sql',import.meta.url),'utf8'));return {sql,prepare(query){let values=[];const statement=sql.prepare(query);return {bind(...v){values=v;return this},async first(){return statement.get(...values)||null},async all(){return {results:statement.all(...values)}},async run(){const r=statement.run(...values);return {meta:{changes:Number(r.changes)}}}}}}}
const state={version:2,saved:['prism'],done:{'prism:0':true}};
function request(method='GET',id=42,revision,body=state){return new Request('https://museum.test/api/me/state',{method,headers:{'X-Telegram-Init-Data':fixture(id),'Content-Type':'application/json',...(revision!==undefined?{'If-Match':String(revision)}:{})},...(method==='PUT'?{body:JSON.stringify(body)}:{})})}
test('Telegram signature accepts independent HMAC fixture and rejects forged expired future and duplicate parameters',async()=>{assert.equal((await verifyTelegram(fixture(),token)).id,'42');for(const value of [fixture().replace('Test','Fake'),fixture(42,now()-3601),fixture(42,now()+60),fixture()+'&user=%7B%22id%22%3A99%7D'])await assert.rejects(()=>verifyTelegram(value,token),/UNAUTHORIZED/)});
test('missing bot secret fails closed without a database access',async()=>{const r=await api(request(),{});assert.equal(r.status,503);assert.equal((await r.json()).error,'AUTH_NOT_CONFIGURED')});
test('cloud state has per-user isolation and atomic revision conflicts',async()=>{const DB=db(),env={DB,TELEGRAM_BOT_TOKEN:token};assert.equal((await api(request('PUT',42,0),env)).status,200);assert.equal((await api(request('PUT',42,0),env)).status,409);let r=await (await api(request(),env)).json();assert.equal(r.revision,1);assert.ok(r.state.done['prism:0']);assert.equal((await (await api(request('GET',99),env)).json()).state,null);assert.equal((await api(request('PUT',42,1),env)).status,200);assert.equal((await api(request('PUT',42,1),env)).status,409);DB.sql.close()});
test('writes reject missing revision invalid JSON and cross-origin requests',async()=>{const DB=db(),env={DB,TELEGRAM_BOT_TOKEN:token};assert.equal((await api(request('PUT'),env)).status,428);assert.equal((await api(request('PUT',42,0,{version:9}),env)).status,400);const cross=request('PUT',42,0);cross.headers.set('Origin','https://attacker.test');assert.equal((await api(cross,env)).status,403);DB.sql.close()});
test('public catalog reads separate shared data and reports database readiness',async()=>{const DB=db(),env={DB};let r=await api(new Request('https://museum.test/api/capabilities'),env);assert.equal((await r.json()).database,'ready');r=await api(new Request('https://museum.test/api/exhibits'),env);assert.deepEqual((await r.json()).exhibits,[]);DB.sql.close()});
test('stream body limit and HEAD response are enforced',async()=>{await assert.rejects(()=>limitedText(new Request('https://museum.test',{method:'PUT',body:'x'.repeat(1000001)})),/BODY_TOO_LARGE/);assert.equal(await (await api(new Request('https://museum.test/api/health',{method:'HEAD'}))).text(),'')});
test('invalid signature never reaches user state queries',async()=>{let touched=false;const DB={prepare(){touched=true;throw Error('Unexpected')}};const req=request();req.headers.set('X-Telegram-Init-Data','invalid');assert.equal((await api(req,{DB,TELEGRAM_BOT_TOKEN:token})).status,401);assert.equal(touched,false)});

test('legacy catalog routes exclude confirmed private records and unreviewed public drafts',async()=>{
 const DB=db();
 for(const [id,visibility,status] of [['private','private','confirmed'],['draft','public','private_draft'],['visible','public','confirmed']])
  DB.sql.prepare('INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES(?,?,?,?)').run(id,JSON.stringify({name:id,visibility,private_note:"do-not-disclose"}),'https://official.example.org',status);
 for(const path of ['/api/exhibits','/api/v1/airdrops']){
  const response=await api(new Request('https://museum.test'+path),{DB});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual((body.exhibits||body.airdrops).map(x=>x.id),['visible']);
  assert.equal(JSON.stringify(body).includes('do-not-disclose'),false);
 }
 DB.sql.close();
});

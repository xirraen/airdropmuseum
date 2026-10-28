import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {OPENAPI} from '../src/publicApi/openapi.ts';
import {xml,feed} from '../src/publicApi/feedService.ts';
import {listCampaigns,campaignBySlug,etagResponse} from '../src/publicApi/campaignApi.ts';
import {principal,adminKeys} from '../src/publicApi/auth.ts';
import {checkRate} from '../src/publicApi/rateLimit.ts';
import {digest,DISCLAIMER} from '../src/publicApi/types.ts';
import {webhooksRoute,publishPartnerEvent,webhookSignature,deliverPartnerWebhook,handlePartnerQueue} from '../src/publicApi/webhookService.ts';
import {publicApiRoutes} from '../src/publicApi/publicApiRoutes.ts';
class D1{
 constructor(){this.sqlite=new DatabaseSync(':memory:');for(const name of ['0001_core.sql','0003_platform.sql','0010_discovery_automation.sql','0011_source_trust.sql','0012_public_api.sql'])this.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));}
 prepare(query){const stmt=this.sqlite.prepare(query);let p=[];const handle={bind(...args){p=args;return handle;},first(){return stmt.get(...p)||null;},all(){return {results:stmt.all(...p)};},run(){return {meta:{changes:Number(stmt.run(...p).changes)}};}};return handle;}
}
const ms=Date.parse('2026-10-28T12:00:00Z');
function env(){return {DB:new D1(),MODERATOR_IDS:'tg:admin',API_HASH_PEPPER:'test-private-pepper',WEBHOOK_MASTER_SECRET:'a'.repeat(48),PUBLIC_API_ORIGIN:'https://museum.example.org',PUBLIC_API_ALLOWED_ORIGINS:'https://app.example.org',PUBLIC_API_RATE_LIMITER:{async limit(){return {success:true};}},PARTNER_WEBHOOK_QUEUE:{sent:[],async send(v){this.sent.push(v);}}};}
function insert(e,id,p,review='confirmed',updated='2026-10-28T12:00:00.000Z',verified=true){
 e.DB.prepare('INSERT INTO am_core_exhibits(id,payload,source_url,review_status,updated_at) VALUES(?,?,?,?,?)').bind(id,JSON.stringify(p),'https://official.example.org/source',review,updated).run();
 if(verified)e.DB.prepare("INSERT INTO verification_runs(id,run_key,campaign_id,trigger_type,status,started_at,finished_at,confidence_label) VALUES(?,?,?,?,?,?,?,?)").bind('verify:'+id,'key:'+id,id,'manual','complete',updated,updated,'medium_confidence').run();
}
function project(name='alpha',more={}){return {slug:name,name:'A <B> & Co',project_name:'A',visibility:'public',category:'testnet',status:'confirmed',chains:['Base'],description:'Read-only',snapshot_at:'2026-11-02',claim_deadline_at:'2026-11-03',official_urls:['https://official.example.org'],wallet:'0xsecret',user_points:999,telegram_chat_id:'123',private_key:'must-not-leak',...more};}
const req=(path,opts={})=>new Request('https://museum.example.org'+path,opts);
test('migration 0012 preserves legacy registry and creates four tables',()=>{
 const e=env();insert(e,'public',project());assert.equal(e.DB.prepare("SELECT id FROM am_core_exhibits WHERE id='public'").first().id,'public');
 for(const t of ['api_keys','api_usage_log','partner_webhooks','webhook_deliveries'])assert.ok(e.DB.prepare("SELECT name FROM sqlite_master WHERE name=?").bind(t).first());
 assert.ok(e.DB.prepare('SELECT version FROM am_core_schema WHERE version=8').first());
});
test('OpenAPI 3.1 JSON document matches route module and declares every /v1 path',()=>{
 const doc=JSON.parse(readFileSync(new URL('../docs/openapi.json',import.meta.url),'utf8'));assert.deepEqual(doc,OPENAPI);
 assert.equal(doc.openapi,'3.1.0');assert.ok(doc.components.securitySchemes.bearerAuth);
 for(const p of ['/v1/openapi.json','/v1/campaigns','/v1/campaigns/{slug}','/v1/campaigns/{slug}/sources','/v1/campaigns/{slug}/timeline','/v1/deadlines','/v1/snapshots','/v1/feeds/campaigns.xml','/v1/feeds/deadlines.xml','/v1/webhooks','/v1/webhooks/{id}'])assert.ok(doc.paths[p],p);
 for(const ops of Object.values(doc.paths))for(const def of Object.values(ops))for(const status of [400,401,403,404,429,500])assert.ok(def.responses[status],String(status));
});
test('public filtering fails closed for private/draft/unverified/invalid HTTPS',async()=>{
 const e=env();insert(e,'ok',project('ok'));insert(e,'draft',project('draft'),'draft');insert(e,'private',project('private',{visibility:'private'}));insert(e,'unverified',project('unverified'),'confirmed',undefined,false);
 const r=await listCampaigns(e,new URLSearchParams());assert.deepEqual(r.items.map(x=>x.slug),['ok']);assert.equal(r.items[0].source_url,'https://official.example.org/source');assert.ok(r.items[0].last_verified_at);assert.equal(r.items[0].disclaimer,DISCLAIMER);
 assert.deepEqual(Object.keys(r.items[0]).sort(),['slug','name','project_name','category','status','chains','description','official_urls','source_url','snapshot_at','activity_start_at','activity_end_at','claim_opens_at','claim_deadline_at','confidence_label','source_count','last_verified_at','updated_at','disclaimer'].sort());
 assert.equal(JSON.stringify(r).includes('0xsecret'),false);assert.equal(JSON.stringify(r).includes('must-not-leak'),false);
 await assert.rejects(()=>campaignBySlug(e,'draft'),/NOT_FOUND/);
});
test('filters and cursor pagination, scoped to filter hash',async()=>{
 const e=env();insert(e,'a',project('a',{chain:'Base',kyc_required:false}));insert(e,'b',project('b',{chain:'Ethereum',kyc_required:true}));insert(e,'c',project('c',{chain:'Base',kyc_required:false}));
 const list=await listCampaigns(e,new URLSearchParams({limit:'1'}));assert.equal(list.items.length,1);assert.ok(list.next_cursor);
 const next=await listCampaigns(e,new URLSearchParams({limit:'1',cursor:list.next_cursor}));assert.equal(next.items.length,1);assert.notEqual(next.items[0].slug,list.items[0].slug);
 const only=await listCampaigns(e,new URLSearchParams({chain:'Base',kyc_required:'false'}));assert.deepEqual(only.items.map(x=>x.slug).sort(),['a','c']);
 await assert.rejects(()=>listCampaigns(e,new URLSearchParams({limit:'101'})),/INVALID_LIMIT/);
 await assert.rejects(()=>listCampaigns(e,new URLSearchParams({chain:'Base',limit:'1',cursor:list.next_cursor})),/INVALID_CURSOR/);
});
test('ETag / 304 and cache control',async()=>{
 const e=env();insert(e,'a',project());const res=await publicApiRoutes(req('/v1/campaigns'),e);
 assert.equal(res.status,200);assert.equal(res.headers.get('X-RateLimit-Limit'),'30');assert.ok(res.headers.get('ETag'));
 const etag=res.headers.get('ETag'),r=await publicApiRoutes(req('/v1/campaigns',{headers:{'If-None-Match':etag}}),e);
 assert.equal(r.status,304);assert.equal(await r.text(),'');
});
test('native limit, minute limit and daily quota return 429',async()=>{
 const e=env(),request=req('/v1/campaigns');e.PUBLIC_API_RATE_LIMITER.limit=async()=>({success:false});
 await assert.rejects(()=>checkRate(request,e,{tier:'anonymous',limit:30,id:null}),/RATE_LIMITED/);
 e.PUBLIC_API_RATE_LIMITER.limit=async()=>({success:true});
 const p={tier:'free',id:'key1',key:{daily_quota:1},limit:60};await checkRate(request,e,p);
 await assert.rejects(()=>checkRate(request,e,p),/RATE_LIMITED/);
});
test('API key admin creates one-time secret, authenticates and revokes',async()=>{
 const e=env(),cookie='a'.repeat(64);
 e.DB.prepare("INSERT INTO am_users(id,username) VALUES('tg:admin','Moderator')").run();
 e.DB.prepare('INSERT INTO am_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(cookie),'tg:admin',Math.floor(Date.now()/1000)+10000).run();
 const auth={'Cookie':'am_session='+cookie,'Origin':'https://museum.example.org','Content-Type':'application/json'};
 const create=await adminKeys(req('/api/admin/api-keys',{method:'POST',headers:auth,body:JSON.stringify({name:'Partner A',tier:'partner'})}),e);
 const created=await create.json();assert.equal(create.status,201);assert.match(created.api_key,/^am_v1_[a-f0-9]{64}$/);
 const list=await(await adminKeys(req('/api/admin/api-keys',{headers:auth}),e)).text();assert.equal(list.includes(created.api_key),false);
 const p=await principal(req('/v1/campaigns',{headers:{Authorization:'Bearer '+created.api_key}}),e);assert.equal(p.tier,'partner');assert.equal(p.limit,300);
 await assert.rejects(()=>principal(req('/v1/campaigns',{headers:{Authorization:'Bearer am_v1_'+'0'.repeat(64)}}),e),/INVALID_API_KEY/);
 const revoked=await adminKeys(req('/api/admin/api-keys/'+created.key.id,{method:'DELETE',headers:auth}),e);assert.equal(revoked.status,200);
 await assert.rejects(()=>principal(req('/v1/campaigns',{headers:{Authorization:'Bearer '+created.api_key}}),e),/INVALID_API_KEY/);
});
test('RSS generation escapes all text, has attribution, excludes private campaigns',async()=>{
 const e=env();insert(e,'a',project('a'));insert(e,'hidden',project('hidden',{visibility:'private'}));
 const body=await feed(e,'https://museum.example.org','campaigns');assert.match(body,/&lt;B&gt; &amp; Co/);assert.match(body,/<source url="https:\/\/official\.example\.org\/source"/);
 assert.equal(body.includes('hidden'),false);assert.equal(body.includes('must-not-leak'),false);assert.equal(xml('<&"\''),'&lt;&amp;&quot;&apos;');
 const deadlines=await feed(e,'https://museum.example.org','deadlines');assert.match(deadlines,/claim deadline/);
});
test('webhook creation returns one-time secret; signed delivery uses exact raw body',async()=>{
 const e=env();insert(e,'a',project('a'));
 e.DB.prepare("INSERT INTO api_keys(id,name,key_hash,partner_scope,tier,rate_limit_per_minute,daily_quota,created_by) VALUES('partner','Partner','hash','','partner',300,20000,'admin')").run();
 const p={tier:'partner',id:'partner'};
 const result=await webhooksRoute(req('/v1/webhooks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://partner.example.org/hook',events:['campaign.updated']})}),e,p);
 assert.equal(result.status,201);assert.match(result.body.webhook_secret,/^whsec_[a-f0-9]{64}$/);
 const stored=e.DB.prepare('SELECT * FROM partner_webhooks WHERE id=?').bind(result.body.id).first();
 assert.equal(stored.secret_hash,await digest(result.body.webhook_secret));assert.equal(JSON.stringify(stored).includes(result.body.webhook_secret),false);
 const details=await webhooksRoute(req('/v1/webhooks/'+result.body.id),e,p);assert.equal(JSON.stringify(details).includes(result.body.webhook_secret),false);
 assert.equal((await publishPartnerEvent(e,'campaign.updated','a',{eventId:'event1'})).queued,1);
 const message={body:e.PARTNER_WEBHOOK_QUEUE.sent[0],ack(){this.acked=true;},retry(){throw Error('unexpected retry');}};
 await deliverPartnerWebhook(message,e,async(_url,init)=>{
  assert.equal(init.headers['X-AirdropMuseum-Event'],'campaign.updated');
  assert.equal(init.headers['X-AirdropMuseum-Signature'],await webhookSignature(result.body.webhook_secret,init.body));
  assert.equal(JSON.stringify(init.body).includes('must-not-leak'),false);
  return new Response('',{status:204});
 });
 assert.ok(message.acked);assert.equal(e.DB.prepare('SELECT status FROM webhook_deliveries').first().status,'delivered');
});
test('webhook failures retry exponentially then DLQ handles final status',async()=>{
 const e=env();insert(e,'a',project('a'));e.DB.prepare("INSERT INTO api_keys(id,name,key_hash,partner_scope,tier,rate_limit_per_minute,daily_quota,created_by) VALUES('partner','Partner','hash','','partner',300,20000,'admin')").run();
 const p={tier:'partner',id:'partner'};
 const hook=(await webhooksRoute(req('/v1/webhooks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://partner.example.org/hook',events:['campaign.updated']})}),e,p)).body;
 await publishPartnerEvent(e,'campaign.updated','a',{eventId:'failure1'});
 const mid=e.PARTNER_WEBHOOK_QUEUE.sent[0].delivery_id,message={body:{delivery_id:mid},acked:false,retries:[],ack(){this.acked=true;},retry(o){this.retries.push(o?.delaySeconds||0);}};
 for(let i=0;i<5;i++)await deliverPartnerWebhook(message,e,async()=>new Response('',{status:503}));
 assert.deepEqual(message.retries.slice(0,4),[60,120,240,480]);
 assert.equal(e.DB.prepare('SELECT attempts FROM webhook_deliveries').first().attempts,5);
 await handlePartnerQueue({queue:'airdrop-museum-partner-webhook-dlq',messages:[message]},e);
 assert.equal(e.DB.prepare('SELECT status FROM webhook_deliveries').first().status,'dead');assert.ok(message.acked);
});
test('CORS origins restricted and 429 includes Retry-After',async()=>{
 const e=env();let response=await publicApiRoutes(req('/v1/campaigns',{headers:{Origin:'https://malicious.example'}}),e);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 response=await publicApiRoutes(req('/v1/campaigns',{headers:{Origin:'https://app.example.org'}}),e);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://app.example.org');
 e.PUBLIC_API_RATE_LIMITER.limit=async()=>({success:false});response=await publicApiRoutes(req('/v1/campaigns'),e);assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
});

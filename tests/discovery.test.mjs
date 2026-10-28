import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {normalizeUrl} from '../src/discovery/types.ts';
import {parseFeed} from '../src/discovery/feedParser.ts';
import {classify} from '../src/discovery/classifier.ts';
import {fingerprint,storeDiscoveredItem} from '../src/discovery/dedupeService.ts';
import {consumeDiscoveryBatch,fetchDiscoverySource} from '../src/discovery/ingestService.ts';
import {scheduledDiscovery} from '../src/discovery/scheduled.ts';
import {reviewItem} from '../src/discovery/reviewService.ts';
import {discoveryRoutes} from '../src/discovery/discoveryRoutes.ts';
import {api} from '../src/api.mjs';
function database(){
 const sql=new DatabaseSync(':memory:');
 for(const f of ['0001_core.sql','0002_rewards.sql','0003_platform.sql','0004_workbench.sql','0010_discovery_automation.sql'])
  sql.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const DB={sql,prepare(q){const statement=sql.prepare(q);let params=[];return {bind(...v){params=v;return this;},async first(){return statement.get(...params)||null;},async all(){return {results:statement.all(...params)};},async run(){return {meta:{changes:Number(statement.run(...params).changes)}};}};},
 async batch(items){sql.exec('BEGIN');try{const results=[];for(const s of items)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return DB;
}
const sample={external_id:'guid-1',title:'Airdrop claim is live',url:'https://project.example/news?utm_source=feed',summary:'Read the rules.',published_at:'2026-10-27T00:00:00.000Z'};
function source(DB,id='s1',enabled=1){DB.sql.prepare('INSERT INTO discovery_sources(id,name,source_type,feed_url,enabled) VALUES(?,?,?,?,?)').run(id,'Source','rss','https://news.example/rss',enabled);}
const payload=(external_id='guid-1',url=sample.url)=>({source_id:'s1',item:{...sample,external_id,url}});
test('RSS 2.0 parses canonical HTTPS metadata and strips article markup',()=>{
 const xml='<rss version="2.0"><channel><item><title>New &amp; Safe</title><link>https://PROJECT.example/story?utm_source=x&amp;view=2#frag</link><guid>g1</guid><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Airdrop <b>update</b></p>]]></description></item></channel></rss>';
 const out=parseFeed(xml,'rss','https://news.example/rss');
 assert.equal(out.length,1);assert.equal(out[0].title,'New & Safe');assert.equal(out[0].external_id,'g1');
 assert.equal(out[0].url,'https://project.example/story?view=2');assert.equal(out[0].summary,'Airdrop update');
});
test('Atom parses alternate link, id and updated date',()=>{
 const xml='<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>atom:1</id><title>Points season</title><link rel="alternate" href="https://project.example/p"/><summary>Points are tracked.</summary><updated>2026-10-27T10:00:00Z</updated></entry></feed>';
 const out=parseFeed(xml,'atom','https://news.example/feed');assert.equal(out[0].external_id,'atom:1');assert.equal(out[0].url,'https://project.example/p');assert.match(out[0].published_at,/2026-10-27/);
});
test('JSON feed reads summary only, never full content',()=>{
 const out=parseFeed(JSON.stringify({version:'https://jsonfeed.org/version/1.1',items:[{id:'a',title:'Testnet',url:'https://project.example/new',summary:'summary',content_html:'secret full article'}]}),'json_feed','https://news.example/json');
 assert.equal(out[0].summary,'summary');assert.ok(!JSON.stringify(out).includes('secret full article'));
});
test('invalid XML, JSON, unsafe DTD and oversized feeds yield controlled errors',()=>{
 assert.throws(()=>parseFeed('<bad/>','rss','https://news.example/rss'),/INVALID_XML_FEED/);
 assert.throws(()=>parseFeed('{','json_feed','https://news.example/rss'),/INVALID_JSON_FEED/);
 assert.throws(()=>parseFeed('<!DOCTYPE rss><rss/>','rss','https://news.example/rss'),/UNSAFE_XML/);
 assert.throws(()=>parseFeed('x'.repeat(524289),'rss','https://news.example/rss'),/FEED_TOO_LARGE/);
});
test('normalization removes tracking, fragment, mixed-case host and rejects SSRF targets',()=>{
 assert.equal(normalizeUrl('https://EXAMPLE.org/a?utm_campaign=x&gclid=123&ok=2#top'),'https://example.org/a?ok=2');
 for(const value of ['http://example.org','https://localhost/a','https://127.0.0.1/a','https://[::1]/a','https://user:pw@example.org/x'])
  assert.throws(()=>normalizeUrl(value));
});
test('classifier recognizes every category and confidence rules',()=>{
 const cases=[['Airdrop claim is live','airdrop',0.8],['Points season 2','points',0.6],['Incentivized testnet','testnet',0.7],['Quest tasks','quest',0.55],['Claim details','claim',0.55],['Snapshot date','snapshot',0.65],['Product maintenance','unknown',0]];
 for(const [title,category,score] of cases){const out=classify({title});assert.equal(out.classification,category);assert.equal(out.classification_confidence,score);}
});
test('dedupe by GUID, URL and fingerprint updates last_seen, without a second item',async()=>{
 const DB=database();try{
 source(DB);assert.equal((await storeDiscoveredItem(DB,payload())).status,'created');
 assert.equal((await storeDiscoveredItem(DB,payload())).status,'existing');
 assert.equal((await storeDiscoveredItem(DB,payload('different-guid','https://PROJECT.example/news?utm_source=other'))).status,'existing');
 assert.equal((await storeDiscoveredItem(DB,payload('guid-1','https://project.example/other'))).status,'existing');
 const row=DB.sql.prepare('SELECT * FROM discovery_items').get();
 assert.equal(row.status,'pending_review');assert.equal(row.classification,'airdrop');
 assert.equal(DB.sql.prepare('SELECT count(*) n FROM discovery_items').get().n,1);
 assert.equal((await fingerprint({...sample,url:'https://project.example/news',published_at:sample.published_at})).length,64);
 }finally{DB.sql.close();}
});
test('fingerprint uniqueness across sources and exclusion of disabled source',async()=>{
 const DB=database();try{source(DB);DB.sql.prepare('INSERT INTO discovery_sources(id,name,source_type,feed_url) VALUES(?,?,?,?)').run('s2','Other','rss','https://other.example/rss');
 await storeDiscoveredItem(DB,payload());
 const duplicate=await storeDiscoveredItem(DB,{source_id:'s2',item:{...sample,external_id:'new-guid'}});
 assert.equal(duplicate.status,'existing');DB.sql.prepare('UPDATE discovery_sources SET enabled=0 WHERE id=?').run('s1');
 assert.equal((await storeDiscoveredItem(DB,payload('new','https://project.example/another'))).status,'ignored');
 assert.equal(DB.sql.prepare('SELECT count(*) n FROM discovery_items').get().n,1);
 }finally{DB.sql.close();}
});
test('approve, reject and convert are audited, and conversion never publishes',async()=>{
 const DB=database();try{source(DB);
 await storeDiscoveredItem(DB,payload());let row=DB.sql.prepare('SELECT id FROM discovery_items').get();
 await assert.rejects(reviewItem(DB,row.id,{id:'admin'},'convert',{}),/INVALID_STATUS_TRANSITION/);
 assert.equal((await reviewItem(DB,row.id,{id:'admin'},'approve')).status,'approved');
 const converted=await reviewItem(DB,row.id,{id:'admin'},'convert',{project_name:'Example',chain:'Ethereum'});
 assert.equal(converted.published,false);
 const draft=DB.sql.prepare('SELECT * FROM am_core_exhibits WHERE id=?').get(converted.campaign_id);
 assert.equal(draft.review_status,'draft');assert.equal(JSON.parse(draft.payload).status,'speculative');
 assert.equal(JSON.parse(draft.payload).publication_ready,false);
 assert.equal(JSON.parse(draft.payload).evidence[0].source_url,'https://project.example/news');
 assert.equal(DB.sql.prepare('SELECT count(*) n FROM discovery_review_log').get().n,2);
 const publicRes=await api(new Request('https://museum.example/api/exhibits'),{DB});assert.equal((await publicRes.json()).exhibits.length,0);
 await assert.rejects(reviewItem(DB,row.id,{id:'admin'},'convert',{}),/INVALID_STATUS_TRANSITION/);
 await storeDiscoveredItem(DB,payload('new','https://project.example/new'));
 row=DB.sql.prepare("SELECT id FROM discovery_items WHERE status='pending_review'").get();
 await assert.rejects(reviewItem(DB,row.id,{id:'admin'},'reject',{}),/REJECTION_REASON_REQUIRED/);
 assert.equal((await reviewItem(DB,row.id,{id:'admin'},'reject',{rejection_reason:'Unverified offer'})).status,'rejected');
 }finally{DB.sql.close();}
});
test('admin-only source management and csrf protection',async()=>{
 const DB=database();try{
 DB.sql.prepare("INSERT INTO am_users(id,username) VALUES('moderator','Moderator')").run();
 const token='ab'.repeat(32),hash=createHash('sha256').update(token).digest('hex');
 DB.sql.prepare('INSERT INTO am_sessions(token_hash,user_id,expires) VALUES(?,?,?)').run(hash,'moderator',Math.floor(Date.now()/1000)+3600);
 const make=(path,method='GET',body,origin='https://museum.example')=>new Request('https://museum.example/api/discovery'+path,{method,headers:{Cookie:'am_session='+token,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const sourceData={name:'Official Feed',source_type:'rss',feed_url:'https://official.example/rss',trust_level:'high'};
 assert.equal((await discoveryRoutes(make('/sources'),{DB})).status,403);
 const env={DB,MODERATOR_IDS:'moderator'};
 assert.equal((await discoveryRoutes(make('/sources','POST',sourceData,'https://evil.example'),env)).status,403);
 assert.equal((await discoveryRoutes(make('/sources','POST',sourceData),env)).status,201);
 assert.equal((await discoveryRoutes(make('/sources'),env)).status,200);
 assert.equal((await discoveryRoutes(make('/review'),env)).status,200);
 assert.equal((await discoveryRoutes(make('/sources','POST',{...sourceData,feed_url:'http://unsecure.example'}),env)).status,400);
 }finally{DB.sql.close();}
});
test('fetch enqueues only short metadata and handles 304, feed failure and queue absence',async()=>{
 const DB=database();try{source(DB);let enqueued=[];
 const env={DB,DISCOVERY_QUEUE:{sendBatch:async batch=>{enqueued.push(...batch);}}};
 const row=DB.sql.prepare('SELECT * FROM discovery_sources').get();
 const xml='<rss><channel><item><title>Points season</title><link>https://project.example/a</link><guid>g1</guid><description>A new season</description></item></channel></rss>';
 const run=await fetchDiscoverySource(env,row,{fetcher:async()=>new Response(xml,{status:200,headers:{etag:'"abc"'}})});
 assert.equal(run.queued,1);assert.equal(enqueued.length,1);assert.equal(enqueued[0].body.item.summary,'A new season');
 const unchanged=await fetchDiscoverySource(env,{...row,etag:'"abc"'},{fetcher:async()=>new Response(null,{status:304})});
 assert.equal(unchanged.not_modified,true);
 const bad=await fetchDiscoverySource(env,row,{fetcher:async()=>new Response('<bad>',{status:200})});
 assert.equal(bad.error,'INVALID_XML_FEED');
 await assert.rejects(fetchDiscoverySource({DB},row),/QUEUE_UNAVAILABLE/);
 }finally{DB.sql.close();}
});
test('queue consumes idempotently, retries and records safe error for DLQ attempts',async()=>{
 const DB=database();try{source(DB);let ack=0,retry=0;
 const message={body:payload(),attempts:1,ack(){ack++;},retry(){retry++;}};
 await consumeDiscoveryBatch({messages:[message,message]},{DB});
 assert.equal(ack,2);assert.equal(DB.sql.prepare('SELECT count(*) n FROM discovery_items').get().n,1);
 const errorMsg={body:payload(),attempts:4,ack(){ack++;},retry(){retry++;}};
 await consumeDiscoveryBatch({messages:[errorMsg]},{DB},{store:async()=>{throw Error('secret credential must not be logged');}});
 assert.equal(retry,1);assert.equal(DB.sql.prepare('SELECT last_error FROM discovery_sources').get().last_error,'QUEUE_ITEM_FAILED');
 }finally{DB.sql.close();}
});
test('cron selects at most 20 enabled sources and does not publish',async()=>{
 const DB=database();try{
 for(let i=0;i<25;i++)DB.sql.prepare('INSERT INTO discovery_sources(id,name,source_type,feed_url,enabled) VALUES(?,?,?,?,?)').run('s'+i,'Feed '+i,'rss','https://feed'+i+'.example/rss',i===24?0:1);
 let count=0;const env={DB,DISCOVERY_QUEUE:{sendBatch:async()=>{count++;}}};
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('<rss><channel></channel></rss>');
 try{const result=await scheduledDiscovery(env);assert.equal(result.scanned,20);assert.equal(count,0);}
 finally{globalThis.fetch=oldFetch;}
 }finally{DB.sql.close();}
});
test('deployment declares discovery cron, producer, retries and DLQ',()=>{
 const cfg=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.ok(cfg.triggers.crons.includes('*/30 * * * *'));assert.ok(cfg.triggers.crons.includes('17 * * * *'));
 assert.equal(cfg.queues.producers[0].binding,'DISCOVERY_QUEUE');
 assert.equal(cfg.queues.consumers[0].max_retries,3);
 assert.equal(cfg.queues.consumers[0].dead_letter_queue,'airdrop-museum-discovery-dlq');
});

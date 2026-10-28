import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {normalizeTrustUrl,classifyTrustTier} from '../src/trust/domainPolicy.ts';
import {computeSourceScore,campaignConfidence} from '../src/trust/trustScoreService.ts';
import {detectConflicts} from '../src/trust/conflictDetector.ts';
import {sourceFingerprint} from '../src/trust/fingerprint.ts';
import {fetchTrustSource} from '../src/trust/sourceFetcher.ts';
import {verifyCampaign} from '../src/trust/verificationService.ts';
test('URL HTTPS strict, normalization and invalid hosts',()=>{
 assert.equal(normalizeTrustUrl('https://EXAMPLE.org:443/claim?utm_source=foo&b=2#a'),'https://example.org/claim?b=2');
 assert.equal(normalizeTrustUrl('https://bücher.de/'),'https://xn--bcher-kva.de/');
 for(const value of ['http://a.org','https://localhost','https://127.0.0.1','https://[::1]','https://example.local','https://user:pass@example.org','https://example.org:444'])assert.throws(()=>normalizeTrustUrl(value));
});
test('trust tiers require official domain or independently linked official social',()=>{
 const opts={officialDomains:['museum.org'],officialSocialUrls:['https://x.com/museum'],contracts:['0x0000000000000000000000000000000000000001']};
 assert.equal(classifyTrustTier({...opts,url:'https://museum.org/info'}),'primary_official');
 assert.equal(classifyTrustTier({...opts,url:'https://docs.museum.org/info'}),'primary_official');
 assert.equal(classifyTrustTier({...opts,url:'https://etherscan.io/address/0x0000000000000000000000000000000000000001',explorerApproved:true}),'primary_official');
 assert.equal(classifyTrustTier({...opts,url:'https://x.com/museum',linkedFromOfficial:true}),'official_social');
 assert.notEqual(classifyTrustTier({...opts,url:'https://x.com/copy',linkedFromOfficial:true}),'official_social');
 assert.equal(classifyTrustTier({...opts,url:'https://community.example.org/'}),'unknown');
});
test('score and confidence rules',()=>{
 const now=Date.now(),timestamp=new Date(now).toISOString(),source={tier:'primary_official',linked_from_official:true,consistency:3,last_fetched_at:timestamp};
 assert.equal(computeSourceScore(source,now),85);
 assert.ok(computeSourceScore({tier:'community',last_fetched_at:'2020-01-01',material_conflicts:2},now)<15);
 const sources=[{tier:'primary_official',trust_score:85,last_fetched_at:timestamp},{tier:'primary_official',trust_score:85,last_fetched_at:timestamp}];
 assert.equal(campaignConfidence({sources,conflicts:[],fields:{claim_deadline_at:'2026-11-01'}}),'high_confidence');
 assert.notEqual(campaignConfidence({sources:sources.slice(0,1),conflicts:[],fields:{claim_deadline_at:'2026-11-01'}}),'high_confidence');
 assert.equal(campaignConfidence({sources,conflicts:[{severity:'material',status:'open'}],fields:{snapshot_at:'2026-10-29'}}),'needs_review');
 assert.equal(campaignConfidence({sources,conflicts:[],fields:{},notApplicable:['snapshot_at','claim_opens_at','claim_deadline_at']}),'high_confidence');
 assert.equal(campaignConfidence({sources,conflicts:[],fields:{}}),'needs_review');
});
test('conflicts detect material, minor, informational and ignore canonical equivalent values',async()=>{
 const conflicts=await detectConflicts('c',[{id:'a',metadata:{chain:'Base',claim_deadline_at:'2026-11-01',project_name:'Museum Coin',category:'quest'}},{id:'b',metadata:{chain:'Arbitrum',claim_deadline_at:'2026-11-02',project_name:'Museum DAO',category:'testnet'}}]);
 assert.equal(conflicts.length,4);
 assert.equal(conflicts.find(c=>c.field==='chain').severity,'material');
 assert.equal(conflicts.find(c=>c.field==='project_name').severity,'minor');
 assert.equal(conflicts.find(c=>c.field==='category').severity,'informational');
 assert.deepEqual(await detectConflicts('c',[{id:'a',metadata:{chain:'BASE',snapshot_at:'2026-11-01T00:00:00Z'}},{id:'b',metadata:{chain:'base',snapshot_at:'2026-11-01T00:00:00.000Z'}}]),[]);
 assert.equal(await sourceFingerprint({chain:'BASE'}),await sourceFingerprint({chain:'base'}));
});
function kv(){const memory=new Map();return {async get(k,mode){const v=memory.get(k);return v&&mode==='json'?JSON.parse(v):v||null;},async put(k,v){memory.set(k,v);},async delete(k){memory.delete(k);}};}
const response=(body,type='application/json')=>new Response(body,{status:200,headers:{'Content-Type':type,'ETag':'"test"'}});
test('KV cache hit, social link extraction, robots denial',async()=>{
 const cache=kv();let fetchCount=0,link={campaign_id:'c',source_url:'https://museum.org/meta',registered_by:'tg:1',enabled:1,extracted_metadata:'{}'};
 const fetcher=async url=>{fetchCount++;return String(url).endsWith('robots.txt')?new Response(null,{status:404}):response('<meta name="airdrop:claim_deadline_at" content="2026-11-01"><a href="https://x.com/museum">Social</a>','text/html');};
 const date=Date.parse('2026-10-28T00:00:00Z');
 const one=await fetchTrustSource({TRUST_CACHE:cache},link,{fetcher,now:date});
 assert.equal(one.metadata.claim_deadline_at,'2026-11-01');
 assert.deepEqual(one.social_urls,['https://x.com/museum']);
 const two=await fetchTrustSource({TRUST_CACHE:cache},link,{fetcher,now:date+3600000});
 assert.equal(two.from_cache,true);assert.equal(fetchCount,2);
 await assert.rejects(()=>fetchTrustSource({TRUST_CACHE:kv()},link,{fetcher:async u=>String(u).endsWith('robots.txt')?response('User-agent: *\nDisallow: /meta','text/plain'):response('{}')}),/ROBOTS_DISALLOWS/);
});
class D1{
 constructor(){this.sqlite=new DatabaseSync(':memory:');for(const f of ['0001_core.sql','0003_platform.sql','0010_discovery_automation.sql','0011_source_trust.sql'])this.sqlite.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));}
 prepare(query){const s=this.sqlite.prepare(query);let values=[];const handle={bind(...v){values=v;return handle;},first(){return s.get(...values)||null;},all(){return {results:s.all(...values)};},run(){return {meta:{changes:Number(s.run(...values).changes)}};}};return handle;}
}
test('migration retains legacy campaign and Discovery schema',()=>{
 const db=new D1();
 db.prepare("INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES('legacy','{}','https://museum.org','confirmed')").run();
 assert.equal(db.prepare("SELECT id FROM am_core_exhibits WHERE id='legacy'").first().id,'legacy');
 assert.ok(db.prepare('SELECT version FROM am_core_schema WHERE version=6').first());
 assert.ok(db.prepare('SELECT version FROM am_core_schema WHERE version=7').first());
 assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='trust_audit_log'").first());
});
test('verification lifecycle, idempotency, new material alert, unchanged registry',async()=>{
 const db=new D1(),cache=kv(),now=Date.parse('2026-10-28T12:00:00Z');
 db.prepare("INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES('c1','{\"project_name\":\"Original\",\"status\":\"confirmed\"}','https://museum.org','confirmed')").run();
 db.prepare("INSERT INTO am_users(id,username) VALUES('tg:123','Admin')").run();
 db.prepare("INSERT INTO am_delivery_preferences(user_id,telegram,telegram_chat) VALUES('tg:123',1,'123')").run();
 for(const [id,path] of [['s1','one'],['s2','two']]){
  db.prepare('INSERT INTO source_trust_profiles(id,source_url,host) VALUES(?,?,?)').bind(id,'https://museum.org/'+path,'museum.org').run();
  db.prepare('INSERT INTO campaign_source_links(id,campaign_id,source_id,source_url,registered_by,official_domain_verified) VALUES(?,?,?,?,?,1)').bind(id+'-link','c1',id,'https://museum.org/'+path,'tg:123').run();
 }
 let changed=false;
 const fetcher=async url=>String(url).endsWith('robots.txt')?new Response(null,{status:404}):response(JSON.stringify({fields:{chain:changed&&String(url).endsWith('/two')?'Arbitrum':'Base',claim_deadline_at:'2026-11-01'}}));
 const env={DB:db,TRUST_CACHE:cache,MODERATOR_IDS:'tg:123',TRUST_PUBLIC_ORIGIN:'https://museum.org'};
 const one=await verifyCampaign(env,'c1',{now,fetcher,actor:'tg:123'});
 assert.equal(one.status,'complete');assert.equal(one.confidence_label,'high_confidence');assert.equal(one.open_conflicts,0);
 const repeated=await verifyCampaign(env,'c1',{now,fetcher,actor:'tg:123'});
 assert.equal(repeated.id,one.id);assert.equal(repeated.idempotent,true);
 changed=true;const two=await verifyCampaign(env,'c1',{now:now+7*3600000,fetcher,actor:'tg:123'});
 assert.equal(two.status,'complete');assert.equal(two.open_conflicts,1);
 assert.equal(db.prepare('SELECT severity FROM source_conflicts').first().severity,'material');
 assert.ok(db.prepare("SELECT COUNT(*) AS n FROM trust_audit_log").first().n>=4);
 assert.ok(db.prepare("SELECT COUNT(*) AS n FROM am_notifications WHERE type='source-verification'").first().n>=1);
 assert.equal(db.prepare("SELECT payload FROM am_core_exhibits WHERE id='c1'").first().payload,'{"project_name":"Original","status":"confirmed"}');
});

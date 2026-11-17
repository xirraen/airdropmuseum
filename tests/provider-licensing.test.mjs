import test from 'node:test';
import assert from 'node:assert/strict';
import {CRYPTORANK_SOURCE_URL,validateSource} from '../src/discovery/types.ts';
import {requireProviderRights,parseCryptoRankActivities} from '../src/discovery/providerAdapters.ts';
import {fetchDiscoverySource,download} from '../src/discovery/ingestService.ts';
import {previewDiscoverySource} from '../src/discovery/previewService.ts';

const cryptoSource={id:'crypto-source',source_type:'json_feed',feed_url:CRYPTORANK_SOURCE_URL,enabled:1};
const cryptoEnv={CRYPTORANK_API_KEY:'unit-test-key',CRYPTORANK_API_LICENSED:'YES'};
const apiPayload={status:{usedCredits:1},data:[
 {id:1309,key:'note-systems',coin:{name:'Note Systems'},status:'POTENTIAL',reward:'points',lastStatusUpdate:1794873600},
 {id:539,key:'rome-protocol',coin:{name:'Rome Protocol'},status:'CONFIRMED',reward:'airdrop',lastStatusUpdate:1794873600}
]};

test('official provider endpoint cannot be redirected to another host',()=>{
 assert.equal(validateSource({name:'CryptoRank licensed',...cryptoSource,enabled:false}).enabled,0);
 assert.throws(()=>validateSource({name:'Bad',source_type:'json_feed',feed_url:'https://api.cryptorank.io/v2/drophunting/activities?limit=200'}),/INVALID_PROVIDER_ENDPOINT/);
 assert.throws(()=>validateSource({name:'Bad',source_type:'rss',feed_url:CRYPTORANK_SOURCE_URL}),/INVALID_PROVIDER_ENDPOINT/);
});

test('CryptoRank requests require both licensed use and server-only key',()=>{
 assert.throws(()=>requireProviderRights(cryptoSource,{}),/PROVIDER_LICENSE_REQUIRED/);
 assert.throws(()=>requireProviderRights(cryptoSource,{CRYPTORANK_API_LICENSED:'YES'}),/PROVIDER_KEY_REQUIRED/);
 assert.equal(requireProviderRights(cryptoSource,cryptoEnv),'cryptorank');
});

test('Airdrops.io feed requires explicit license, never crawls arbitrary pages',()=>{
 const row={source_type:'rss',feed_url:'https://airdrops.io/feed/'};
 assert.throws(()=>requireProviderRights(row,{}),/PROVIDER_LICENSE_REQUIRED/);
 assert.equal(requireProviderRights(row,{AIRDROPS_IO_LICENSED:'YES'}),'airdrops_io');
 assert.throws(()=>requireProviderRights({...row,feed_url:'https://airdrops.io/latest-airdrops/'},{AIRDROPS_IO_LICENSED:'YES'}),/PROVIDER_FEED_URL_UNAPPROVED/);
 assert.throws(()=>requireProviderRights({...row,feed_url:'https://cryptorank.io/drophunting'},{}),/PROVIDER_API_REQUIRED/);
});

test('licensed provider metadata is bounded, linked and never marked confirmed',()=>{
 const rows=parseCryptoRankActivities(JSON.stringify(apiPayload));
 assert.equal(rows.length,2);
 assert.equal(rows[0].external_id,'cryptorank-v2:1309');
 assert.equal(rows[0].url,'https://cryptorank.io/drophunting/note-systems-activity1309');
 assert.match(rows[0].summary,/Not independently confirmed/);
 assert.doesNotMatch(JSON.stringify(rows),/usedCredits|unit-test-key/);
 assert.throws(()=>parseCryptoRankActivities('{"data":{}}'),/INVALID_PROVIDER_RESPONSE/);
 assert.throws(()=>parseCryptoRankActivities(JSON.stringify({data:[{id:1,key:'../path',coin:{name:'Unsafe'}}]})),/PROVIDER_SCHEMA_UNSUPPORTED/);
});

test('preview with no license has no network traffic and no credential disclosure',async()=>{
 let called=0;
 await assert.rejects(previewDiscoverySource(cryptoSource,{fetcher:async()=>{called++;throw Error('should not fetch');}}),/PROVIDER_LICENSE_REQUIRED/);
 assert.equal(called,0);
 const result=await previewDiscoverySource(cryptoSource,{env:cryptoEnv,fetcher:async(url,init)=>{
  assert.equal(url,CRYPTORANK_SOURCE_URL);
  assert.equal(init.headers['X-Api-Key'],'unit-test-key');
  assert.equal(init.redirect,'error');
  assert.equal(init.cache,'no-store');
  return new Response(JSON.stringify(apiPayload),{status:200});
 }});
 assert.equal(result.total_sampled,2);
 assert.equal(result.items.length,2);
 assert.match(result.warning,/Verifikasi sumber/);
 assert.doesNotMatch(JSON.stringify(result),/unit-test-key/);
});

test('licensed CryptoRank results enter the private queue only, never campaign publication',async()=>{
 const queue=[],changes=[];
 const env={...cryptoEnv,DISCOVERY_QUEUE:{async sendBatch(items){queue.push(...items);}},
  DB:{prepare(sql){return {bind(...args){this.args=args;return this;},
    async first(){if(sql.includes('SELECT feed_url,source_type,enabled'))return {feed_url:cryptoSource.feed_url,source_type:cryptoSource.source_type,enabled:1};return null;},
    async run(){changes.push(sql);return {meta:{changes:1}};}};}}};
 const result=await fetchDiscoverySource(env,cryptoSource,{fetcher:async()=>new Response(JSON.stringify(apiPayload),{status:200})});
 assert.equal(result.queued,2);
 assert.equal(queue.length,2);
 assert.equal(queue[0].body.source_id,cryptoSource.id);
 assert.match(queue[0].body.source_version,/^[a-f0-9]{64}$/);
 assert.equal(queue[0].body.item.external_id,'cryptorank-v2:1309');
 assert.equal(changes.some(sql=>sql.includes('INSERT INTO campaigns')),false);
});

test('provider auth, quotas and invalid response fail closed without queued records',async()=>{
 const env={...cryptoEnv,DISCOVERY_QUEUE:{async sendBatch(){throw Error('unexpected queue');}},
  DB:{prepare(){return {bind(){return this;},async run(){return {meta:{changes:1}};}};}}};
 for(const [status,error] of [[401,'PROVIDER_AUTH_FAILED'],[429,'PROVIDER_RATE_LIMITED']]){
  const result=await fetchDiscoverySource(env,cryptoSource,{fetcher:async()=>new Response('',{status})});
  assert.equal(result.error,error);
  assert.equal(result.queued,0);
 }
});

test('permissioned RSS cannot silently redirect to other pages on the same site',async()=>{
 let n=0;
 await assert.rejects(download('https://airdrops.io/feed/',{},async()=>{
  n++;return new Response(null,{status:302,headers:{location:'https://airdrops.io/category/airdrop/'}});
 }),/FETCH_FAILED/);
 assert.equal(n,1);
});

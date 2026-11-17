import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOTDATA_EVENTS_URL,ROOTDATA_FUNDING_URL,DEFILLAMA_PROTOCOLS_URL,validateSource} from '../src/discovery/types.ts';
import {requireProviderRights,parseRootDataIncentiveEvents,parseRootDataFundingRounds,parseDefiLlamaProtocols,
 downloadRootData,downloadDefiLlama} from '../src/discovery/providerAdapters.ts';
import {fetchDiscoverySource} from '../src/discovery/ingestService.ts';
import {previewDiscoverySource} from '../src/discovery/previewService.ts';
import {classify} from '../src/discovery/classifier.ts';

const asSource=url=>({id:'research',name:'Research',source_type:'json_feed',feed_url:url,enabled:1});
const rootEnv={ROOTDATA_API_LICENSED:'YES',ROOTDATA_API_KEY:'test-key-not-real'};
const llamaEnv={DEFILLAMA_DATA_LICENSED:'YES'};
const rootEvent=JSON.stringify({result:200,data:{items:[
 {id:10001,project_id:8,type:21,name:'Example Network',description:'Incentive program',
  site_url:'https://example.org/blog/incentive',hap_date:'2026-11-10'}
]}});
const rootFunding=JSON.stringify({result:200,data:{items:[
 {id:500,project_id:10,name:'Example Protocol',rounds:'Seed',amount:5000000,
  source_url:'https://example.org/announcement',published_time:'2026-10',data_status:1}
]}});
const llamaProtocols=JSON.stringify([
 {id:'a',slug:'example-protocol',name:'Example Protocol',symbol:null,tvl:9000000,category:'Lending',chains:['Base']},
 {id:'b',slug:'has-token',name:'Has Token',symbol:'TKN',tvl:10000000},
 {id:'c',slug:'tiny',name:'Tiny',symbol:null,tvl:1000},
 {id:'d',slug:'invalid/path',name:'Invalid',symbol:null,tvl:12000000}
]);

test('fixed provider endpoints must use existing D1 json_feed type',()=>{
 for(const u of [ROOTDATA_EVENTS_URL,ROOTDATA_FUNDING_URL,DEFILLAMA_PROTOCOLS_URL]){
  assert.equal(validateSource({name:'Data provider',source_type:'json_feed',feed_url:u,enabled:false}).enabled,0);
  assert.throws(()=>validateSource({name:'Wrong parser',source_type:'rss',feed_url:u}),/INVALID_PROVIDER_ENDPOINT/);
 }
 assert.throws(()=>validateSource({name:'Other path',source_type:'json_feed',feed_url:'https://api.rootdata.com/open/any-path'}),/INVALID_PROVIDER_ENDPOINT/);
 assert.throws(()=>validateSource({name:'Other path',source_type:'json_feed',feed_url:'https://api.llama.fi/other'}),/INVALID_PROVIDER_ENDPOINT/);
});

test('RootData API requires a license and secret, DeFiLlama requires rights approval',()=>{
 assert.throws(()=>requireProviderRights(asSource(ROOTDATA_EVENTS_URL),{}),/PROVIDER_LICENSE_REQUIRED/);
 assert.throws(()=>requireProviderRights(asSource(ROOTDATA_FUNDING_URL),{ROOTDATA_API_LICENSED:'YES'}),/PROVIDER_KEY_REQUIRED/);
 assert.equal(requireProviderRights(asSource(ROOTDATA_EVENTS_URL),rootEnv),'rootdata');
 assert.equal(requireProviderRights(asSource(ROOTDATA_FUNDING_URL),rootEnv),'rootdata_funding');
 assert.throws(()=>requireProviderRights(asSource(DEFILLAMA_PROTOCOLS_URL),{}),/PROVIDER_LICENSE_REQUIRED/);
 assert.equal(requireProviderRights(asSource(DEFILLAMA_PROTOCOLS_URL),llamaEnv),'defillama');
});

test('RootData incentive event and financing produce evidence-only pending candidates',()=>{
 const event=parseRootDataIncentiveEvents(rootEvent);
 assert.equal(event.length,1);
 assert.equal(event[0].external_id,'rootdata-event:10001');
 assert.equal(event[0].url,'https://example.org/blog/incentive');
 assert.match(event[0].summary,/not proof/i);
 const funding=parseRootDataFundingRounds(rootFunding);
 assert.equal(funding.length,1);
 assert.equal(funding[0].external_id,'rootdata-funding:500');
 assert.match(funding[0].title,/Seed funding/i);
 assert.match(funding[0].summary,/does NOT imply future token issuance/);
 assert.equal(classify(funding[0]).classification,'unknown');
 assert.equal(classify(event[0]).classification,'unknown');
 assert.throws(()=>parseRootDataFundingRounds(JSON.stringify({result:403,data:{}})),/INVALID_PROVIDER_RESPONSE/);
 assert.deepEqual(parseRootDataFundingRounds(JSON.stringify({result:200,data:{items:[{id:1,name:'Unsafe',source_url:'javascript:alert(1)'}]}})),[]);
});

test('DeFiLlama TVL only yields unconfirmed candidate metadata and never token eligibility',()=>{
 const items=parseDefiLlamaProtocols(llamaProtocols);
 assert.equal(items.length,1);
 assert.equal(items[0].external_id,'defillama:example-protocol');
 assert.equal(items[0].url,'https://defillama.com/protocol/example-protocol');
 assert.match(items[0].summary,/token issuance and distribution status UNVERIFIED/);
 assert.equal(classify(items[0]).classification,'unknown');
 assert.equal(items[0].published_at,null);
 assert.throws(()=>parseDefiLlamaProtocols('{"data":[]}'),/INVALID_PROVIDER_RESPONSE/);
});

test('RootData POST authenticates in the header and has a bounded credit-spend body',async()=>{
 const result=await downloadRootData(ROOTDATA_FUNDING_URL,rootEnv,async(url,init)=>{
  assert.equal(url,ROOTDATA_FUNDING_URL);
  assert.equal(init.method,'POST');
  assert.equal(init.headers.apikey,'test-key-not-real');
  assert.equal(init.redirect,'error');
  assert.deepEqual(JSON.parse(init.body),{page:1,page_size:10});
  return new Response(rootFunding);
 });
 assert.equal(result.status,200);
 await downloadRootData(ROOTDATA_EVENTS_URL,rootEnv,async(_,init)=>{
  assert.deepEqual(JSON.parse(init.body),{page:1,page_size:10,type:21});
  return new Response(rootEvent);
 });
});

test('DeFiLlama read never sends cookies or secret headers',async()=>{
 await downloadDefiLlama(DEFILLAMA_PROTOCOLS_URL,async(url,init)=>{
  assert.equal(url,DEFILLAMA_PROTOCOLS_URL);
  assert.deepEqual(init.headers,{Accept:'application/json'});
  assert.equal(init.redirect,'error');
  return new Response(llamaProtocols);
 });
});

test('preview is read-only, respects permissions and returns sanitized provider signals',async()=>{
 let called=0;
 await assert.rejects(previewDiscoverySource(asSource(ROOTDATA_EVENTS_URL),{
  fetcher:async()=>{called++;throw Error('no fetch without license')}
 }),/PROVIDER_LICENSE_REQUIRED/);
 assert.equal(called,0);
 const result=await previewDiscoverySource(asSource(ROOTDATA_EVENTS_URL),{
  env:rootEnv,fetcher:async()=>new Response(rootEvent)
 });
 assert.equal(result.items.length,1);
 assert.match(result.warning,/belum membuktikan/i);
 assert.doesNotMatch(JSON.stringify(result),/test-key-not-real/);
});

test('provider collection enqueues only short private metadata and never writes campaigns',async()=>{
 const queued=[],sqlWrites=[];
 const env={...rootEnv,DISCOVERY_QUEUE:{async sendBatch(messages){queued.push(...messages);}},
  DB:{prepare(sql){return {bind(){return this;},
   async first(){return {feed_url:ROOTDATA_EVENTS_URL,source_type:'json_feed',enabled:1};},
   async run(){sqlWrites.push(sql);return {meta:{changes:1}};}};}}};
 const result=await fetchDiscoverySource(env,asSource(ROOTDATA_EVENTS_URL),{fetcher:async()=>new Response(rootEvent)});
 assert.equal(result.queued,1);
 assert.equal(queued.length,1);
 assert.match(queued[0].body.source_version,/^[0-9a-f]{64}$/);
 assert.equal(sqlWrites.some(s=>/INSERT INTO campaigns|INSERT INTO am_core_exhibits/i.test(s)),false);
});

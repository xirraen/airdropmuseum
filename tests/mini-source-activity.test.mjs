import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceActivity,monitorOfficialSources} from '../mini/source-activity.mjs';

function fakeDb(){
 const cursors=new Map(),records=[],campaigns=[{
  id:'alpha',status:'rumored',risk_flags:'[]',
  official_urls:JSON.stringify(['https://docs.example.org/research'])
 }];
 const make=(sql,args=[])=>({
  bind(...bindArgs){return make(sql,bindArgs)},
  async all(){
   if(sql.includes('FROM campaigns WHERE'))return {results:campaigns};
   if(sql.includes('FROM campaign_sources s'))return {results:records.map(x=>({...x,campaign_name:'Alpha',campaign_status:'rumored'}))};
   throw Error('UNEXPECTED_SQL_ALL: '+sql);
  },
  async first(){
   if(sql.includes('FROM aggregator_cursor'))return cursors.has(args[0]||'source-monitor-offset')?
    {value:cursors.get(args[0]||'source-monitor-offset')}:null;
   throw Error('UNEXPECTED_SQL_FIRST: '+sql);
  },
  async run(){
   if(sql.includes('INSERT INTO campaign_sources')){
    records.push({id:args[0],campaign_id:args[1],source_url:args[2],source_type:args[3],
     captured_at:args[4],note:args[5],verified_by:args[6],event_type:args[7]});
   }else if(sql.includes('INTO aggregator_cursor')){
    if(sql.includes("'source-monitor-offset'"))cursors.set('source-monitor-offset',args[0]);
    else cursors.set(args[0],args[1]);
   }else if(sql.startsWith('UPDATE campaigns SET')){
    campaigns[0].risk_flags=args[0];
   }else throw Error('UNEXPECTED_SQL_RUN: '+sql);
   return {meta:{changes:1}};
  }
 });
 return {db:{prepare:sql=>make(sql),async batch(stmts){for(const x of stmts)await x.run();}},cursors,records,campaigns};
}
test('public activity maps source-change and outage without inventing eligibility',async()=>{
 const result=await sourceActivity({prepare:()=>({all:async()=>({results:[
  {id:'1',campaign_id:'alpha',campaign_name:'Alpha',source_url:'https://docs.example.org/',source_type:'official_docs',captured_at:'2026-11-18T00:00:00Z',event_type:'source_changed'},
  {id:'2',campaign_id:'beta',campaign_name:'Beta',source_url:'https://docs.example.org/',source_type:'official_docs',captured_at:'2026-11-17T00:00:00Z',event_type:'source_unavailable'},
  {id:'3',campaign_id:'gamma',campaign_name:'Gamma',source_url:'javascript:alert(1)',source_type:'official_docs',captured_at:'2026-11-16T00:00:00Z',event_type:'source_changed'},
  {id:'4',campaign_id:'gamma',campaign_name:'Gamma',source_url:'https://docs.example.org/',source_type:'community',captured_at:'2026-11-16T00:00:00Z',event_type:'source_changed'}
 ]})})});
 assert.equal(result.events.length,2);
 assert.equal(result.events[0].type,'changed');
 assert.equal(result.events[0].campaignId,'campaign-alpha');
 assert.match(result.events[0].description,/belum diverifikasi/i);
 assert.equal(result.events[1].type,'unavailable');
 assert.match(result.events[1].description,/gagal diakses berulang kali/i);
});
test('scheduled official source monitoring honors opt-in and host allowlist',async()=>{
 const {db}=fakeDb();let requests=0;
 const fetcher=async()=>{requests++;return new Response('x'.repeat(160),{headers:{'Content-Type':'text/html'}})};
 assert.deepEqual(await monitorOfficialSources({DB:db,AGGREGATOR_MONITOR_SOURCES:'0',AGGREGATOR_ALLOWED_HOSTS:'docs.example.org'},fetcher),{checked:0,changed:0,unavailable:0});
 assert.deepEqual(await monitorOfficialSources({DB:db,AGGREGATOR_MONITOR_SOURCES:'1',AGGREGATOR_ALLOWED_HOSTS:'unrelated.example'},fetcher),{checked:0,changed:0,unavailable:0});
 assert.equal(requests,0);
});
test('fingerprint monitor records baseline then changed source without claiming eligibility',async()=>{
 const {db,records,campaigns}=fakeDb();
 let content='Initial real official documentation text goes here. '.repeat(6);
 const fetcher=async()=>new Response(content,{headers:{'content-type':'text/html'}});
 const env={DB:db,AGGREGATOR_MONITOR_SOURCES:'1',AGGREGATOR_ALLOWED_HOSTS:'docs.example.org'};
 const a=await monitorOfficialSources(env,fetcher);
 assert.equal(a.checked,1);assert.equal(a.changed,0);
 assert.equal(records[0].event_type,'source_baseline');
 content='Material official documentation content has changed. '.repeat(7);
 const b=await monitorOfficialSources(env,fetcher);
 assert.equal(b.checked,1);assert.equal(b.changed,1);
 assert.equal(records[1].event_type,'source_changed');
 assert.match(campaigns[0].risk_flags,/source_changed_review_required/);
 const c=await monitorOfficialSources(env,fetcher);
 assert.equal(c.changed,0);
 assert.equal(records.length,2);
});
test('single transient outage is quiet; repeated failure recorded once; recovery recorded once',async()=>{
 const {db,records}=fakeDb();
 const env={DB:db,AGGREGATOR_MONITOR_SOURCES:'1',AGGREGATOR_ALLOWED_HOSTS:'docs.example.org'};
 let failed=true;
 const fetcher=async()=>{if(failed)throw Error('Unavailable');return new Response('Recovered official documentation '.repeat(12),{headers:{'content-type':'text/html'}})};
 const a=await monitorOfficialSources(env,fetcher);
 assert.equal(a.unavailable,1);assert.equal(records.length,0,'One transient failure cannot become an outage event');
 const b=await monitorOfficialSources(env,fetcher);
 assert.equal(b.unavailable,1);assert.equal(records.length,1);
 assert.equal(records[0].event_type,'source_unavailable');
 await monitorOfficialSources(env,fetcher);
 assert.equal(records.length,1,'Repeated failures are not spammed daily');
 failed=false;
 await monitorOfficialSources(env,fetcher);
 assert.equal(records.filter(e=>e.event_type==='source_restored').length,1);
 assert.equal(records.filter(e=>e.event_type==='source_baseline').length,1);
 await monitorOfficialSources(env,fetcher);
 assert.equal(records.filter(e=>e.event_type==='source_restored').length,1);
 const activity=await sourceActivity(db);
 assert.equal(activity.events.find(e=>e.type==='restored')?.description.includes('kembali dapat dibaca'),true);
});
test('an allowlisted HTTPS redirect is followed and establishes a fingerprint',async()=>{
 const {db,records}=fakeDb();
 const env={DB:db,AGGREGATOR_MONITOR_SOURCES:'1',AGGREGATOR_ALLOWED_HOSTS:'docs.example.org'};
 const requested=[];
 const fetcher=async(url,options)=>{
  requested.push({url,redirect:options.redirect});
  return requested.length===1?
   new Response(null,{status:302,headers:{location:'/latest'}}):
   new Response('Verified documentation content '.repeat(12),{headers:{'content-type':'text/html'}});
 };
 const result=await monitorOfficialSources(env,fetcher);
 assert.equal(result.checked,1);
 assert.deepEqual(requested.map(x=>x.url),['https://docs.example.org/research','https://docs.example.org/latest']);
 assert.ok(requested.every(x=>x.redirect==='manual'));
 assert.equal(records[0].event_type,'source_baseline');
});
test('redirects to nonallowlisted, IP, and custom-port hosts are never fetched',async()=>{
 for(const destination of ['https://attacker.example/','http://docs.example.org/',
  'https://127.0.0.1/private','https://docs.example.org:444/private',
  'https://user:password@docs.example.org/private']){
  const {db,records}=fakeDb();
  const env={DB:db,AGGREGATOR_MONITOR_SOURCES:'1',AGGREGATOR_ALLOWED_HOSTS:'docs.example.org'};
  const seen=[];
  const fetcher=async url=>{
   seen.push(url);
   return new Response(null,{status:302,headers:{location:destination}});
  };
  await monitorOfficialSources(env,fetcher);
  await monitorOfficialSources(env,fetcher);
  assert.deepEqual(seen,['https://docs.example.org/research','https://docs.example.org/research'],destination);
  assert.equal(records.length,1,destination);
  assert.equal(records[0].event_type,'source_unavailable');
 }
});
test('a source that resumes after a failed probe but before the second has no outage event',async()=>{
 const {db,records}=fakeDb();
 const env={DB:db,AGGREGATOR_MONITOR_SOURCES:'1',AGGREGATOR_ALLOWED_HOSTS:'docs.example.org'};
 await monitorOfficialSources(env,async()=>{throw Error('temporary')});
 await monitorOfficialSources(env,async()=>new Response('Readable official article '.repeat(15),{headers:{'content-type':'text/html'}}));
 assert.equal(records.some(e=>e.event_type==='source_unavailable'||e.event_type==='source_restored'),false);
 assert.equal(records[0].event_type,'source_baseline');
});

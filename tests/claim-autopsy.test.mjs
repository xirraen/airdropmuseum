import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {digest} from '../src/platform-api.mjs';
import {autopsyRoutes} from '../src/autopsy/routes.ts';
import {appendEvent} from '../src/autopsy/eventStore.ts';
import {rebuild,replay,readEvents} from '../src/autopsy/projectionService.ts';
import {cohorts,MIN_COHORT} from '../src/autopsy/patternService.ts';
import {decisionBody,cutoff} from '../src/autopsy/types.ts';
class D1 {
 constructor(){
  this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0001_core.sql','0003_platform.sql','0010_discovery_automation.sql','0011_source_trust.sql','0012_public_api.sql','0013_admin_operations.sql','0014_claim_autopsy.sql'])
   this.sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 }
 prepare(sql){const stmt=this.sqlite.prepare(sql);let params=[];const q={bind(...args){params=args;return q;},
  async first(){return stmt.get(...params)||null;},async all(){return {results:stmt.all(...params)};},
  async run(){return {meta:{changes:Number(stmt.run(...params).changes)}};}};return q;}
 async batch(queries){
  this.sqlite.exec('BEGIN IMMEDIATE');try{const result=[];for(const q of queries)result.push(await q.run());this.sqlite.exec('COMMIT');return result;}
  catch(error){this.sqlite.exec('ROLLBACK');throw error;}
 }
}
const origin='https://museum.example.org',cookieA='a'.repeat(64),cookieB='b'.repeat(64);
const req=(path,cookie,method='GET',data,extra={})=>new Request(origin+path,{method,
 headers:{...(cookie?{Cookie:'am_session='+cookie}:{}),...(data===undefined?{}:{Origin:origin,'Content-Type':'application/json'}),...extra},
 ...(data===undefined?{}:{body:JSON.stringify(data)})});
const api=(e,path,cookie=cookieA,method='GET',data,extra={})=>autopsyRoutes(req(path,cookie,method,data,extra),e);
const now=()=>new Date().toISOString();
const decision={campaign_id:'ended',reason:'Dokumen resmi menjelaskan periode',primary_evidence_url:'https://official.example.org/info?access_token=secret',
 decision_source:'official',time_budget_minutes:60,cost_ceiling_usd:5,realistic_expectations:'Tidak ada jaminan alokasi'};
async function fixture(){
 const DB=new D1();
 for(const [id,cookie] of [['tg:alice',cookieA],['tg:bob',cookieB]]){
  await DB.prepare('INSERT INTO am_users(id,username) VALUES(?,?)').bind(id,id).run();
  await DB.prepare('INSERT INTO am_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(cookie),id,Math.floor(Date.now()/1000)+3600).run();
 }
 for(const [id,status,visibility,verified] of [['ended','ended','public',true],['future','active','public',true],['hidden','ended','private',true],['draft','ended','public',false]]){
  await DB.prepare('INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES(?,?,?,?)')
   .bind(id,JSON.stringify({slug:id,name:id,status,visibility,claim_deadline_at:status==='ended'?'2026-01-01T00:00:00Z':'2030-01-01T00:00:00Z'}),'https://official.example.org/info',id==='draft'?'draft':'confirmed').run();
  if(verified)await DB.prepare("INSERT INTO verification_runs(id,run_key,campaign_id,trigger_type,status,started_at,finished_at,confidence_label) VALUES(?,?,?,'manual','complete',?,?,?)")
   .bind('v:'+id,'run:'+id,id,'2026-10-28T00:00:00Z','2026-10-28T00:00:00Z','needs_review').run();
 }
 return {DB};
}
async function create(e,cookie=cookieA,extra={}){
 const r=await api(e,'/api/autopsy/decisions',cookie,'POST',{...decision,expected_version:0,knowledge_cutoff_at:now(),...extra});
 return {status:r.status,data:await r.json()};
}
async function call(e,id,op,data,cookie=cookieA){
 const r=await api(e,'/api/autopsy/'+id+'/'+op,cookie,'POST',{knowledge_cutoff_at:now(),...data});
 return {status:r.status,data:await r.json()};
}
test('0014 adds event and projection tables, preserves original campaign and admin schema',async()=>{
 const e=await fixture();for(const name of ['autopsy_events','claim_autopsies','decision_entries','evidence_items','pattern_snapshots','admin_users','verification_runs']){
  assert.ok(await e.DB.prepare('SELECT name FROM sqlite_master WHERE name=?').bind(name).first(),name);
 }assert.equal((await e.DB.prepare('SELECT version FROM am_core_schema WHERE version=11').first()).version,11);
 assert.ok(await e.DB.prepare("SELECT id FROM am_core_exhibits WHERE id='ended'").first());
});
test('decision is event version 1 and every claim carries a real evidence reference',async()=>{
 const e=await fixture(),c=await create(e);assert.equal(c.status,201);assert.equal(c.data.version,1);
 const state=c.data.state;assert.equal(state.evidence.length,1);assert.equal(state.timeline[0].version,1);
 assert.equal(state.decision.primary_evidence_url,'https://official.example.org/info');
 assert.equal(state.timeline[0].evidence_refs[0],state.evidence[0].id);
 assert.equal((await create(e)).status,409);
});
test('event row rejects UPDATE DELETE and gaps; version conflict does not alter projection',async()=>{
 const e=await fixture(),c=await create(e),id=c.data.aggregate_id;
 const event=c.data.state.timeline[0];
 await assert.rejects(e.DB.prepare("UPDATE autopsy_events SET event_type='outcome_recorded' WHERE id=?").bind(event.id).run(),/EVENT_IMMUTABLE/);
 await assert.rejects(e.DB.prepare('DELETE FROM autopsy_events WHERE id=?').bind(event.id).run(),/EVENT_IMMUTABLE/);
 await assert.rejects(e.DB.prepare("INSERT INTO autopsy_events(id,user_scope,aggregate_id,campaign_id,event_version,event_type,knowledge_cutoff_at,evidence_refs,payload_json) VALUES(?,?,?,?,9,'hypothesis_updated',?,'[]','{}')")
 .bind(crypto.randomUUID(),'tg:alice',id,'ended',now()).run(),/VERSION_CONFLICT/);
 const bad=await call(e,id,'hypothesis',{expected_version:0,evidence_refs:[c.data.state.evidence[0].id],hypothesis:'outdated'});
 assert.equal(bad.status,409);assert.equal(bad.data.error,'VERSION_CONFLICT');
 assert.equal((await rebuild(e.DB,'tg:alice',id)).version,1);
});
test('activity and hypothesis replay deterministic before/after cutoff; citation is mandatory',async()=>{
 const e=await fixture(),c=await create(e),id=c.data.aggregate_id,ref=c.data.state.evidence[0].id;
 assert.equal((await call(e,id,'activity',{expected_version:1,phase:'before_snapshot',quest_count:4,chain_count:2,gas_cost_usd:1,bridge_cost_usd:0,research_minutes:30,evidence_refs:[]})).status,400);
 const a=await call(e,id,'activity',{expected_version:1,phase:'before_snapshot',quest_count:4,chain_count:2,gas_cost_usd:1,bridge_cost_usd:0,research_minutes:30,evidence_refs:[ref]});
 assert.equal(a.status,200);
 const h=await call(e,id,'hypothesis',{expected_version:2,hypothesis:'Kemungkinan aktivitas awal relevan',evidence_refs:[ref]});
 assert.equal(h.status,200);
 const events=await readEvents(e.DB,'tg:alice',id);assert.deepEqual(replay(events),await rebuild(e.DB,'tg:alice',id));
 assert.equal(replay(events).activities.length,1);assert.equal(replay(events).hypothesis,'Kemungkinan aktivitas awal relevan');
 assert.equal(replay(events).decision_cutoff_at,c.data.state.decision_cutoff_at);
});
test('compensating event reverses activity without deleting original event',async()=>{
 const e=await fixture(),c=await create(e),id=c.data.aggregate_id,ref=c.data.state.evidence[0].id;
 const a=await call(e,id,'activity',{expected_version:1,phase:'after_snapshot',quest_count:1,chain_count:1,gas_cost_usd:0,bridge_cost_usd:0,research_minutes:5,evidence_refs:[ref]});
 const eventId=a.data.state.timeline.at(-1).id;
 const undone=await call(e,id,'compensate',{expected_version:2,target_event_id:eventId,reason:'Pencatatan keliru'});
 assert.equal(undone.status,200);assert.equal(undone.data.state.activities.length,0);
 assert.equal(undone.data.state.timeline.length,3);assert.equal(undone.data.state.timeline[1].compensated,true);
 assert.equal((await e.DB.prepare('SELECT count(*) AS n FROM autopsy_events WHERE aggregate_id=?').bind(id).first()).n,3);
 assert.equal((await call(e,id,'compensate',{expected_version:3,target_event_id:eventId,reason:'Duplikat'})).status,409);
});
test('outcomes are gated by campaign end, revisions require reason, and knowledge cutoffs cannot regress',async()=>{
 const e=await fixture(),c=await create(e),id=c.data.aggregate_id,ref=c.data.state.evidence[0].id;
 const future=await create(e,cookieB,{campaign_id:'future'}),futureRef=future.data.state.evidence[0].id;
 assert.equal((await call(e,future.data.aggregate_id,'outcome',{expected_version:1,outcome:'allocated',evidence_refs:[futureRef]},cookieB)).status,409);
 const o=await call(e,id,'outcome',{expected_version:1,outcome:'unknown',evidence_refs:[ref]});
 assert.equal(o.status,200);assert.equal(o.data.state.outcome,'unknown');
 const missing=await call(e,id,'outcome',{expected_version:2,outcome:'allocated',evidence_refs:[ref]});assert.equal(missing.status,400);
 const rev=await call(e,id,'outcome',{expected_version:2,outcome:'allocated',revision_reason:'Sumber baru terbit',evidence_refs:[ref]});
 assert.equal(rev.status,200);
 assert.equal(rev.data.state.outcome,'allocated');assert.ok(rev.data.state.outcome_cutoff_at);
 const older=await api(e,'/api/autopsy/'+id+'/hypothesis',cookieA,'POST',{expected_version:3,knowledge_cutoff_at:'2026-01-01T00:00:00Z',
  hypothesis:'backdated',evidence_refs:[ref]});
 assert.equal(older.status,409);
});
test('finalization and opt-in are events, insight is generated without prediction',async()=>{
 const e=await fixture(),c=await create(e),id=c.data.aggregate_id,ref=c.data.state.evidence[0].id;
 await call(e,id,'outcome',{expected_version:1,outcome:'allocated',evidence_refs:[ref]});
 const opt=await call(e,id,'consent',{expected_version:2,enabled:true});assert.equal(opt.status,200);
 const fin=await call(e,id,'finalize',{expected_version:3,evidence_refs:[ref]});
 assert.equal(fin.status,200);assert.equal(fin.data.state.status,'finalized');
 assert.ok(fin.data.state.timeline.some(x=>x.type==='autopsy_finalized'));
 assert.ok(fin.data.state.timeline.some(x=>x.type==='insight_generated'));
 assert.equal(fin.data.state.insights[0].confidence_label,'insufficient_data');
 assert.equal((await e.DB.prepare('SELECT count(*) AS n FROM pattern_snapshots WHERE user_scope=?').bind('tg:alice').first()).n,1);
 assert.equal((await call(e,id,'hypothesis',{expected_version:fin.data.version,hypothesis:'late',evidence_refs:[ref]})).status,409);
});
test('thresholds: minimum five finalized consented autopsies and two known outcomes',()=>{
 const state=(i,outcome,consent=true)=>({aggregate_id:String(i),campaign_id:'c'+i,version:4,status:'finalized',
 analysis_consent:consent,decision:{decision_source:'official'},activities:[{phase:'before_snapshot',quest_count:4,chain_count:2,gas_cost_usd:1}],
 outcome,finalized_at:'2026-10-'+String(i+10)+'T00:00:00Z',created_at:'2026-10-01T00:00:00Z',hypothesis:'',evidence:[]});
 const few=cohorts(Array.from({length:4},(_,i)=>state(i,'allocated')));assert.equal(few.cohorts[0].confidence_label,'insufficient_data');
 const unknown=cohorts(Array.from({length:5},(_,i)=>state(i,i?'unknown':'allocated')));assert.equal(unknown.cohorts[0].confidence_label,'insufficient_data');
 const weak=cohorts(Array.from({length:5},(_,i)=>state(i,i<2?'allocated':'unknown')));assert.equal(weak.cohorts[0].confidence_label,'weak_pattern');
 const moderate=cohorts(Array.from({length:12},(_,i)=>state(i,i<5?'allocated':'unknown')));assert.equal(moderate.cohorts[0].confidence_label,'moderate_pattern');
 assert.equal(cohorts(Array.from({length:12},(_,i)=>state(i,'allocated',false))).sample_size,0);
 assert.match(moderate.disclaimer,/bukan prediksi/);
});
test('privacy scope, private API, public evidence only, and old direct writes disabled',async()=>{
 const e=await fixture(),c=await create(e),id=c.data.aggregate_id;
 assert.equal((await api(e,'/api/autopsy/'+id,cookieB)).status,404);
 assert.equal((await api(e,'/api/autopsy/'+id,null)).status,401);
 assert.equal((await api(e,'/api/autopsy/decisions',cookieB).then(r=>r.json())).items.length,0);
 assert.equal((await api(e,'/api/autopsy/decisions',cookieA,'POST',{...decision,expected_version:0,knowledge_cutoff_at:now()},{Origin:'https://evil.example'})).status,403);
 assert.equal((await api(e,'/api/autopsy',cookieA,'POST',decision)).status,410);
 assert.equal((await api(e,'/api/autopsy/evidence-card/hidden',null)).status,404);
 const card=await api(e,'/api/autopsy/evidence-card/ended',null);assert.equal(card.status,200);
 const text=await card.text();assert.ok(!text.includes(id));assert.ok(!text.includes('tg:alice'));assert.ok(!text.includes('cost_ceiling_usd'));
});
test('strict HTTPS evidence and version/cutoff validation',async()=>{
 assert.throws(()=>decisionBody({...decision,primary_evidence_url:'http://bad.example/path'}),/INVALID_HTTPS_URL/);
 assert.throws(()=>cutoff('2026-01-01'),/KNOWLEDGE_CUTOFF_REQUIRED/);
 const e=await fixture(),c=await create(e),id=c.data.aggregate_id;
 assert.equal((await call(e,id,'evidence',{expected_version:1,kind:'official_link',value:'https://localhost/admin'})).status,400);
 assert.equal((await call(e,id,'evidence',{expected_version:1,kind:'tx_hash',value:'0x1234'})).status,400);
 const good=await call(e,id,'evidence',{expected_version:1,kind:'screenshot',value:'https://evidence.example.org/image.png?token=erase'});
 assert.equal(good.status,200);assert.equal(good.data.state.evidence[1].value,'https://evidence.example.org/image.png');
});

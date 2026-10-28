import {appendEvent} from '../src/autopsy/eventStore.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {seedDecision} from '../test-support/auth.mjs';
import {putCampaign} from '../src/aggregator-store.mjs';
import {reconcile,readEvents} from '../src/autopsy/projectionService.ts';
const input={slug:'demo',name:'Demo',project_id:'d',chain:['eip155:1'],category:'testnet',status:'confirmed',official_urls:['https://official.example.org'],eligibility_rules:[],source_evidence:[{source_url:'https://official.example.org',source_type:'official_docs',captured_at:new Date().toISOString(),verified_by:'system',note:'Official source'}]};
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+file,'utf8'));return {sql,prepare(query){const s=sql.prepare(query);let v=[];const q={bind(...x){v=x;return q},async first(){return s.get(...v)||null},async all(){return {results:s.all(...v)}},async run(){return {meta:{changes:Number(s.run(...v).changes)}}}};return q},async batch(stmts){sql.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};}
test('repair reconstructs missing projections while preserving the event source byte-for-byte',async()=>{
 const db=database();await putCampaign(db,input);const result=await seedDecision(db);const id=result.state.aggregate_id;
 const before=await readEvents(db,'tg:42',id);
 db.sql.prepare('DELETE FROM claim_autopsies WHERE aggregate_id=?').run(id);
 await reconcile(db,'tg:42',id);
 assert.equal(db.sql.prepare('SELECT version FROM claim_autopsies WHERE aggregate_id=?').get(id).version,1);
 assert.equal(db.sql.prepare('SELECT reason FROM decision_entries WHERE aggregate_id=?').get(id).reason,result.state.decision.reason);
 assert.deepEqual(await readEvents(db,'tg:42',id),before);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM autopsy_projection_rebuild_guards').get().n,0);
 assert.equal(await reconcile(db,'tg:43',id),null);db.sql.close();
});
test('repair corrects drift and registry updates preserve explicit publication',async()=>{
 const db=database();await putCampaign(db,input);const result=await seedDecision(db);const id=result.state.aggregate_id;
 db.sql.prepare("UPDATE decision_entries SET reason='Corrupted cache' WHERE aggregate_id=?").run(id);
 await reconcile(db,'tg:42',id);
 assert.equal(db.sql.prepare('SELECT reason FROM decision_entries WHERE aggregate_id=?').get(id).reason,result.state.decision.reason);
 db.sql.prepare("UPDATE am_core_exhibits SET payload=json_set(payload,'$.visibility','public') WHERE id='agg_demo'").run();
 await putCampaign(db,{...input,description:'Updated official description'});
 assert.equal(JSON.parse(db.sql.prepare("SELECT payload FROM am_core_exhibits WHERE id='agg_demo'").get().payload).visibility,'public');
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM campaign_registry_links').get().n,1);db.sql.close();
});

test('repair refuses stale replay when a real event commits before its D1 batch',async()=>{
 const db=database();await putCampaign(db,input);const created=await seedDecision(db);const id=created.state.aggregate_id;
 const original=db.batch.bind(db);let inject=true;
 db.batch=async statements=>{
  if(inject){inject=false;await appendEvent(db,{scope:'tg:42',aggregate_id:id,campaign_id:'agg_demo',event_type:'analysis_consent_changed',expected_version:1,knowledge_cutoff_at:new Date().toISOString(),evidence_refs:[],payload:{enabled:true}});}
  return original(statements);
 };
 await assert.rejects(()=>reconcile(db,'tg:42',id),/VERSION_CONFLICT/);
 assert.equal(db.sql.prepare('SELECT version FROM claim_autopsies WHERE aggregate_id=?').get(id).version,2);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM autopsy_events').get().n,2);
 assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM autopsy_projection_rebuild_guards').get().n,0);db.sql.close();
});

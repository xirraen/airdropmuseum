import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {putCampaign} from '../src/aggregator-store.mjs';
import {requireDecision,followCampaign,unfollowCampaign} from '../src/aggregator/decisionGuard.mjs';
import {createDecision} from '../src/autopsy/decisionService.ts';
import {appendEvent} from '../src/autopsy/eventStore.ts';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('migrations/'+f,'utf8'));
 return {sqlite,prepare(query){const st=sqlite.prepare(query);let args=[];const q={bind(...a){args=a;return q;},async first(){return st.get(...args)||null;},async all(){return {results:st.all(...args)};},async run(){return {meta:{changes:Number(st.run(...args).changes)}};}};return q;},async batch(queries){sqlite.exec('BEGIN');try{const out=[];for(const q of queries)out.push(await q.run());sqlite.exec('COMMIT');return out;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
}
const input=()=>({slug:'example',name:'Example',project_id:'example',chain:['eip155:1'],category:'testnet',status:'confirmed',official_urls:['https://official.example.org'],source_evidence:[{source_url:'https://official.example.org',source_type:'official_docs',captured_at:new Date().toISOString(),verified_by:'system',note:'Official documentation'}],eligibility_rules:[]});
test('registry bridge preserves legacy rows, defaults private, and requires own event-backed decision',async()=>{
 const db=fixture();
 db.sqlite.prepare("INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES('legacy','{}','https://official.example.org','confirmed')").run();
 await putCampaign(db,input());
 const canonical=db.sqlite.prepare("SELECT * FROM am_core_exhibits WHERE id='agg_example'").get();
 assert.equal(JSON.parse(canonical.payload).visibility,'private');
 assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM am_core_exhibits WHERE id='legacy'").get().n,1);
 await assert.rejects(()=>requireDecision(db,'tg:1','example'),/DECISION_REQUIRED/);
 db.sqlite.prepare("INSERT INTO am_users(id,username) VALUES('tg:1','One'),('tg:2','Two')").run();
 const created=await createDecision(db,'tg:1',{campaign_id:'agg_example',reason:'Review official source',primary_evidence_url:'https://official.example.org',decision_source:'official',time_budget_minutes:30,cost_ceiling_usd:0,realistic_expectations:'No guaranteed reward',expected_version:0,knowledge_cutoff_at:new Date().toISOString()});
 assert.equal(await requireDecision(db,'tg:1','example'),created.state.aggregate_id);
 await followCampaign(db,'tg:1','example');
 await followCampaign(db,'tg:1','example');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM user_campaign_subscriptions').get().n,1);
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM autopsy_events').get().n,2);
 await assert.rejects(()=>requireDecision(db,'tg:2','example'),/DECISION_REQUIRED/);
 await assert.rejects(()=>appendEvent(db,{scope:'tg:1',aggregate_id:created.state.aggregate_id,campaign_id:'agg_example',event_type:'event_compensated',expected_version:2,knowledge_cutoff_at:new Date().toISOString(),evidence_refs:[],payload:{target_event_id:created.id,reason:'Cancel decision'}}),/DECISION_COMPENSATION_REQUIRES_EMPTY_JOURNAL/);
 await unfollowCampaign(db,'tg:1','example');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM user_campaign_subscriptions').get().n,0);
 await followCampaign(db,'tg:1','example');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM user_campaign_subscriptions').get().n,1);
 assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
 db.sqlite.close();
});
test('registry namespace collision never overwrites existing records or links the wrong campaign',async()=>{
 const db=fixture();db.sqlite.prepare("INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES('agg_example','{\"name\":\"Historical\"}','https://official.example.org','confirmed')").run();
 await putCampaign(db,input());
 assert.equal(JSON.parse(db.sqlite.prepare("SELECT payload FROM am_core_exhibits WHERE id='agg_example'").get().payload).name,'Historical');
 assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM campaign_registry_links').get().n,0);
 await assert.rejects(()=>requireDecision(db,'tg:1','example'),/DECISION_REQUIRED/);db.sqlite.close();
});

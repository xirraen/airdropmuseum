import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {putCampaign} from '../src/aggregator-store.mjs';
import {questRoutes} from '../src/aggregator/questRoutes.mjs';
import {changeProgress,campaignProgress,createQuest,editQuest} from '../src/aggregator/questService.mjs';
import {streakFromDays,pointsSummary,ledger} from '../src/aggregator/pointsService.mjs';
import {priorityForQuest,nextActions} from '../src/aggregator/nextActionService.mjs';
import {questPayload,transition,eligibilityFromQuest,secureUrl} from '../src/aggregator/questTypes.mjs';
const bot='test-bot-secret',admin='test-admin-secret',scope='tg:42',official='https://official.example.org/docs',address='0x'+'1'.repeat(40);
const now=()=>Math.floor(Date.now()/1000);
function db(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0001_core','0002_rewards','0003_platform','0004_workbench','0005_aggregator_core','0008_quest_tracker'])
  sql.exec(readFileSync(new URL('../migrations/'+f+'.sql',import.meta.url),'utf8'));
 const DB={sql,prepare(query){let values=[],statement=sql.prepare(query);return {bind(...args){values=args;return this},async first(){return statement.get(...values)||null},async all(){return {results:statement.all(...values)}},async run(){return {meta:{changes:Number(statement.run(...values).changes)}}}}},async batch(stmts){sql.exec('BEGIN');try{const result=[];for(const st of stmts)result.push(await st.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 return DB;
}
async function campaign(DB){
 const stamp=new Date(Date.now()-60000).toISOString();
 return (await putCampaign(DB,{slug:'demo',name:'Campaign aman',project_id:'a',chain:['eip155:1'],category:'testnet',status:'confirmed',official_urls:[official],source_evidence:[{source_url:official,source_type:'official_docs',captured_at:stamp,verified_by:'system',note:'Dokumentasi'}],eligibility_rules:[{id:'onchain-rule',rule_type:'tx_count',parameters:{min:'1'}}]},'research')).campaign;
}
function auth(){
 const p=new URLSearchParams({auth_date:String(now()),user:JSON.stringify({id:42})}),message=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'='+b).join('\n');
 const secret=createHmac('sha256','WebAppData').update(bot).digest();
 p.set('hash',createHmac('sha256',secret).update(message).digest('hex'));return p.toString();
}
async function api(DB,path,data,method='GET',role='user'){
 const request=new Request('https://museum.example.org/api/aggregator'+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(role==='admin'?{Authorization:'Bearer '+admin}:role==='user'?{'X-Telegram-Init-Data':auth()}: {})},...(data?{body:JSON.stringify(data)}:{})});
 const r=await questRoutes(request,{DB,TELEGRAM_BOT_TOKEN:bot,AGGREGATOR_ADMIN_TOKEN:admin});
 return {status:r.status,data:await r.json()};
}
const payload=(method='admin_review',override={})=>({title:'Interaksi testnet',description:'Lihat panduan resmi',quest_type:'testnet_task',verification_method:method,points:15,weight:2,official_url:official,ends_at:now()+86400,...override});
test('migration 0008 is additive and protects unbound wallet NULL uniqueness',async()=>{
 const DB=db();DB.sql.prepare('INSERT INTO am_core_user_state(user_id,payload,revision) VALUES(?,?,1)').run('legacy','{}');
 assert.equal(DB.sql.prepare('SELECT version FROM am_core_schema WHERE version=8').get().version,8);
 await campaign(DB);const q=await createQuest(DB,'demo',payload());
 const query='INSERT INTO user_quest_progress(id,user_scope,quest_id,status,updated_at) VALUES(?,?,?,?,?)';
 DB.sql.prepare(query).run('a',scope,q.id,'todo',now());
 assert.throws(()=>DB.sql.prepare(query).run('b',scope,q.id,'todo',now()),/UNIQUE/);
 assert.equal(DB.sql.prepare('SELECT payload FROM am_core_user_state').get().payload,'{}');DB.sql.close();
});
test('quest CRUD is admin-only; public read omits user progress',async()=>{
 const DB=db();await campaign(DB);
 assert.equal((await api(DB,'/campaigns/demo/quests',payload(),'POST','anonymous')).status,403);
 const saved=await api(DB,'/campaigns/demo/quests',payload(),'POST','admin');
 assert.equal(saved.status,201);
 assert.equal((await api(DB,'/quests/'+saved.data.id,{title:'Changed'},'PUT','anonymous')).status,403);
 const edit=await api(DB,'/quests/'+saved.data.id,{title:'Changed'},'PUT','admin');assert.equal(edit.data.title,'Changed');
 const listing=await api(DB,'/campaigns/demo/quests',undefined,'GET','anonymous');assert.equal(listing.data.quests.length,1);
 const removed=await api(DB,'/quests/'+saved.data.id,undefined,'DELETE','admin');assert.equal(removed.data.deleted,true);DB.sql.close();
});
test('HTTPS URLs, enum values and bounds are checked',()=>{
 for(const url of ['http://example.org','https://127.0.0.1','https://user:pass@example.org','javascript:alert(1)'])assert.throws(()=>secureUrl(url));
 for(const patch of [{quest_type:'not_a_quest'},{verification_method:'auto_claim'},{points:-1},{title:'a'.repeat(161)},{official_url:'http://unsafe.example'},{weight:Infinity}])
  assert.throws(()=>questPayload(payload('manual',patch)));
 assert.equal(questPayload(payload()).quest_type,'testnet_task');
});
test('transitions honor each verification method and disallow manual verified',()=>{
 for(const method of ['manual','none','url_submission','wallet_activity','admin_review'])assert.throws(()=>transition('todo','verified',method));
 assert.equal(transition('todo','in_progress','manual'),true);
 assert.equal(transition('in_progress','submitted','none'),true);
 assert.equal(transition('todo','submitted','url_submission'),true);
 assert.throws(()=>transition('todo','in_progress','admin_review'));
 assert.throws(()=>transition('todo','submitted','wallet_activity'),/WALLET_VERIFICATION_REQUIRED/);
 assert.equal(transition('submitted','verified','admin_review','admin'),true);
 assert.equal(transition('todo','verified','wallet_activity','evaluator'),true);
 assert.throws(()=>transition('verified','todo','admin_review','user'));
});
test('verified points are idempotent, reversal preserves history and re-verification cannot exceed one balance',async()=>{
 const DB=db();await campaign(DB);
 const q=await createQuest(DB,'demo',payload('admin_review'));
 await changeProgress(DB,scope,q.id,{status:'submitted',evidence_url:official});
 await assert.rejects(()=>changeProgress(DB,scope,q.id,{status:'verified'}),/VERIFICATION_REQUIRED/);
 await changeProgress(DB,scope,q.id,{status:'verified'},'admin');
 await changeProgress(DB,scope,q.id,{status:'verified'},'admin');
 assert.equal((await pointsSummary(DB,scope)).points,15);
 let entries=await ledger(DB,scope);assert.equal(entries.items.length,1);
 await changeProgress(DB,scope,q.id,{status:'failed'},'admin');
 assert.equal((await pointsSummary(DB,scope)).points,0);
 entries=await ledger(DB,scope);assert.deepEqual(entries.items.map(x=>x.points).sort((a,b)=>a-b),[-15,15]);
 await changeProgress(DB,scope,q.id,{status:'submitted'});
 await changeProgress(DB,scope,q.id,{status:'verified'},'admin');
 assert.equal((await pointsSummary(DB,scope)).points,15);
 await assert.rejects(()=>editQuest(DB,q.id,{points:999}),/POINTS_LOCKED/);
 DB.sql.close();
});
test('URL submission requires evidence; user cannot verify; isolation enforced',async()=>{
 const DB=db();await campaign(DB);
 const q=await createQuest(DB,'demo',payload('url_submission'));
 await assert.rejects(()=>changeProgress(DB,scope,q.id,{status:'submitted'}),/EVIDENCE_REQUIRED/);
 const denied=await api(DB,'/quests/'+q.id+'/progress',{status:'verified'},'PUT');assert.equal(denied.status,403);
 const submitted=await api(DB,'/quests/'+q.id+'/evidence',{evidence_url:official},'POST');assert.equal(submitted.data.progress.status,'submitted');
 const other=await api(DB,'/campaigns/demo/progress',undefined,'GET','anonymous');assert.equal(other.status,401);
 assert.equal((await campaignProgress(DB,'demo','tg:99')).verified,0);
 await changeProgress(DB,scope,q.id,{status:'verified'},'admin');
 assert.equal((await campaignProgress(DB,'demo',scope)).verified,1);assert.equal((await campaignProgress(DB,'demo','tg:99')).verified,0);
 DB.sql.close();
});
test('wallet verification requires a persisted passed evaluator rule and official evidence',async()=>{
 const DB=db();await campaign(DB);
 const q=await createQuest(DB,'demo',payload('wallet_activity',{title:'On-chain',verification_rule_id:'onchain-rule'}));
 await assert.rejects(()=>changeProgress(DB,scope,q.id,{status:'verified',wallet_address:address},'evaluator'),/ONCHAIN_EVIDENCE_NOT_FOUND/);
 const wallet='wallet-test';DB.sql.prepare('INSERT INTO wallet_watchlist(id,user_id,chain,address,label,created_at) VALUES(?,?,?,?,?,?)').run(wallet,scope,'eip155:1',address,'',new Date().toISOString());
 DB.sql.prepare(`INSERT INTO eligibility_results(id,wallet_id,campaign_id,rule_id,rule_type,parameters,evaluation_status,evaluated_at,evidence_refs,human_reason) VALUES(?,?,?,?,?,?,?,?,?,?)`)
 .run('result-test',wallet,'demo','onchain-rule','tx_count','{}','passed',new Date().toISOString(),JSON.stringify([{source_url:official,source_type:'explorer'}]),'Bukti');
 const v=await changeProgress(DB,scope,q.id,{status:'verified',wallet_address:address},'evaluator');
 assert.equal(v.status,'verified');assert.equal((await campaignProgress(DB,'demo',scope)).verified,1);
 DB.sql.close();
});
test('streak uses user timezone, today/yesterday and 48-hour lapse',()=>{
 const d=Date.parse('2026-10-28T12:00:00Z')/1000;
 assert.equal(streakFromDays([d,d-86400],d*1000,'UTC'),2);
 assert.equal(streakFromDays([d-86400,d-172800],d*1000,'UTC'),2);
 assert.equal(streakFromDays([d-172800],d*1000,'UTC'),0);
});
test('Next Best Action excludes expired and verified, sorts by deadline and pages at max 100',async()=>{
 const DB=db();await campaign(DB);
 const a=await createQuest(DB,'demo',payload('manual',{ends_at:now()+3600,title:'Soon'}));
 await createQuest(DB,'demo',payload('manual',{ends_at:now()+86400,title:'Later'}));
 await createQuest(DB,'demo',payload('manual',{ends_at:now()-300,title:'Expired'}));
 const got=await nextActions(DB,scope);
 assert.equal(got.total,2);assert.equal(got.harus_segera[0].quest_title,'Soon');
 assert.equal(priorityForQuest({...a,estimated_effort:1,gas_cost_estimate:1},now()).group,'harus_segera');
 assert.equal((await nextActions(DB,scope,{limit:1,offset:1})).harus_segera.length,1);
 assert.equal((await api(DB,'/next-actions?limit=101',undefined,'GET')).status,400);
 DB.sql.close();
});
test('eligibility remains manual_check until verifiable evidence and mandatory method',()=>{
 const q={required:1,verification_method:'manual'};
 assert.equal(eligibilityFromQuest(q,{status:'verified',evidence_url:official}).evaluation_status,'manual_check');
 assert.equal(eligibilityFromQuest({...q,verification_method:'admin_review'},{status:'todo'}).evaluation_status,'manual_check');
 assert.equal(eligibilityFromQuest({...q,verification_method:'admin_review'},{status:'verified',evidence_url:official}).evaluation_status,'passed');
});
test('quest + ledger pagination honors limit and offset',async()=>{
 const DB=db();await campaign(DB);
 for(let i=0;i<6;i++)await createQuest(DB,'demo',payload('manual',{title:'Quest '+i}));
 const all=await api(DB,'/campaigns/demo/quests?limit=2&offset=2',undefined,'GET','anonymous');
 assert.equal(all.data.quests.length,2);assert.equal(all.data.total,6);
 assert.equal((await api(DB,'/campaigns/demo/quests?limit=101',undefined,'GET','anonymous')).status,400);
 DB.sql.close();
});

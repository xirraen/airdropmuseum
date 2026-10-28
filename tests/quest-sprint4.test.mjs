import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {putCampaign} from '../src/aggregator-store.mjs';
import {questRoutes} from '../src/quest-bundle.mjs';
import {transition,cleanQuest,httpsURL,escapeHTML,escapeMarkdown} from '../src/quest-policy-bundle.mjs';
import {streakFromVerified} from '../src/quest-points-bundle.mjs';
import {rankActions,scoreAction} from '../src/quest-actions-bundle.mjs';
const secret='test-telegram-token',source='https://official.example.org/docs',evidence='https://proof.example.org/tx',wallet='0x'+'1'.repeat(40);
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['0001_core','0002_rewards','0003_platform','0004_workbench','0005_aggregator_core','0008_quest_tracker'])sql.exec(readFileSync(new URL('../migrations/'+f+'.sql',import.meta.url),'utf8'));
 const DB={sql,prepare(q){let args=[];const st=sql.prepare(q);return {bind(...v){args=v;return this},async first(){return st.get(...args)||null},async all(){return {results:st.all(...args)}},async run(){return {meta:{changes:Number(st.run(...args).changes)}}}}},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 return DB;
}
async function setup(){
 const DB=database(),now=new Date().toISOString(),campaign={slug:'sprint4-demo',name:'Contoh pengujian',project_id:'test',chain:['eip155:1'],category:'points',status:'confirmed',official_urls:[source],description:'Contoh',eligibility_rules:[{id:'tx-count',rule_type:'tx_count',parameters:{min:'1'}}],source_evidence:[{source_url:source,source_type:'official_docs',captured_at:now,note:'Sumber resmi pengujian',verified_by:'system'}]};
 await putCampaign(DB,campaign);return {DB,env:{DB,TELEGRAM_BOT_TOKEN:secret,AGGREGATOR_ADMIN_TOKEN:'admin-only-token'}};
}
function auth(uid=42){const data=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:uid})}),check=[...data.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'='+b).join('\n'),key=createHmac('sha256','WebAppData').update(secret).digest();data.set('hash',createHmac('sha256',key).update(check).digest('hex'));return data.toString();}
async function call(env,path,{body,method='GET',uid,admin=false}={}){
 const req=new Request('https://museum.example.org/api/aggregator'+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(uid?{'X-Telegram-Init-Data':auth(uid)}:{}),...(admin?{Authorization:'Bearer admin-only-token'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const response=await questRoutes(req,env);return {status:response.status,data:await response.json()};
}
const quest=(extra={})=>({title:'Baca dokumentasi',description:'Teliti sumber dan verifikasi tugas',quest_type:'custom',verification_method:'admin_review',points:25,weight:2,official_url:source,required:1,rule_id:'tx-count',...extra});
async function add(env,body=quest()){const r=await call(env,'/campaigns/sprint4-demo/quests',{method:'POST',body,admin:true});assert.equal(r.status,201,JSON.stringify(r.data));return r.data.quest;}
test('migration additive, legacy table remains, and required indexes exist',()=>{
 const db=database();assert.equal(db.sql.prepare('SELECT version FROM am_core_schema WHERE version=8').get().version,8);
 assert.ok(db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='am_users'").get());
 for(const table of ['campaign_quests','user_quest_progress','user_points_ledger'])assert.ok(db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table));
 assert.ok(db.sql.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_quest_progress_scoped_unique'").get());db.sql.close();
});
test('admin creates quest, non-admin cannot write, enums HTTPS and official provenance checked',async()=>{
 const {DB,env}=await setup();
 assert.equal((await call(env,'/campaigns/sprint4-demo/quests',{method:'POST',body:quest(),uid:42})).status,403);
 const item=await add(env);assert.equal(item.points,25);
 for(const b of [quest({official_url:'http://official.example.org'}),quest({official_url:'https://evil.example.org/x'}),quest({quest_type:'faucet'}),quest({verification_method:'auto'}),quest({points:-1}),quest({quest_type:'social',verification_method:'wallet_activity'}),quest({note:'abandon '.repeat(12)})]){
  const r=await call(env,'/campaigns/sprint4-demo/quests',{method:'POST',body:b,admin:true});assert.notEqual(r.status,201);
 }
 assert.equal((await call(env,'/quests/'+item.id,{method:'PUT',body:{title:'Malicious'},uid:42})).status,403);
 assert.equal((await call(env,'/quests/'+item.id,{method:'DELETE',uid:42})).status,403);
 DB.sql.close();
});
test('manual transition graph and all verification methods reject user verified',()=>{
 for(const [from,to,allowed] of [['todo','submitted',true],['in_progress','failed',true],['submitted','todo',true],['failed','in_progress',true],['not_applicable','todo',true],['todo','verified',false],['verified','todo',false],['todo','expired',false]])assert.equal(transition('manual',from,to),allowed);
 for(const method of ['manual','url_submission','wallet_activity','admin_review','none'])assert.equal(transition(method,'todo','verified','user'),false);
 assert.equal(transition('admin_review','todo','submitted'),true);
 assert.equal(transition('admin_review','todo','in_progress'),false);
 assert.equal(transition('url_submission','todo','submitted'),true);
 assert.equal(transition('wallet_activity','in_progress','verified','system'),true);
 assert.equal(transition('admin_review','submitted','verified','admin'),true);
 assert.equal(transition('none','todo','submitted'),true);
});
test('URL evidence submission, admin verification, one-time points and failure reversal',async()=>{
 const {DB,env}=await setup(),item=await add(env,quest({verification_method:'url_submission'}));
 const noProof=await call(env,'/quests/'+item.id+'/progress',{method:'POST',uid:42,body:{status:'submitted'}});assert.equal(noProof.status,400);
 const sub=await call(env,'/quests/'+item.id+'/evidence',{method:'POST',uid:42,body:{evidence_url:evidence}});assert.equal(sub.status,200);assert.equal(sub.data.progress.status,'submitted');
 assert.equal((await call(env,'/quests/'+item.id+'/progress',{method:'PUT',uid:42,body:{status:'verified'}})).status,403);
 const verified=await call(env,'/quests/'+item.id+'/progress',{method:'PUT',admin:true,body:{user_scope:'tg:42',status:'verified'}});assert.equal(verified.status,200,JSON.stringify(verified.data));
 await call(env,'/quests/'+item.id+'/progress',{method:'PUT',admin:true,body:{user_scope:'tg:42',status:'verified'}});
 assert.equal((await call(env,'/points',{uid:42})).data.points,25);
 assert.equal(DB.sql.prepare("SELECT count(*) n FROM user_points_ledger WHERE points>0").get().n,1);
 const rejected=await call(env,'/quests/'+item.id+'/progress',{method:'PUT',admin:true,body:{user_scope:'tg:42',status:'failed'}});assert.equal(rejected.status,200);
 const p=await call(env,'/points',{uid:42});assert.equal(p.data.points,0);assert.equal(p.data.ledger.length,2);assert.equal(p.data.ledger[0].reason,'QUEST_REVERSAL');
 assert.equal((await call(env,'/quests/'+item.id,{method:'DELETE',admin:true})).status,409);
 DB.sql.close();
});
test('scope isolation, manual never awards points, and points ledger pagination',async()=>{
 const {DB,env}=await setup();
 const item=await add(env,quest({verification_method:'manual'}));
 assert.equal((await call(env,'/quests/'+item.id+'/progress',{method:'POST',uid:42,body:{status:'submitted',note:'Riset manual'}})).status,200);
 assert.equal((await call(env,'/quests/my',{uid:43})).data.total,0);
 assert.equal((await call(env,'/points',{uid:42})).data.points,0);
 assert.equal((await call(env,'/quests/my')).status,401);
 await add(env,quest({title:'Tugas dua'}));await add(env,quest({title:'Tugas tiga'}));
 const list=await call(env,'/campaigns/sprint4-demo/quests?limit=2&page=1');
 assert.equal(list.data.quests.length,2);assert.equal(list.data.has_more,true);
 assert.equal((await call(env,'/campaigns/sprint4-demo/quests?limit=2&page=2')).data.quests.length,1);
 DB.sql.close();
});
test('wallet_activity verifies only with scoped, fresh, passed on-chain evidence',async()=>{
 const {DB,env}=await setup(),item=await add(env,quest({verification_method:'wallet_activity'}));
 const inserted=await call(env,'/quests/'+item.id+'/progress',{method:'POST',uid:42,body:{wallet_address:wallet,status:'in_progress'}});
 assert.equal(inserted.status,403);
 const walletId=crypto.randomUUID(),created=new Date().toISOString();
 DB.sql.prepare('INSERT INTO wallet_watchlist(id,user_id,chain,address,created_at) VALUES(?,?,?,?,?)').run(walletId,'tg:42','eip155:1',wallet,created);
 assert.equal((await call(env,'/quests/'+item.id+'/progress',{method:'POST',uid:43,body:{wallet_address:wallet,status:'in_progress'}})).status,403);
 const without=await call(env,'/quests/'+item.id+'/progress',{method:'POST',uid:42,body:{wallet_address:wallet,status:'in_progress'}});assert.equal(without.data.progress.status,'in_progress');
 DB.sql.prepare('INSERT INTO eligibility_results(id,wallet_id,campaign_id,rule_id,rule_type,parameters,evaluation_status,evaluated_at,evidence_refs,human_reason) VALUES(?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),walletId,'sprint4-demo','tx-count','tx_count','{}','passed',created,JSON.stringify([{source_url:evidence}]),'Bukti transaksi');
 const verified=await call(env,'/quests/'+item.id+'/progress',{method:'POST',uid:42,body:{wallet_address:wallet,status:'in_progress'}});
 assert.equal(verified.data.progress.status,'verified',JSON.stringify(verified.data));assert.equal((await call(env,'/points',{uid:42})).data.points,25);
 assert.equal((await call(env,'/campaigns/sprint4-demo/progress',{uid:42})).data.verified_required,1);
 DB.sql.close();
});
test('streak uses local day, resets after 48 hours and rejects invalid timezone safely',()=>{
 const time=Date.parse('2026-10-28T20:00:00Z'),hour=3600000;
 assert.equal(streakFromVerified([time-3*hour,time-27*hour,time-51*hour],time,'UTC'),3);
 assert.equal(streakFromVerified([time-50*hour],time,'UTC'),0);
 assert.equal(streakFromVerified([time-1*hour],time,'Invalid/Timezone'),1);
});
test('Next Best Action sorting, groups, no expired quests, maximum 100',async()=>{
 const time=Date.now(),base={id:'a',title:'A',campaign_name:'Contoh',campaign_slug:'x',status:'todo',campaign_status:'confirmed',weight:2,points:10,estimated_effort:2,gas_cost_estimate:1,starts_at:null,ends_at:time+24*3600000,claim_deadline_at:null};
 const ranked=rankActions([{...base,id:'later',ends_at:time+6*86400000},{...base,id:'urgent'},{...base,id:'old',ends_at:time-1000},{...base,id:'verified',status:'verified'}],time);
 assert.deepEqual(ranked.map(x=>x.id),['urgent','later']);assert.equal(ranked[0].group,'harus_segera');assert.equal(ranked[1].group,'minggu_ini');
 assert.ok(Number.isFinite(scoreAction(base,time).priority));
 assert.equal(rankActions(Array.from({length:130},(_,i)=>({...base,id:String(i)})),time).length,100);
});
test('XSS escaping, HTTP links, enum and date constraints',()=>{
 assert.equal(escapeHTML('<img src=x>'),'&lt;img src=x&gt;');assert.match(escapeMarkdown('[malicious](test)'),/\\\[/);
 for(const value of ['http://a.example.org','https://127.0.0.1','https://example.local','javascript:alert(1)','https://user:pass@example.org'])assert.throws(()=>httpsURL(value,false));
 assert.throws(()=>cleanQuest(quest({ends_at:1,starts_at:2})));assert.throws(()=>cleanQuest(quest({verification_method:'none',quest_type:'wrong'})));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {digest} from '../src/platform-api.mjs';
import {autopsyRoutes} from '../src/autopsy/routes.ts';
import {parseAutopsy,parseDecision,evidence,https} from '../src/autopsy/validation.ts';
import {buildPatterns,buildWeekly,weekRange,INSUFFICIENT} from '../src/autopsy/patterns.ts';
import {assembleEvidenceCard} from '../src/autopsy/evidenceCard.ts';
class D1{
 constructor(with11=true){
  this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON');
  const files=['0001_core.sql','0003_platform.sql','0010_discovery_automation.sql','0011_source_trust.sql','0012_public_api.sql','0013_admin_operations.sql',...(with11?['0014_claim_autopsy.sql']:[])];
  for(const filename of files)this.sqlite.exec(readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8'));
 }
 prepare(query){const stmt=this.sqlite.prepare(query);let p=[];const q={bind(...args){p=args;return q;},async first(){return stmt.get(...p)||null;},async all(){return {results:stmt.all(...p)};},async run(){return {meta:{changes:Number(stmt.run(...p).changes)}};}};return q;}
}
const origin='https://museum.example.org';
const cookieA='a'.repeat(64),cookieB='b'.repeat(64);
const req=(path,cookie,method='GET',body,extra={})=>new Request(origin+path,{method,headers:{...(cookie?{Cookie:'am_session='+cookie}:{}),'Content-Type':'application/json',...(body===undefined?{}:{Origin:origin}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function fixture(with11=true){
 const DB=new D1(with11);
 for(const [id,cookie] of [['tg:alice',cookieA],['tg:bob',cookieB]]){
  await DB.prepare('INSERT INTO am_users(id,username) VALUES(?,?)').bind(id,id).run();
  await DB.prepare('INSERT INTO am_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await digest(cookie),id,Math.floor(Date.now()/1000)+3600).run();
 }
 const e={DB};
 await campaign(e,'ended',{status:'ended',visibility:'public'},'confirmed',true);
 await campaign(e,'future',{status:'active',visibility:'public',claim_deadline_at:'2030-01-01T00:00:00Z'},'confirmed',true);
 await campaign(e,'hidden',{status:'ended',visibility:'private'},'confirmed',true);
 await campaign(e,'draft',{status:'ended',visibility:'public'},'draft',true);
 await campaign(e,'noverify',{status:'ended',visibility:'public'},'confirmed',false);
 return e;
}
async function campaign(e,id,more={},review='confirmed',verified=true){
 const payload={slug:id,name:'Example '+id,project_name:'Example',description:'Public status',status:'ended',visibility:'public',...more};
 await e.DB.prepare('INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES(?,?,?,?)').bind(id,JSON.stringify(payload),'https://official.example.org/claim',review).run();
 if(verified)await e.DB.prepare("INSERT INTO verification_runs(id,run_key,campaign_id,trigger_type,status,started_at,finished_at,confidence_label) VALUES(?,?,?,'manual','complete',?,?,?)").bind('run:'+id,'key:'+id,id,'2026-10-28T12:00:00Z','2026-10-28T12:00:00Z','medium_confidence').run();
}
const base={
 campaign_id:'ended',wallet_address:'0x'+'a'.repeat(40),
 activity_before_snapshot:true,activity_after_snapshot:false,
 quest_count:4,chain_count:2,gas_cost_usd:3.5,bridge_cost_usd:1.25,
 research_minutes:90,decision_source:'official',outcome:'allocated',
 hypothesis:'Penyebab sebenarnya belum dapat ditentukan',
 evidence:[{kind:'tx_hash',value:'0x'+'e'.repeat(64)},{kind:'official_link',value:'https://official.example.org/claim'}]
};
const decision={campaign_id:'ended',reason:'Dokumen primer dapat ditinjau',primary_evidence_url:'https://official.example.org/claim?secret=discard',decision_source:'official',time_budget_minutes:120,cost_ceiling_usd:10,realistic_expectations:'Tidak ada jaminan alokasi'};
const run=async(e,path,cookie=cookieA,method='GET',body,extra)=>autopsyRoutes(req(path,cookie,method,body,extra),e);
test('migration is additive and backward compatible with preceding trust/admin tables',async()=>{
 const e=await fixture();
 for(const t of ['claim_autopsies','decision_entries','outcome_reviews','user_pattern_snapshots','source_conflicts','admin_users']){
  assert.ok(await e.DB.prepare('SELECT name FROM sqlite_master WHERE name=?').bind(t).first(),t);
 }
 assert.ok(await e.DB.prepare('SELECT version FROM am_core_schema WHERE version=11').first());
 assert.ok(await e.DB.prepare('SELECT id FROM am_core_exhibits WHERE id=?').bind('ended').first());
});
test('validation rejects wallets, invalid expenses, secrets, non-HTTPS and fake tx hashes',()=>{
 assert.equal(parseAutopsy({...base,consent_to_analysis:false}).consent_to_analysis,0);
 assert.throws(()=>parseAutopsy({...base,wallet_address:'private key'}),/INVALID_PUBLIC_WALLET/);
 assert.throws(()=>parseAutopsy({...base,gas_cost_usd:-1}),/INVALID_NUMBER/);
 assert.throws(()=>parseAutopsy({...base,quest_count:1.7}),/INVALID_NUMBER/);
 assert.throws(()=>parseAutopsy({...base,outcome:'guaranteed'}),/INVALID_CHOICE/);
 assert.throws(()=>parseAutopsy({...base,hypothesis:'Please save my seed phrase'}),/SENSITIVE_INPUT_REFUSED/);
 assert.throws(()=>parseAutopsy({...base,evidence:[{kind:'tx_hash',value:'0x123'}]}),/INVALID_TX_HASH/);
 assert.throws(()=>parseDecision({...decision,primary_evidence_url:'https://localhost/token'}),/INVALID_HTTPS_URL/);
 assert.throws(()=>evidence([{kind:'screenshot',value:'http://site.example/a'}]),/INVALID_HTTPS_URL/);
 assert.equal(https('https://official.example.org/claim?token=secret#hash'),'https://official.example.org/claim');
});
test('autopsy is available only after campaign ended, never public, never cross-user',async()=>{
 const e=await fixture();
 assert.equal((await run(e,'/api/autopsy',cookieA,'POST',{...base,campaign_id:'future'})).status,409);
 assert.equal((await run(e,'/api/autopsy',cookieA,'POST',{...base,campaign_id:'draft'})).status,409);
 const created=await run(e,'/api/autopsy',cookieA,'POST',{...base,consent_to_analysis:false});assert.equal(created.status,201);
 const data=await created.json(),list=await(await run(e,'/api/autopsy',cookieA)).json();
 assert.equal(list.items.length,1);assert.equal(list.items[0].consent_to_analysis,0);
 assert.equal((await run(e,'/api/autopsy/'+data.id,cookieB)).status,404);
 assert.equal((await(await run(e,'/api/autopsy',cookieB)).json()).items.length,0);
 assert.equal((await run(e,'/api/autopsy',null)).status,401);
 const text=JSON.stringify(await(await run(e,'/api/insights/patterns',cookieB)).json());
 assert.ok(!text.includes('0x'+'a'.repeat(40)));
 assert.equal((await run(e,'/api/autopsy',cookieA,'POST',base,{Origin:'https://evil.example'})).status,403);
 assert.match((await run(e,'/api/autopsy',cookieA)).headers.get('Cache-Control'),/private/);
});
test('pattern engine requires five opted-in notes and five per individual cohort; no predictions',()=>{
 const rows=Array.from({length:8},(_,i)=>({...base,consent_to_analysis:i<6?1:0,created_at:'2026-10-'+String(i+10)+' 13:00:00',outcome:i<4?'allocated':'not_allocated'}));
 const result=buildPatterns(rows);assert.equal(result.sample_count,6);
 assert.ok(result.insights.some(i=>i.field==='activity_before_snapshot'&&i.sample_count===6&&i.allocated===4));
 assert.ok(!JSON.stringify(result).includes('expected_value'));assert.match(result.limitations,/tidak menunjukkan sebab-akibat/);
 const small=buildPatterns(rows.slice(0,4));assert.equal(small.notice,INSUFFICIENT);assert.deepEqual(small.insights,[]);
 assert.equal(buildPatterns(rows.map(r=>({...r,consent_to_analysis:0}))).sample_count,0);
});
test('pattern endpoint only considers explicitly opted-in records and persists private snapshot',async()=>{
 const e=await fixture();
 for(let i=0;i<6;i++)assert.equal((await run(e,'/api/autopsy',cookieA,'POST',{...base,consent_to_analysis:i<5})).status,201);
 const a=await(await run(e,'/api/insights/patterns',cookieA)).json();
 const b=await(await run(e,'/api/insights/patterns',cookieB)).json();
 assert.equal(a.sample_count,5);assert.equal(b.sample_count,0);
 const snapshot=await e.DB.prepare('SELECT user_scope,sample_size FROM user_pattern_snapshots WHERE user_scope=?').bind('tg:alice').first();
 assert.equal(snapshot.sample_size,5);assert.equal(snapshot.user_scope,'tg:alice');
});
test('decision creation precedes follow marker, is unique per user/campaign, outcome is linked and scoped',async()=>{
 const e=await fixture();
 const c=await run(e,'/api/decisions',cookieA,'POST',decision);
 assert.equal(c.status,201);const created=await c.json();assert.equal(created.follow_status,'following');
 assert.equal((await run(e,'/api/decisions',cookieA,'POST',decision)).status,409);
 const before=await(await run(e,'/api/decisions',cookieA)).json();assert.equal(before.items.length,1);assert.equal(before.items[0].primary_evidence_url,'https://official.example.org/claim');
 assert.equal((await run(e,'/api/decisions/'+created.id+'/outcome',cookieB,'PUT',{outcome:'allocated',lessons:'secret'})).status,404);
 const outcome=await run(e,'/api/decisions/'+created.id+'/outcome',cookieA,'PUT',{outcome:'not_allocated',lessons:'Lebih kritis pada bukti'});assert.equal(outcome.status,200);
 assert.equal((await(await run(e,'/api/decisions',cookieA)).json()).items[0].outcome,'not_allocated');
 assert.equal((await run(e,'/api/decisions/'+created.id+'/outcome',cookieA,'PUT',{outcome:'unknown',lessons:'Revisi hasil'})).status,200);
 assert.equal((await e.DB.prepare('SELECT count(*) AS n FROM outcome_reviews WHERE user_scope=?').bind('tg:alice').first()).n,1);
});
test('weekly review displays UTC range, sample counts, evidence quality and lessons',()=>{
 const week=weekRange(new Date('2026-10-28T12:00:00Z'));assert.equal(week.start,'2026-10-26T00:00:00.000Z');
 const result=buildWeekly([{id:'d1',campaign_id:'ended',decision_source:'official',created_at:'2026-10-28 11:00:00',outcome:'allocated',lessons:'Belajar'},
 {id:'d2',campaign_id:'future',decision_source:'community',created_at:'2026-10-27 11:00:00',outcome:null,lessons:null}],week);
 assert.equal(result.sample_count,2);assert.equal(result.outcomes.allocated,1);assert.equal(result.outcomes.pending,1);
 assert.equal(result.evidence_quality.primary_source_decisions,1);assert.equal(result.revisit.length,1);
 assert.equal(result.notice,INSUFFICIENT);
});
test('evidence card contains only vetted public fields and no personal autopsy or journal data',async()=>{
 const e=await fixture();
 await e.DB.prepare("INSERT INTO source_trust_profiles(id,source_url,host,tier) VALUES('s1','https://official.example.org/claim','official.example.org','primary_official')").run();
 await e.DB.prepare("INSERT INTO campaign_source_links(id,campaign_id,source_id,source_url,registered_by,enabled,official_domain_verified) VALUES('link','ended','s1','https://official.example.org/claim','moderator',1,1)").run();
 const card=await run(e,'/api/evidence-card/ended',null);assert.equal(card.status,200);
 const data=await card.json();assert.ok(data.primary_sources.length);
 assert.equal(data.sample_count,1);assert.ok(data.disclaimer.includes('bukan jaminan eligibility'));
 assert.ok(!JSON.stringify(data).includes('wallet_address'));
 assert.equal((await run(e,'/api/evidence-card/hidden',null)).status,404);
 assert.equal((await run(e,'/api/evidence-card/draft',null)).status,404);
 assert.equal((await run(e,'/api/evidence-card/noverify',null)).status,404);
 const standalone=assembleEvidenceCard({slug:'s',name:'S',status:'ended',source_url:'https://official.example.org',last_verified_at:'2026-10-28',source_count:2},[],[{field:'chain',severity:'material',status:'open'}]);
 assert.equal(standalone.status,'conflicted');
});
test('schema not migrated rejects private endpoint without user data fallback',async()=>{
 const e=await fixture(false);
 assert.equal((await run(e,'/api/autopsy',cookieA)).status,503);
});

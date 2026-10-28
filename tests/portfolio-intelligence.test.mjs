import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {computeSummary,exposureLabel,groupDeadline,chainExposure} from '../src/aggregator/portfolioService.mjs';
import {csvCell,csvLine,exportPortfolio} from '../src/aggregator/exportService.mjs';
import {SCHEMA_VERSION,MAX_BACKUP_BYTES,checkBackupSize,restoreBackup,createBackup} from '../src/aggregator/backupService.mjs';
import {localTime,weeklyReport,REPORT_DISCLAIMER} from '../src/aggregator/reportService.mjs';
globalThis.crypto ||= webcrypto;
const scope='tg:123';
class FakeDB {
 constructor(){this.writes=[];}
 prepare(sql){const db=this;return {params:[],bind(...params){this.params=params;return this;},async first(){if(sql.includes('SUM(points)'))return {n:12};if(sql.includes('COUNT(*)'))return {n:1};return null;},async all(){return {results:[]};},async run(){db.writes.push({sql,params:this.params});return {meta:{changes:1}};}};}
 async batch(stmts){return stmts.map(()=>({results:[],meta:{changes:1}}));}
}
const sample={campaigns:[{id:'one',status:'confirmed',claim_deadline_at:'2026-11-01T00:00:00Z',kyc_requirement:'unknown',official_urls:'["https://project.example"]'}],progress:[{quest_id:'quest',campaign_id:'one',status:'verified',verification_method:'admin_review',ends_at:null}],availableQuests:[{id:'quest'},{id:'new'}],wallets:[{chain:'eip155:1'}],eligibility:[],claims:[],points:120};
test('portfolio summary',()=>{
 const x=computeSummary(sample,Date.parse('2026-10-28T00:00:00Z'));
 assert.equal(x.total_campaigns,1);assert.equal(x.active_campaigns,1);assert.equal(x.quests.verified,1);assert.equal(x.quests.todo,1);assert.equal(x.internal_points,120);assert.equal(x.deadlines_7d,1);assert.equal(x.wallets_monitored,1);
});
test('chain exposure and labels',async()=>{
 assert.equal(exposureLabel(70,3),'Terkonsentrasi');assert.equal(exposureLabel(50,3),'Cukup seimbang');assert.equal(exposureLabel(35,4),'Tersebar');
 const db={prepare(){return {bind(){return this},async all(){return {results:[{chain:'eip155:1',protocol_activity:'[1,2,3]'},{chain:'eip155:8453',protocol_activity:'[1]'}]}}}}};
 const x=await chainExposure(db,scope);assert.equal(x.items[0].percent,75);assert.equal(x.label,'Terkonsentrasi');
});
test('deadline groups',()=>{
 const now=Date.parse('2026-10-28T00:00:00Z'),r=groupDeadline([{deadline:'2026-10-28T12:00:00Z'},{deadline:'2026-11-01T00:00:00Z'},{deadline:'2026-10-27T00:00:00Z'}],now);
 assert.equal(r.segera.length,1);assert.equal(r.minggu_ini.length,1);assert.equal(r.terlewat.length,1);
});
test('CSV formula escaping',()=>{
 for(const x of ['=cmd','+SUM(1)','-1+2','@SUM(2)',' \t=1'])assert.ok(csvCell(x).startsWith('"'+String.fromCharCode(39)),x);
 assert.equal(csvCell('a,"b"'),'"a,""b"""');assert.match(csvLine(['Campaign','Status']),/\r\n$/);
});
test('Markdown export contains required sections',async()=>{
 const r=await exportPortfolio(new FakeDB(),scope,'markdown',{limit:20,offset:0}),text=await r.text();
 for(const name of ['Ringkasan','Deadline','Quest prioritas','Eligibility progress','Risiko yang perlu ditinjau','Link sumber resmi'])assert.ok(text.includes(name));
 assert.match(r.headers.get('content-disposition'),/\.md/);
});
test('JSON export includes metadata and no secret',async()=>{
 const r=await exportPortfolio(new FakeDB(),scope,'json'),v=await r.json();assert.equal(v.schema_version,1);assert.ok(!JSON.stringify(v).includes('private_key'));
});
test('backup size boundary',()=>assert.throws(()=>checkBackupSize('x'.repeat(MAX_BACKUP_BYTES+1)),/BACKUP_TOO_LARGE/));
test('schema version mismatch blocks restore before mutation',async()=>{
 const env={DB:new FakeDB()},envelope={payload:{schema_version:SCHEMA_VERSION+1},signature:'0'.repeat(64)};
 await assert.rejects(restoreBackup(env,scope,{envelope}),/SCHEMA_VERSION_MISMATCH/);assert.equal(env.DB.writes.length,0);
});
test('signed backup rejects another user scope',async()=>{
 const db=new FakeDB(),objects=new Map(),bucket={async put(key,value){objects.set(key,value)},async get(key){return {text:async()=>objects.get(key),size:objects.get(key).length}},async delete(key){objects.delete(key)}};
 const env={DB:db,AGGREGATOR_BACKUP_BUCKET:bucket,BACKUP_SIGNING_KEY:'test-only-signing-key'};
 const info=await createBackup(env,scope);assert.equal(info.schema_version,SCHEMA_VERSION);assert.equal(info.status,'ready');
 const saved=JSON.parse([...objects.values()][0]);await assert.rejects(restoreBackup(env,'tg:999',{envelope:saved}),/BACKUP_SCOPE_MISMATCH/);
});
test('weekly reports UTC fallback and content',async()=>{
 const monday=Date.parse('2026-11-02T09:00:00Z');assert.equal(localTime(monday).hour,9);assert.equal(localTime(monday,'Invalid/Zone').timezone,'UTC');
 const report=await weeklyReport(new FakeDB(),scope,{now:monday});assert.ok(report?.text.includes(REPORT_DISCLAIMER));assert.equal(report.counts.verified,1);
});
test('migration is additive',()=>{
 const sql=readFileSync(new URL('../migrations/0009_portfolio_intelligence.sql',import.meta.url),'utf8');
 for(const table of ['user_portfolio_snapshots','portfolio_export_jobs','backup_metadata'])assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS '+table));
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM (?:campaigns|wallet_watchlist)/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyRestoreTarget} from '../scripts/verify-restore-target.mjs';

const account='9880cf2cc57c2096f8c3ae253d9852e6';
const database='a0bcde01-1234-4567-89ab-001122334455';
const created='2026-11-18T00:00:00Z';
const now=Date.parse('2026-11-18T05:00:00Z');
const original='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';

function mocked({
 db={uuid:database,name:'airdrop-museum-restore-drill-20261118',created_at:created},
 workers=[{id:'airdrop-museum'},{id:'other-active-app'}],
 bindings={'airdrop-museum':[{type:'d1',name:'DB',id:original}],
  'other-active-app':[{type:'plain_text',name:'NOT_D1'}]}
}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer TEST_TOKEN');
  assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+account));
  if(url.endsWith('/d1/database/'+database))return {ok:true,json:async()=>({success:true,result:db})};
  if(url.endsWith('/workers/scripts'))return {ok:true,json:async()=>({success:true,result:workers})};
  const name=url.slice(url.lastIndexOf('/scripts/')+9).split('/settings')[0];
  if(url.endsWith('/settings')&&Object.hasOwn(bindings,name))
   return {ok:true,json:async()=>({success:true,result:{bindings:bindings[name]}})};
  return {ok:false};
 };
 return {fetcher,calls};
}
const verify=(mock,override={})=>verifyRestoreTarget({
 accountId:account,databaseId:database,token:'TEST_TOKEN',now,fetcher:mock.fetcher,...override
});

test('fresh private restore D1 is checked against every current Worker binding using only GET',async()=>{
 const mock=mocked();
 const report=await verify(mock);
 assert.equal(report.status,'READ_ONLY_TARGET_ISOLATION_CHECK_PASSED');
 assert.equal(report.worker_scripts_checked,2);
 assert.equal(report.no_worker_deployed_or_database_written,true);
 assert.equal(mock.calls.length,4);
 assert.ok(mock.calls.every(c=>c.options.method==='GET'));
 assert.equal(report.database_id,database);
});

test('refuse known production, missing token and invalid targets before any Cloudflare request',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;throw Error('MUST_NOT_FETCH');};
 for(const invalid of [original,'461404c7-a2c6-4222-bb13-6aa26fce2332','foo'])
  await assert.rejects(verifyRestoreTarget({accountId:account,databaseId:invalid,token:'TOKEN',fetcher}),/FRESH_STAGING_DATABASE_REQUIRED/);
 await assert.rejects(verifyRestoreTarget({accountId:'wrong',databaseId:database,token:'TOKEN',fetcher}),/RESTORE_TARGET_ACCOUNT_INVALID/);
 await assert.rejects(verifyRestoreTarget({accountId:account,databaseId:database,token:'',fetcher}),/RESTORE_TARGET_CLOUDFLARE_TOKEN_REQUIRED/);
 assert.equal(calls,0);
});

test('database metadata must identify a newly created dedicated restore drill',async()=>{
 for(const db of [
  {uuid:original,name:'airdrop-museum-restore-drill',created_at:created},
  {uuid:database,name:'airdrop-museum',created_at:created},
  {uuid:database,name:'airdrop-museum-restore-drill',created_at:'2026-01-01T00:00:00Z'},
  {uuid:database,name:'airdrop-museum-restore-drill',created_at:'2026-12-01T00:00:00Z'},
  {uuid:database,name:'airdrop-museum-restore-drill',created_at:'invalid'}
 ]){
  await assert.rejects(verify(mocked({db})),/RESTORE_TARGET_DATABASE_IDENTITY_MISMATCH|RESTORE_TARGET_NOT_RECENTLY_CREATED/);
 }
});

test('refuse restore into database referenced by any active Worker in same account',async()=>{
 const mock=mocked({bindings:{'airdrop-museum':[{type:'d1',name:'DB',id:original}],
  'other-active-app':[{type:'d1',name:'DB',id:database}]}});
 await assert.rejects(verify(mock),/RESTORE_DATABASE_ALREADY_BOUND_TO_WORKER/);
 assert.equal(mock.calls.length,4);
});

test('fail closed on unverified, duplicate or malformed Worker inventory and bindings',async()=>{
 const cases=[
  mocked({workers:{result:[]}}),
  mocked({workers:[{id:'airdrop-museum'},{id:'airdrop-museum'}]}),
  mocked({workers:[{id:'../../unsafe'}]}),
  mocked({workers:[{id:'unknown-script'}]}),
  mocked({workers:[{id:'airdrop-museum'}],bindings:{'airdrop-museum':[{type:'d1',name:'DB'}]}}),
  mocked({workers:[{id:'airdrop-museum'}],bindings:{'airdrop-museum':null}})
 ];
 for(const c of cases)
  await assert.rejects(verify(c),/RESTORE_WORKER_INVENTORY_INVALID|RESTORE_WORKER_BINDINGS_UNVERIFIED|RESTORE_TARGET_CLOUDFLARE_READ_FAILED/);
});

test('403 or Cloudflare error is a release blocker, not an empty Worker inventory',async()=>{
 for(const response of [{ok:false},{ok:true,json:async()=>({success:false,result:[]})}]){
  const fetcher=async()=>response;
  await assert.rejects(verifyRestoreTarget({
   accountId:account,databaseId:database,token:'TEST_TOKEN',fetcher
  }),/RESTORE_TARGET_CLOUDFLARE_READ_FAILED/);
 }
});

test('operator restore must verify live target before and immediately before import',()=>{
 const script=readFileSync('scripts/restore-private-backup.mjs','utf8');
 assert.match(script,/verifyRestoreTarget/);
 assert.match(script,/restore-target-preflight\.json/);
 assert.match(script,/RESTORE_TARGET_CHANGED_DURING_PREFLIGHT/);
 const first=script.indexOf('await verifyRestoreTarget');
 const second=script.lastIndexOf('await verifyRestoreTarget');
 const importAt=script.indexOf("run(['d1','execute','DB','--remote','--file',dump],'import')");
 assert.ok(first>=0&&second>first&&importAt>second);
 assert.match(script,/STAGING_NOT_EMPTY/);
});

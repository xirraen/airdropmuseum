import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {encryptBackup} from '../scripts/backup-crypto.mjs';
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
  'other-active-app':[{type:'plain_text',name:'NOT_D1'}]},
 activeBindings={},
 changeDeployments=false,
 activePercentages=[100]
}={}){
 const calls=[],perWorkerReads=new Map();
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer TEST_TOKEN');
  assert.ok(url.startsWith('https://api.cloudflare.com/client/v4/accounts/'+account));
  if(url.endsWith('/d1/database/'+database))return {ok:true,json:async()=>({success:true,result:db})};
  if(url.endsWith('/workers/scripts'))return {ok:true,json:async()=>({success:true,result:workers})};
  const match=/\/workers\/scripts\/([^/]+)\/(settings|deployments|versions\/[^/]+)$/.exec(url);
  const name=match?.[1],endpoint=match?.[2];
  if(endpoint==='settings'&&Object.hasOwn(bindings,name))
   return {ok:true,json:async()=>({success:true,result:{bindings:bindings[name]}})};
  if(endpoint==='deployments'&&Object.hasOwn(bindings,name)){
   const seen=(perWorkerReads.get(name)||0)+1;
   perWorkerReads.set(name,seen);
   const deploymentId=changeDeployments&&seen>1?'ffffffff-ffff-ffff-ffff-ffffffffffff':'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
   const result={deployments:[{id:deploymentId,versions:activePercentages.map((percentage,i)=>({
    version_id:i===0?'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb':'cccccccc-cccc-cccc-cccc-cccccccccccc',percentage
   }))}]};
   return {ok:true,json:async()=>({success:true,result})};
  }
  if(endpoint?.startsWith('versions/')&&Object.hasOwn(bindings,name)){
   const versionId=endpoint.slice('versions/'.length);
   const index=versionId.startsWith('bbbb')?0:1;
   const defined=Object.hasOwn(activeBindings,name)?activeBindings[name]:bindings[name];
   const versionBindings=Array.isArray(defined?.[0])?defined[index]:defined;
   return {ok:true,json:async()=>({success:true,result:{id:versionId,resources:{bindings:versionBindings}}})};
  }
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
 assert.equal(report.active_worker_versions_checked,2);
 assert.equal(report.no_worker_deployed_or_database_written,true);
 assert.equal(mock.calls.length,10);
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

test('restore target accepts up to five minutes of clock skew but fails closed beyond it',async()=>{
 const allowed=mocked({db:{uuid:database,name:'airdrop-museum-restore-drill-clock',created_at:new Date(now+60000).toISOString()}});
 const report=await verify(allowed);
 assert.equal(report.status,'READ_ONLY_TARGET_ISOLATION_CHECK_PASSED');
 const future=mocked({db:{uuid:database,name:'airdrop-museum-restore-drill-clock',created_at:new Date(now+6*60000).toISOString()}});
 await assert.rejects(verify(future),/RESTORE_TARGET_NOT_RECENTLY_CREATED/);
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
 assert.equal(mock.calls.length,7);
});

test('deny private D1 restore when a traffic-serving Worker version is bound despite safe latest settings',async()=>{
 const mock=mocked({activeBindings:{'airdrop-museum':[{type:'d1',id:database}],
  'other-active-app':[{type:'plain_text'}]}});
 await assert.rejects(verify(mock),/RESTORE_DATABASE_ALREADY_BOUND_TO_WORKER/);
 assert.ok(mock.calls.some(c=>c.url.includes('/versions/')));
});

test('deny private D1 restore when a minority of split-traffic versions is bound',async()=>{
 const mock=mocked({activePercentages:[90,10],
  activeBindings:{'airdrop-museum':[[{type:'d1',id:original}],[{type:'d1',id:database}]],
   'other-active-app':[[{type:'plain_text'}],[{type:'plain_text'}]]}});
 await assert.rejects(verify(mock),/RESTORE_DATABASE_ALREADY_BOUND_TO_WORKER/);
});

test('deny missing live Worker version metadata and concurrent routing changes',async()=>{
 for(const mock of [
  mocked({activeBindings:{'airdrop-museum':null,'other-active-app':[]}}),
  mocked({changeDeployments:true}),
  mocked({activePercentages:[70]})
 ]){
  await assert.rejects(verify(mock),/RESTORE_WORKER_BINDINGS_UNVERIFIED|RESTORE_ACTIVE_DEPLOYMENT_CHANGED|RESTORE_ACTIVE_DEPLOYMENT_UNVERIFIED/);
 }
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

test('plaintext is removed when restore aborts after authenticated decryption but before remote SQL',()=>{
 const dir=mkdtempSync(join(tmpdir(),'am-restore-plaintext-cleanup-'));
 const folder=join(dir,'backup'),keys=join(dir,'keys');
 mkdirSync(folder,{mode:0o700});mkdirSync(keys,{mode:0o700});
 try{
  const keyId=randomUUID(),keyFile=join(keys,keyId+'.key');
  const input=join(folder,'source.sql'),sealed=join(folder,'production.sql.aesgcm');
  writeFileSync(input,'CREATE TABLE sample (id INTEGER);',{mode:0o600});
  const crypt=encryptBackup(input,sealed,keyFile);
  rmSync(input);
  writeFileSync(join(folder,'manifest.json'),JSON.stringify({
   format:'private-d1-backup-v1',local_restore_verified:true,
   source_database_id:original,sha256:'0'.repeat(64),
   encrypted:{...crypt,file:'production.sql.aesgcm',key_id:keyId}
  }));
  const preload=join(dir,'mock-cloudflare.mjs');
  writeFileSync(preload,[
   "const target='"+database+"';",
   "globalThis.fetch=async (url,options)=>{",
   "if(options.method!=='GET')throw Error('FORBIDDEN_REMOTE_WRITE');",
   "const result=url.endsWith('/d1/database/'+target)?",
   " {uuid:target,name:'airdrop-museum-restore-drill-ci',created_at:new Date().toISOString()}:",
   " url.endsWith('/workers/scripts')?[]:null;",
   "if(result===null)throw Error('UNEXPECTED_REMOTE_ENDPOINT');",
   "return {ok:true,json:async()=>({success:true,result})};",
   "};"
  ].join('\n'));
  const child=spawnSync(process.execPath,['--import',preload,'scripts/restore-private-backup.mjs'],{
   encoding:'utf8',timeout:30000,
   env:{...process.env,PRIVATE_BACKUP_DIRECTORY:folder,PRIVATE_BACKUP_KEY_ROOT:keys,
    RESTORE_STAGING_D1_ID:database,RESTORE_STAGING_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:'TEST_TOKEN'}
  });
  assert.equal(child.status,1,child.stderr);
  assert.match(child.stderr,/BACKUP_HASH_INVALID/);
  assert.ok(readdirSync(folder).includes('restore-target-preflight.json'));
  assert.equal(readdirSync(folder).filter(f=>/^restore-.*\.sql$/.test(f)).length,0);
  assert.equal(readdirSync(folder).filter(f=>f==='production.sql').length,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
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

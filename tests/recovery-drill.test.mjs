import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const script='scripts/run-isolated-recovery-drill.mjs';
const run=(args,env={})=>spawnSync(process.execPath,[script,...args],{
 encoding:'utf8',timeout:20000,
 env:{PATH:process.env.PATH,HOME:process.env.HOME,...env}
});

test('recovery orchestration is opt-in and will not start without full explicit approval',()=>{
 const noMode=run([]),noApproval=run(['--execute']);
 assert.notEqual(noMode.status,0);
 assert.match(noMode.stderr,/Specify --preflight or --execute/);
 assert.notEqual(noApproval.status,0);
 assert.match(noApproval.stderr,/Explicit operator recovery approval required/);
 const noToken=run(['--execute'],{AIRDROP_RECOVERY_DRILL:'APPROVED'});
 assert.notEqual(noToken.status,0);
 assert.match(noToken.stderr,/CLOUDFLARE_API_TOKEN missing/);
 const noTarget=run(['--execute'],{AIRDROP_RECOVERY_DRILL:'APPROVED',CLOUDFLARE_API_TOKEN:'SYNTHETIC'});
 assert.notEqual(noTarget.status,0);
 assert.match(noTarget.stderr,/RESTORE_STAGING_D1_ID missing/);
 const prod=run(['--execute'],{
  AIRDROP_RECOVERY_DRILL:'APPROVED',CLOUDFLARE_API_TOKEN:'SYNTHETIC',
  RESTORE_STAGING_D1_ID:'4e75c8b9-6c58-4bac-a180-01e5bec0d0a3'
 });
 assert.notEqual(prod.status,0);
 assert.match(prod.stderr,/PRODUCTION_DATABASE_REFUSED/);
});

test('isolated D1 recovery preflight makes only GET API calls and cannot write SQL',()=>{
 const dir=mkdtempSync(join(tmpdir(),'am-remote-recovery-preflight-'));
 try{
  const preload=join(dir,'cf-mock.mjs');
  const id='8dd6f86a-7d64-4d3e-aaee-df7207fcc44b';
  const code=[
   "globalThis.fetch=async(url,options)=>{",
   "if(options.method!=='GET')throw Error('UNEXPECTED_REMOTE_WRITE');",
   "if(url.endsWith('/d1/database/"+id+"'))return {ok:true,json:async()=>({success:true,result:{uuid:'"+id+"',name:'airdrop-museum-restore-drill-20261118',created_at:new Date().toISOString()}})};",
   "if(url.endsWith('/workers/scripts'))return {ok:true,json:async()=>({success:true,result:[{id:'airdrop-museum'}]})};",
   "if(url.endsWith('/airdrop-museum/settings'))return {ok:true,json:async()=>({success:true,result:{bindings:[{type:'d1',id:'4e75c8b9-6c58-4bac-a180-01e5bec0d0a3'}]}})};",
   "if(url.endsWith('/airdrop-museum/deployments'))return {ok:true,json:async()=>({success:true,result:{deployments:[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',versions:[{version_id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',percentage:100}]}]}})};",
   "if(url.endsWith('/airdrop-museum/versions/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))return {ok:true,json:async()=>({success:true,result:{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',resources:{bindings:[{type:'d1',id:'4e75c8b9-6c58-4bac-a180-01e5bec0d0a3'}]}}})};",
   "throw Error('UNEXPECTED_URL');",
   "};"
  ].join('\n');
  writeFileSync(preload,code);
  const cmd=spawnSync(process.execPath,['--import',preload,script,'--preflight'],{
   encoding:'utf8',timeout:30000,
   env:{PATH:process.env.PATH,HOME:process.env.HOME,CLOUDFLARE_API_TOKEN:'TEST_TOKEN',RESTORE_STAGING_D1_ID:id}
  });
  assert.equal(cmd.status,0,cmd.stderr);
  const result=JSON.parse(cmd.stdout);
  assert.equal(result.database_id,id);
  assert.equal(result.operation,'PREFLIGHT_ONLY_NO_DATA_READ_OR_WRITE');
  assert.equal(result.worker_scripts_checked,1);
  assert.equal(result.active_worker_versions_checked,1);
 }finally{rmSync(dir,{force:true,recursive:true});}
});

test('recovery orchestration only writes into private operator directories and never uploads a Worker',()=>{
 const source=readFileSync(script,'utf8');
 assert.match(source,/PRIVATE_BACKUP_KEY_ROOT/);
 assert.match(source,/PRIVATE_BACKUP_ROOT/);
 assert.match(source,/AIRDROP_RECOVERY_DRILL/);
 assert.match(source,/scripts\/private-db-backup\.mjs/);
 assert.match(source,/scripts\/restore-private-backup\.mjs/);
 assert.match(source,/privacy-replay-evidence\.json/);
 assert.match(source,/recovery-drill-evidence\.json/);
 assert.doesNotMatch(source,/\['deploy'|workers\/scripts\/.*\/content/);
});

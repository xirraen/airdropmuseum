import {spawn,spawnSync} from 'node:child_process';
import {mkdirSync,openSync,readFileSync,closeSync} from 'node:fs';
import assert from 'node:assert/strict';
const wrangler='node_modules/wrangler/bin/wrangler.js';
const config='wrangler.local.jsonc',database='airdrop-museum-local';
function cli(args,allowFailure=false){const p=spawnSync(process.execPath,[wrangler,...args],{encoding:'utf8',timeout:60000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(p.status!==0&&!allowFailure)throw Error((p.stdout||'')+(p.stderr||''));return p;}
const built=spawnSync(process.execPath,['scripts/build-worker.mjs'],{encoding:'utf8',timeout:60000});if(built.status!==0)throw Error(built.stderr);
cli(['d1','migrations','apply',database,'--local','--config',config]);
cli(['d1','execute',database,'--local','--config',config,'--file','scripts/seed-runtime.sql']);
mkdirSync('.wrangler',{recursive:true});const fd=openSync('.wrangler/runtime-test.log','w');
const server=spawn(process.execPath,[wrangler,'dev','--local','--config',config,'--port','8791'],{stdio:['ignore',fd,fd],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
try{
 let ready=false;
 for(let n=0;n<80;n++){
  if(server.exitCode!==null)throw Error(readFileSync('.wrangler/runtime-test.log','utf8'));
  try{const r=await fetch('http://localhost:8791/api/health',{signal:AbortSignal.timeout(1000)});if(r.status===200){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 if(!ready)throw Error('Local workerd did not become ready');
 const checked=spawnSync(process.execPath,['scripts/runtime-checks.mjs'],{encoding:'utf8',timeout:60000,env:{...process.env,RUNTIME_TEST_ORIGIN:'http://localhost:8791'}});
 process.stdout.write(checked.stdout||'');if(checked.status!==0)throw Error(checked.stderr||'Runtime checks failed');
 const report=JSON.parse(checked.stdout.trim().split('\n').at(-1));assert.match(report.aggregate_id,/^[a-f0-9-]{36}$/);
 for(const command of [`UPDATE autopsy_events SET recorded_at=recorded_at WHERE aggregate_id='${report.aggregate_id}'`,`DELETE FROM autopsy_events WHERE aggregate_id='${report.aggregate_id}'`]){
  const result=cli(['d1','execute',database,'--local','--config',config,'--command',command],true);
  assert.notEqual(result.status,0);assert.match((result.stdout||'')+(result.stderr||''),/EVENT_IMMUTABLE/);
 }
 console.log('PASS local D1 rejects immutable event UPDATE and DELETE');
}finally{server.kill('SIGTERM');closeSync(fd);}

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const code=readFileSync('scripts/release-production.mjs','utf8');
test('manual production release refuses to run without explicit approval',()=>{
 const r=spawnSync(process.execPath,['scripts/release-production.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Missing explicit owner authorization/);
});
test('release checks off-Git backup, CI, Wrangler migration version and worker deploy in that order',()=>{
 const expected=['RESTORE_DRILL_VERIFIED','PRIVATE_BACKUP_KEY_ROOT','PRIVATE_BACKUP_ROOT',"['test']","scripts/private-db-backup.mjs","'migrations','apply'","MAX(version)","'deploy'"];
 for(const item of expected)assert.ok(code.includes(item),'Expected production gate: '+item);
 assert.ok(code.indexOf('scripts/private-db-backup.mjs')<code.indexOf("'migrations','apply'"));
 assert.ok(code.indexOf("'migrations','apply'")<code.lastIndexOf("'deploy'"));
});

test('release evidence rejects missing external verification, stale evidence and wrong candidate',async()=>{
 const {verifyReleaseEvidence,REQUIRED_GATES}=await import('../scripts/release-evidence.mjs');
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'release-evidence-')),file=join(dir,'evidence.json'),sha='a'.repeat(40);
 try{
  assert.throws(()=>verifyReleaseEvidence(undefined,sha),/REQUIRED/);
  writeFileSync(file,JSON.stringify({commit:sha,verified_at:new Date().toISOString(),gates:{}}));
  assert.throws(()=>verifyReleaseEvidence(file,sha),/staging_e2e/);
  assert.throws(()=>verifyReleaseEvidence(file,'b'.repeat(40)),/COMMIT/);
  writeFileSync(file,JSON.stringify({commit:sha,verified_at:'2000-01-01',gates:{}}));
  assert.throws(()=>verifyReleaseEvidence(file,sha),/EXPIRED/);
  assert.ok(REQUIRED_GATES.includes('production_approval'));
 }finally{rmSync(dir,{recursive:true});}
});

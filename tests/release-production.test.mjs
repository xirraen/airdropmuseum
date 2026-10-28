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

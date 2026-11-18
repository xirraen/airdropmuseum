import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const code=readFileSync('scripts/release-production.mjs','utf8');

test('production release still needs an explicit deploy command',()=>{
 const r=spawnSync(process.execPath,['scripts/release-production.mjs'],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Explicit deploy approval required/);
});

test('code-only release preserves live URL, history, D1 and rollback metadata',()=>{
 for(const name of [
  'CLOUDFLARE_API_TOKEN_REQUIRED',
  'PRODUCTION_TARGET_DRIFT','PUBLIC_ROUTE_WOULD_BE_DISABLED',
  'WORKERS_DEV_ROUTE_NOT_ACTIVE','assertLiveSourceIncluded',
  'PRODUCTION_CHANGED_DURING_RELEASE','ROLLBACK_VERSION_ID',
  'PENDING_SCHEMA_MIGRATIONS','SELECT name FROM d1_migrations',
  'PRAGMA foreign_key_check','POST_DEPLOY_PUBLIC_SMOKE_FAILED'
 ])assert.ok(code.includes(name),name);
 assert.ok(!code.includes("'migrations','apply'"),'Release cannot modify D1');
 assert.ok(!code.includes('verifyReleaseEvidence'),'No external 13-gate review required for code-only release');
 assert.ok(!code.includes('PRIVATE_BACKUP_ROOT'),'Code-only release does not access user backups');
 assert.ok(code.indexOf('PENDING_SCHEMA_MIGRATIONS')<code.lastIndexOf("'deploy'"));
});

test('staging generator explicitly retains its isolated workers.dev route',()=>{
 const source=readFileSync('scripts/create-staging-config.mjs','utf8');
 assert.ok(source.includes('config.workers_dev=true;'));
});

test('readiness does not depend on obsolete AUD status or external evidence files',()=>{
 const source=readFileSync('scripts/release-readiness.mjs','utf8');
 assert.ok(source.includes('ready_for_code_only_release'));
 assert.ok(source.includes('assertLiveSourceIncluded'));
 assert.ok(!source.includes('verifyReleaseEvidence'));
 assert.ok(!source.includes('requiredReleaseGates'));
 assert.ok(!source.includes('RELEASE_EVIDENCE_FILE'));
});

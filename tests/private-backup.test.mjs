import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyBackup} from '../scripts/verify-private-backup.mjs';
const schema="CREATE TABLE am_core_schema(version INTEGER);INSERT INTO am_core_schema VALUES(5);CREATE TABLE d1_migrations(id INTEGER,name TEXT);INSERT INTO d1_migrations VALUES(1,'0001_core.sql');CREATE TABLE profiles(id TEXT PRIMARY KEY,note TEXT);INSERT INTO profiles VALUES('owner','private backup content');";
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'museum-private-backup-'));try{fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
test('private backup restores all inventoried tables and records checkpoint without personal payload in manifest',()=>fixture(dir=>{
 const path=join(dir,'export.sql');writeFileSync(path,schema);const m=verifyBackup(path,join(dir,'restore.sqlite'),['profiles']);
 assert.equal(m.table_counts.profiles,1);assert.equal(m.schema,5);assert.deepEqual(m.migrations,['0001_core.sql']);assert.match(m.sha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(m).includes('private backup content'),false);
}));
test('private backup rejects omitted business tables and absent migration history',()=>fixture(dir=>{
 const path=join(dir,'export.sql');writeFileSync(path,schema);assert.throws(()=>verifyBackup(path,join(dir,'missing-table.sqlite'),['wallets']),/BACKUP_TABLE_MISSING/);
 writeFileSync(path,'CREATE TABLE am_core_schema(version INTEGER);');assert.throws(()=>verifyBackup(path,join(dir,'missing-checkpoint.sqlite')),/BACKUP_CHECKPOINT_MISSING/);
}));
test('private backup rejects orphaned data even if export disables foreign keys',()=>fixture(dir=>{
 const path=join(dir,'export.sql');writeFileSync(path,"PRAGMA foreign_keys=OFF;"+schema+"CREATE TABLE children(parent TEXT REFERENCES profiles(id));INSERT INTO children VALUES('missing');");
 assert.throws(()=>verifyBackup(path,join(dir,'orphaned.sqlite')),/BACKUP_FOREIGN_KEYS_FAILED/);
}));

test('remote restore rejects production and historical staging before reading backup or invoking Wrangler',()=>{for(const id of ['4e75c8b9-6c58-4bac-a180-01e5bec0d0a3','461404c7-a2c6-4222-bb13-6aa26fce2332','invalid']){const result=spawnSync(process.execPath,['scripts/restore-private-backup.mjs'],{encoding:'utf8',env:{...process.env,RESTORE_STAGING_D1_ID:id,PRIVATE_BACKUP_DIRECTORY:'/nonexistent'}});assert.notEqual(result.status,0);assert.match(result.stderr,/FRESH_STAGING_DATABASE_REQUIRED/);assert.equal(result.stderr.includes('ENOENT'),false);}});

test('synthetic E2E harness refuses production even when staging is explicitly enabled',()=>{for(const origin of ['https://airdrop-museum.xirraen.workers.dev','https://other.example.org']){const r=spawnSync(process.execPath,['scripts/runtime-checks.mjs'],{encoding:'utf8',timeout:3000,env:{...process.env,STAGING_SYNTHETIC_E2E:'1',STAGING_TEST_BOT_TOKEN:'synthetic',RUNTIME_TEST_ORIGIN:origin}});assert.notEqual(r.status,0);assert.match(r.stderr,/dedicated synthetic staging origin/);}});

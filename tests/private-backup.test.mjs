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

test('retention prune is dry-run by default and cannot delete unknown or recent directories',async()=>{
 const {pruneBackups}=await import('../scripts/prune-private-backups.mjs');const {mkdirSync,existsSync}=await import('node:fs');
 fixture(root=>{const now=Date.parse('2026-10-29T00:00:00Z');for(const [name,age,format] of [['expired',31,'private-d1-backup-v1'],['fresh',1,'private-d1-backup-v1'],['unrelated',90,'other']]){mkdirSync(join(root,name));writeFileSync(join(root,name,'manifest.json'),JSON.stringify({format,created_at:new Date(now-age*86400000).toISOString(),source_database_id:'4e75c8b9-6c58-4bac-a180-01e5bec0d0a3'}));}assert.equal(pruneBackups(root,{now}).expired,1);assert.ok(existsSync(join(root,'expired')));assert.equal(pruneBackups(root,{now,apply:true}).removed,1);assert.ok(existsSync(join(root,'fresh')));assert.ok(existsSync(join(root,'unrelated')));mkdirSync(join(root,'.git'));assert.throws(()=>pruneBackups(root,{now,apply:true}),/BACKUP_ROOT_IS_GIT_REPOSITORY/);});
});

test('privacy replay refuses production in either letter case, historical staging and the active synthetic source',()=>{
 for(const id of ['4e75c8b9-6c58-4bac-a180-01e5bec0d0a3','4E75C8B9-6C58-4BAC-A180-01E5BEC0D0A3','461404c7-a2c6-4222-bb13-6aa26fce2332','dbdc0402-dd9a-4548-bea1-f5f1f2af5aa0']){const r=spawnSync(process.execPath,['--experimental-strip-types','scripts/reapply-journal-erasure.mjs'],{encoding:'utf8',timeout:3000,env:{...process.env,RESTORE_STAGING_D1_ID:id}});assert.notEqual(r.status,0);assert.match(r.stderr,/ISOLATED_RESTORE_TARGET_REQUIRED/);}
});

test('encrypted backup authenticates the full SQL export and wrong keys/tampering leave no plaintext',async()=>{
 const {encryptBackup,decryptBackup}=await import('../scripts/backup-crypto.mjs');const {readFileSync,existsSync}=await import('node:fs');
 fixture(root=>{const input=join(root,'source.sql'),sealed=join(root,'sealed'),key=join(root,'key');writeFileSync(input,schema);const info=encryptBackup(input,sealed,key);const result=decryptBackup(sealed,join(root,'restored.sql'),key);assert.equal(result.sha256,info.plaintext_sha256);assert.equal(readFileSync(join(root,'restored.sql'),'utf8'),schema);writeFileSync(join(root,'wrong-key'),Buffer.alloc(32));assert.throws(()=>decryptBackup(sealed,join(root,'bad.sql'),join(root,'wrong-key')));assert.equal(existsSync(join(root,'bad.sql')),false);const bytes=readFileSync(sealed);bytes[bytes.length-1]^=1;writeFileSync(join(root,'tampered'),bytes);assert.throws(()=>decryptBackup(join(root,'tampered'),join(root,'tampered.sql'),key));assert.equal(existsSync(join(root,'tampered.sql')),false);});
});

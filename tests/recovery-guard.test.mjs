import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const source='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const restore='a0bcde01-1234-4567-89ab-001122334455';
function workspace(fn){
 const root=mkdtempSync(join(tmpdir(),'am-recovery-policy-'));
 try{return fn(root);}finally{rmSync(root,{recursive:true,force:true});}
}
function launch(script,env){
 return spawnSync(process.execPath,[script],{
  encoding:'utf8',timeout:15000,
  env:{PATH:process.env.PATH,HOME:process.env.HOME,...env}
 });
}

test('remote restore refuses plaintext-only production backups before any remote request',()=>workspace(root=>{
 const folder=join(root,'backup');mkdirSync(folder);
 writeFileSync(join(folder,'manifest.json'),JSON.stringify({
  format:'private-d1-backup-v1',source_database_id:source,
  local_restore_verified:true,sha256:'a'.repeat(64)
 }));
 // An unencrypted dump must never become an accepted recovery source.
 writeFileSync(join(folder,'production.sql'),'SELECT 1');
 const r=launch('scripts/restore-private-backup.mjs',{
  PRIVATE_BACKUP_DIRECTORY:folder,RESTORE_STAGING_D1_ID:restore,
  CLOUDFLARE_API_TOKEN:'synthetic'
 });
 assert.equal(r.status,1,r.stderr);
 assert.match(r.stderr,/ENCRYPTED_BACKUP_REQUIRED/);
 assert.doesNotMatch(r.stderr,/CLOUDFLARE_FORENSIC_API_FAILED|RESTORE_TARGET_CLOUDFLARE_READ_FAILED/);
}));

test('remote restore rejects inconsistent encryption manifest before fetching a database',()=>workspace(root=>{
 const folder=join(root,'backup');mkdirSync(folder);
 const base={
  format:'private-d1-backup-v1',source_database_id:source,
  local_restore_verified:true,sha256:'a'.repeat(64),
  encrypted:{
   algorithm:'AES-256-GCM-v1',file:'production.sql.aesgcm',
   key_id:'b218c22b-2ad1-4380-9f53-7a47a40ae004',
   ciphertext_sha256:'b'.repeat(64),plaintext_sha256:'c'.repeat(64)
  }
 };
 writeFileSync(join(folder,'manifest.json'),JSON.stringify(base));
 const r=launch('scripts/restore-private-backup.mjs',{
  PRIVATE_BACKUP_DIRECTORY:folder,RESTORE_STAGING_D1_ID:restore,
  CLOUDFLARE_API_TOKEN:'synthetic'
 });
 assert.equal(r.status,1,r.stderr);
 assert.match(r.stderr,/ENCRYPTED_BACKUP_MANIFEST_INVALID/);
}));

test('backup runner rejects nested backup and private-key directories in both directions',()=>workspace(root=>{
 const examples=[
  {backup:join(root,'keys','backup'),keys:join(root,'keys')},
  {backup:join(root,'backup'),keys:join(root,'backup','keys')},
  {backup:join(root,'same'),keys:join(root,'same')}
 ];
 for(const {backup,keys} of examples){
  mkdirSync(backup,{recursive:true});mkdirSync(keys,{recursive:true});
  const r=launch('scripts/private-db-backup.mjs',{
   PRIVATE_BACKUP_ROOT:backup,PRIVATE_BACKUP_KEY_ROOT:keys,
   CLOUDFLARE_API_TOKEN:'synthetic'
  });
  assert.equal(r.status,1,r.stderr);
  assert.match(r.stderr,/BACKUP_KEYS_MUST_BE_SEPARATE/);
 }
}));

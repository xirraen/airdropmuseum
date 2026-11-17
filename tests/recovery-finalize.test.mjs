import test from 'node:test';
import assert from 'node:assert/strict';
import {
 mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync,existsSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {encryptBackup} from '../scripts/backup-crypto.mjs';

const runner='scripts/finalize-isolated-recovery.mjs';
const account='9880cf2cc57c2096f8c3ae253d9852e6';
const prod='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const target='8dd6f86a-7d64-4d3e-aaee-df7207fcc44b';

test('finalize requires explicit owner source-freeze and mutation approval',()=>{
 const r=spawnSync(process.execPath,[runner,'--execute'],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}
 });
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Explicit finalize approval and source-write-freeze confirmation required/);
});

test('post-import finalizer cannot issue a new export, SQL import or Worker deployment',()=>{
 const source=readFileSync(runner,'utf8');
 assert.doesNotMatch(source,/scripts\/private-db-backup\.mjs/);
 assert.doesNotMatch(source,/--file|wrangler deploy|workers\/scripts\/.*\/content/);
 assert.match(source,/verifyRestoreTarget/);
 assert.match(source,/restore-import\.log/);
 assert.match(source,/journal_erasure_receipts/);
 assert.match(source,/LIVE_SOURCE_MUST_BE_READ_ONLY/);
});

test('post-import preflight verifies sealed archive, every table count, schema, migrations, FK and source mode without remote writes',()=>{
 const root=mkdtempSync(join(tmpdir(),'am-finalize-recovery-'));
 try{
  const backups=join(root,'backups'),keys=join(root,'keys'),folder=join(backups,'completed-archive');
  mkdirSync(folder,{recursive:true,mode:0o700});mkdirSync(keys,{mode:0o700});
  const src=join(folder,'fake-dump.sql'),keyId=randomUUID();
  writeFileSync(src,'synthetic-only');
  const encrypted=encryptBackup(src,join(folder,'production.sql.aesgcm'),join(keys,keyId+'.key'));
  const migrations=readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort();
  const original={
   format:'private-d1-backup-v1',sha256:encrypted.plaintext_sha256,
   local_restore_verified:true,remote_restore_verified:false,
   source_database_id:prod,migrations,
   table_counts:{am_core_schema:1,d1_migrations:migrations.length,private_items:3},
   encrypted:{...encrypted,key_id:keyId,file:'production.sql.aesgcm'}
  };
  writeFileSync(join(folder,'manifest.json'),JSON.stringify(original));
  for(const name of [
   'restore-import.log','restore-migrations.log','restore-schema.log',
   'restore-foreign-keys.log','restore-post-migration-foreign-keys.log'
  ])writeFileSync(join(folder,name),'synthetic');
  const preloader=join(root,'fetch-preloader.mjs');
  writeFileSync(preloader,[
   "globalThis.fetch=async (url,opts)=>{",
   "  if(opts.method==='GET'){",
   "    if(url.endsWith('/d1/database/"+target+"'))return {ok:true,json:async()=>({success:true,result:{uuid:'"+target+"',name:'airdrop-museum-restore-drill-20261118',created_at:new Date().toISOString()}})};",
   "    if(url.endsWith('/workers/scripts'))return {ok:true,json:async()=>({success:true,result:[]})};",
   "    throw Error('UNEXPECTED_GET '+url);",
   "  }",
   "  if(opts.method!=='POST')throw Error('UNEXPECTED_MUTATION');",
   "  const sql=JSON.parse(opts.body).sql;",
   "  if(!/^(SELECT|PRAGMA (foreign_key_check|quick_check))/i.test(sql))throw Error('UNEXPECTED_SQL_WRITE: '+sql);",
   "  let results=[];",
   "  if(sql.includes('sqlite_master'))results=[{name:'am_core_schema'},{name:'d1_migrations'},{name:'private_items'}];",
   "  else if(sql.includes('table_name, COUNT(*) n'))results=[...sql.matchAll(/SELECT '([^']+)' table_name, COUNT\\(\\*\\) n FROM \"([^\"]+)\"/g)].map(m=>({table_name:m[1],n:({am_core_schema:1,d1_migrations:"+migrations.length+",private_items:3})[m[1]]}));",
   "  else if(sql.includes('MAX(version)'))results=[{version:17}];",
   "  else if(sql.includes('SELECT name FROM d1_migrations'))results="+JSON.stringify(migrations.map(x=>({name:x})))+";",
   "  else if(sql.includes('PRAGMA quick_check'))results=[{quick_check:'ok'}];",
   "  else if(sql.includes(\"SELECT value FROM system_settings\"))results=[{value:'\"normal\"'}];",
   "  else if(sql.includes('PRAGMA foreign_key_check'))results=[];",
   "  else throw Error('UNRECOGNIZED_SQL '+sql);",
   "  return {ok:true,json:async()=>({success:true,result:[{success:true,results,meta:{changed_db:false,rows_written:0}}]})};",
   "};"
  ].join('\n'));
  const r=spawnSync(process.execPath,['--import',preloader,runner,'--preflight'],{
   encoding:'utf8',timeout:45000,
   env:{PATH:process.env.PATH,HOME:process.env.HOME,
    CLOUDFLARE_API_TOKEN:'SYNTHETIC',PRIVATE_BACKUP_ROOT:backups,
    PRIVATE_BACKUP_DIRECTORY:folder,PRIVATE_BACKUP_KEY_ROOT:keys,
    RESTORE_STAGING_ACCOUNT_ID:account,RESTORE_STAGING_D1_ID:target}
  });
  assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(r.stdout);
  assert.equal(report.status,'RESTORED_D1_VERIFIED_SOURCE_NOT_READ_ONLY');
  assert.equal(report.archive_authenticated,true);
  assert.equal(report.all_backup_row_counts_match,true);
  assert.equal(report.application_tables,3);
  assert.equal(report.privacy_replay_completed,false);
  assert.equal(existsSync(join(folder,'recovery-drill-evidence.json')),false);
  assert.equal(existsSync(join(folder,'restore-evidence.json')),false);
  assert.deepEqual(JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8')),original);
 }finally{rmSync(root,{recursive:true,force:true});}
});

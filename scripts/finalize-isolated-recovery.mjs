/**
 * Finalize an already imported, isolated production D1 backup WITHOUT
 * exporting production again or re-importing the nonempty target.
 *
 * --preflight: authenticated archive, live isolated target, full table/count,
 * schema, migration and FK verification; no writes anywhere.
 *
 * --execute: operator-approved, source-write-frozen privacy erasure replay on
 * the isolated target only. Writes restricted private evidence afterward.
 * NO production D1 write, Worker deployment or D1 import.
 */
import {
 readFileSync,writeFileSync,existsSync,realpathSync,readdirSync,
 openSync,closeSync,unlinkSync,rmSync,renameSync
} from 'node:fs';
import {resolve,join,relative,isAbsolute,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {verifyRestoreTarget} from './verify-restore-target.mjs';
import {resolveNewPrivateBackupFolder} from './recovery-path.mjs';
import {decryptBackup} from './backup-crypto.mjs';
import {validatedD1Results} from './d1-replay-results.mjs';

process.umask(0o077);
const PROD_ACCOUNT='9880cf2cc57c2096f8c3ae253d9852e6';
const PROD_DATABASE='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const mode=process.argv[2];
const fail=reason=>{throw Error('ISOLATED_RECOVERY_FINALIZE_BLOCKED: '+reason);};
if(process.argv.length!==3||!['--preflight','--execute'].includes(mode))
 fail('Specify --preflight or --execute');
if(mode==='--execute'&&(process.env.AIRDROP_RECOVERY_FINALIZE!=='APPROVED'||
 process.env.AIRDROP_SOURCE_FREEZE_CONFIRMED!=='APPROVED'))
 fail('Explicit finalize approval and source-write-freeze confirmation required');
const account=process.env.RESTORE_STAGING_ACCOUNT_ID||PROD_ACCOUNT;
const target=process.env.RESTORE_STAGING_D1_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token||!target)fail('Cloudflare token and RESTORE_STAGING_D1_ID required');
if(account!==PROD_ACCOUNT)fail('RECOVERY_ACCOUNT_MISMATCH');
const rootInput=process.env.PRIVATE_BACKUP_ROOT,dirInput=process.env.PRIVATE_BACKUP_DIRECTORY;
const keyInput=process.env.PRIVATE_BACKUP_KEY_ROOT;
if(!rootInput||!dirInput||!keyInput||
 ![rootInput,dirInput,keyInput].every(isAbsolute))
 fail('Absolute private backup root, folder and separate key root required');
const root=realpathSync(rootInput),keys=realpathSync(keyInput),repo=realpathSync('.');
const outside=(a,b)=>{
 const r=relative(a,b);
 return r==='..'||r.startsWith('..'+sep)||isAbsolute(r);
};
if(!outside(repo,root)||!outside(repo,keys)||
 !outside(root,keys)||!outside(keys,root))
 fail('Private roots must remain separate from each other and from Git');
const folder=resolveNewPrivateBackupFolder(root,relative(root,resolve(dirInput)));
const required=['manifest.json','production.sql.aesgcm','restore-import.log',
 'restore-migrations.log','restore-schema.log','restore-foreign-keys.log',
 'restore-post-migration-foreign-keys.log'];
if(required.some(name=>!existsSync(join(folder,name))))
 fail('Incomplete imported-backup evidence; do not replay privacy');
const manifestPath=join(folder,'manifest.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
if(manifest.format!=='private-d1-backup-v1'||!manifest.local_restore_verified||
 manifest.source_database_id!==PROD_DATABASE||
 manifest.encrypted?.algorithm!=='AES-256-GCM-v1'||
 manifest.encrypted?.file!=='production.sql.aesgcm'||
 !/^[a-f0-9-]{36}$/.test(manifest.encrypted.key_id||'')||
 !/^[a-f0-9]{64}$/.test(manifest.sha256||'')||
 !/^[a-f0-9]{64}$/.test(manifest.encrypted.ciphertext_sha256||'')||
 manifest.encrypted.plaintext_sha256!==manifest.sha256)
 fail('Encrypted source backup manifest invalid');
if(manifest.remote_restore_verified||existsSync(join(folder,'recovery-drill-evidence.json'))||
 existsSync(join(folder,'restore-evidence.json')))
 fail('Recovery already finalized or partially finalized; operator review required');
const archive=join(folder,manifest.encrypted.file);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(readFileSync(archive))!==manifest.encrypted.ciphertext_sha256)
 fail('Encrypted source backup ciphertext checksum mismatch');
// AES-256-GCM authentication prevents accepting an unverified archive
// metadata file as sufficient evidence of the source backup's identity.
const disposable=join(folder,'finalize-auth-'+randomUUID()+'.sql');
try{
 const decoded=decryptBackup(archive,disposable,join(keys,manifest.encrypted.key_id+'.key'));
 if(decoded.sha256!==manifest.sha256||sha(readFileSync(disposable))!==manifest.sha256)
  fail('Encrypted source backup could not be authenticated');
}finally{rmSync(disposable,{force:true});}

const isolation=await verifyRestoreTarget({accountId:account,databaseId:target,token});
const databaseQuery=async(id,sql)=>{
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+
  PROD_ACCOUNT+'/d1/database/'+id+'/query',{
  method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({sql}),
  signal:AbortSignal.timeout(60000)
 });
 if(!response.ok)fail('Cloudflare read-only SQL HTTP error '+response.status);
 const payload=await response.json();
 let statements;
 try{statements=validatedD1Results(payload,1,{readOnly:true});}
 catch{fail('Read-only D1 query failed or reported a write');}
 return statements[0].results;
};
const tables=Object.keys(manifest.table_counts||{});
if(!tables.length||tables.length>500||
 tables.some(t=>!/^[A-Za-z_][A-Za-z_0-9]*$/.test(t)||
 !Number.isSafeInteger(manifest.table_counts[t])||manifest.table_counts[t]<0))
 fail('Source inventory invalid');
const actualTables=(await databaseQuery(target,
 "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name")).map(x=>x.name).sort();
if(JSON.stringify([...tables].sort())!==JSON.stringify(actualTables))
 fail('Restored D1 table inventory differs from authenticated backup');
const counts=[];
for(let offset=0;offset<tables.length;offset+=10){
 const sql=tables.slice(offset,offset+10).map(t=>
  "SELECT '"+t+"' table_name, COUNT(*) n FROM \""+t+"\"").join(' UNION ALL ');
 counts.push(...await databaseQuery(target,sql));
}
if(counts.length!==tables.length||
 counts.some(x=>x.n!==manifest.table_counts[x.table_name]))
 fail('Restored D1 row counts differ from backup');
const schema=(await databaseQuery(target,'SELECT MAX(version) version FROM am_core_schema'))[0]?.version;
if(schema!==17)fail('Restored release schema must be 17');
const migrations=(await databaseQuery(target,'SELECT name FROM d1_migrations ORDER BY id')).map(x=>x.name);
const expected=readdirSync(resolve('migrations')).filter(x=>x.endsWith('.sql')).sort();
if(migrations.length!==expected.length||expected.some(x=>!migrations.includes(x))||
 manifest.migrations.some(x=>!migrations.includes(x)))
 fail('Restored migrations differ from release and source backup');
if((await databaseQuery(target,'PRAGMA foreign_key_check')).length)
 fail('Restored D1 foreign keys invalid');
const check=(await databaseQuery(target,'PRAGMA quick_check'))[0]?.quick_check;
if(check!=='ok')fail('Restored D1 quick_check failed');
const sourceMode=async()=>{
 const row=(await databaseQuery(PROD_DATABASE,
  "SELECT value FROM system_settings WHERE key='maintenance_mode'"))[0];
 let value;
 try{value=JSON.parse(row?.value||'"normal"');}catch{fail('Production maintenance mode invalid');}
 return value;
};
const liveMode=await sourceMode();
const ready=['read_only','maintenance'].includes(liveMode);
if(mode==='--preflight'){
 console.log(JSON.stringify({
  status:ready?'RESTORED_D1_VERIFIED_AWAITING_OPERATOR_FREEZE_CONFIRMATION':
   'RESTORED_D1_VERIFIED_SOURCE_NOT_READ_ONLY',
  target_database_id:target,source_maintenance_mode:liveMode,
  restored_schema:schema,application_tables:tables.length,migrations:migrations.length,
  foreign_keys:'ok',quick_check:'ok',all_backup_row_counts_match:true,
  archive_authenticated:true,no_worker_deployed_or_database_written:true,
  privacy_replay_completed:false
 },null,2));
 process.exit(0);
}
if(!ready)fail('LIVE_SOURCE_MUST_BE_READ_ONLY');
// Prevent concurrent restore attempts; all replay writes target ONLY.
if(existsSync(join(root,'.recovery-drill.lock')))
 fail('Concurrent recovery drill lock present');
const lock=join(root,'.recovery-finalize.lock');
let handle;
try{handle=openSync(lock,'wx',0o600);}catch{fail('Recovery finalize is already running or stale lock needs review');}
try{
 writeFileSync(handle,JSON.stringify({pid:process.pid,target,started_at:new Date().toISOString()})+'\n');
 closeSync(handle);handle=undefined;
 // Recheck isolation and source freeze right before replay, not only at start.
 const latest=await verifyRestoreTarget({accountId:account,databaseId:target,token});
 if(latest.created_at!==isolation.created_at||latest.database_id!==isolation.database_id)
  fail('Isolated restore target identity changed');
 if(!['read_only','maintenance'].includes(await sourceMode()))
  fail('Production write freeze was released before replay');
 const evidencePath=join(folder,'privacy-replay-evidence.json');
 const childEnv={
  PATH:process.env.PATH,HOME:process.env.HOME,
  CLOUDFLARE_API_TOKEN:token,RESTORE_STAGING_ACCOUNT_ID:account,
  RESTORE_STAGING_D1_ID:target,PRIVATE_REPLAY_EVIDENCE_FILE:evidencePath
 };
 const replay=spawnSync(process.execPath,['scripts/reapply-journal-erasure.mjs'],{
  cwd:repo,env:childEnv,encoding:'utf8',timeout:10*60*1000,maxBuffer:1024*1024
 });
 writeFileSync(join(folder,'restore-privacy-replay-finalize.log'),
  (replay.stdout||'')+(replay.stderr||''),{mode:0o600});
 if(replay.error||replay.status!==0)
  fail('Privacy replay not complete; inspect PRIVATE restore-privacy-replay-finalize.log');
 if(!existsSync(evidencePath))
  fail('Privacy replay returned without required private evidence');
 const replayData=JSON.parse(readFileSync(evidencePath,'utf8'));
 if(replayData.database_id!==target||replayData.target_account_id!==account||
  replayData.restored_schema!==17||
  !Number.isSafeInteger(replayData.receipts_applied)||replayData.receipts_applied<0||
  !Number.isSafeInteger(replayData.live_receipts_checked)||replayData.live_receipts_checked<0)
  fail('Privacy replay evidence target or counts invalid');
 // Recheck source freeze/outbox consistency after replay; a full replay
 // rerun must be performed if there is a changed or unsynced erasure.
 if(!['read_only','maintenance'].includes(await sourceMode()))
  fail('Production source freeze was released during replay');
 const pending=(await databaseQuery(PROD_DATABASE,
  'SELECT COUNT(*) n FROM journal_erasure_receipts WHERE ledger_synced=0'))[0]?.n;
 if(pending!==0)fail('New live erasure outbox events are pending');
 if((await databaseQuery(target,'PRAGMA foreign_key_check')).length)
  fail('Post-replay foreign keys invalid');
 const restored={
  backup_sha256:manifest.sha256,staging_account_id:account,
  staging_database_id:target,restored_counts:counts,migrations,schema,
  all_backup_row_counts_matched_before_erasure_replay:true,
  privacy_replay_evidence_file:'privacy-replay-evidence.json',
  verified_at:new Date().toISOString()
 };
 const completed={
  status:'PRIVATE_RECOVERY_DRILL_COMPLETED_NOT_RELEASE_APPROVED',
  source_database_id:PROD_DATABASE,restore_database_id:target,restore_account_id:account,
  backup_ciphertext_sha256:manifest.encrypted.ciphertext_sha256,
  backup_plaintext_sha256:manifest.sha256,recovery_schema:schema,
  receipts_applied:replayData.receipts_applied,verified_at:new Date().toISOString(),
  operator_review_required:true,
  note:'Source was frozen for replay. This is not production release approval.'
 };
 function atomicJson(path,value){
  const tmp=path+'.writing-'+randomUUID();
  try{
   writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
   renameSync(tmp,path);
  }finally{rmSync(tmp,{force:true});}
 }
 atomicJson(join(folder,'restore-evidence.json'),restored);
 atomicJson(manifestPath,{...manifest,remote_restore_verified:true,remote_restore_database_id:target});
 atomicJson(join(folder,'recovery-drill-evidence.json'),completed);
 console.log(JSON.stringify({
  status:completed.status,restore_database_id:target,
  application_tables:tables.length,replay_receipts:replayData.receipts_applied,
  no_production_database_write:true,no_worker_deployed:true
 },null,2));
}finally{
 if(handle!==undefined)closeSync(handle);
 unlinkSync(lock);
}

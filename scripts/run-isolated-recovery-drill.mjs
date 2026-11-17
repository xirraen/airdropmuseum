/**
 * Operator-only recovery drill: authenticated encrypted export of live D1,
 * isolated remote restore, privacy erasure replay, and evidence checks.
 *
 * NO Worker upload. NO production SQL writes. Never stores the key in Git.
 * Explicit --execute + AIRDROP_RECOVERY_DRILL=APPROVED are required.
 * Use --preflight to inspect target bindings without producing any data.
 */
import {verifyRestoreTarget} from './verify-restore-target.mjs';
import {resolveNewPrivateBackupFolder} from './recovery-path.mjs';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync,mkdirSync,readdirSync,realpathSync,readFileSync,writeFileSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {resolve,isAbsolute,relative,sep,join} from 'node:path';

const PROD_ACCOUNT='9880cf2cc57c2096f8c3ae253d9852e6';
const PROD_DATABASE='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const fail=reason=>{throw Error('ISOLATED_RECOVERY_BLOCKED: '+reason);};
const args=process.argv.slice(2);
if(args.length!==1||!['--preflight','--execute'].includes(args[0]))
 fail('Specify --preflight or --execute');
if(args[0]==='--execute'&&process.env.AIRDROP_RECOVERY_DRILL!=='APPROVED')
 fail('Explicit operator recovery approval required');
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token)fail('CLOUDFLARE_API_TOKEN missing');
const accountId=process.env.RESTORE_STAGING_ACCOUNT_ID||PROD_ACCOUNT;
const databaseId=process.env.RESTORE_STAGING_D1_ID;
if(!databaseId)fail('RESTORE_STAGING_D1_ID missing');
if(databaseId.toLowerCase()===PROD_DATABASE)fail('PRODUCTION_DATABASE_REFUSED');
const target=await verifyRestoreTarget({accountId,databaseId,token});
if(args[0]==='--preflight'){
 console.log(JSON.stringify({...target,operation:'PREFLIGHT_ONLY_NO_DATA_READ_OR_WRITE'},null,2));
 process.exit(0);
}
const rootInput=process.env.PRIVATE_BACKUP_ROOT,keysInput=process.env.PRIVATE_BACKUP_KEY_ROOT;
if(!rootInput||!keysInput||!isAbsolute(rootInput)||!isAbsolute(keysInput))
 fail('Absolute PRIVATE_BACKUP_ROOT and PRIVATE_BACKUP_KEY_ROOT required');
const repoRoot=realpathSync('.');
function outsideRepo(path){
 const rel=relative(repoRoot,path);
 if(!rel||rel!== '..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))
  fail('Recovery directories must remain outside repository');
}
outsideRepo(resolve(rootInput));
outsideRepo(resolve(keysInput));
mkdirSync(rootInput,{recursive:true,mode:0o700});
const root=realpathSync(rootInput);
outsideRepo(root);
// Key storage must not be created by an untrusted child of the backup folder.
const keys=resolve(keysInput);
const relativeKey=relative(root,keys),relativeBackup=relative(keys,root);
const outside=rel=>rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel);
if(!relativeKey||!relativeBackup||!outside(relativeKey)||!outside(relativeBackup))
 fail('Backup and private key roots overlap');
const lock=join(root,'.recovery-drill.lock');
let handle;
try{handle=openSync(lock,'wx',0o600);}catch{fail('Another recovery drill is running or its lock requires owner review');}
try{
 writeFileSync(handle,JSON.stringify({pid:process.pid,started_at:new Date().toISOString(),target:databaseId})+'\n');
 closeSync(handle);handle=undefined;
 const before=new Set(readdirSync(root));
 // Avoid forwarding unrelated env secrets to Wrangler or other child processes.
 const env={
  PATH:process.env.PATH,
  HOME:process.env.HOME,
  CLOUDFLARE_API_TOKEN:token,
  PRIVATE_BACKUP_ROOT:root,
  PRIVATE_BACKUP_KEY_ROOT:keys,
  RESTORE_STAGING_ACCOUNT_ID:accountId,
  RESTORE_STAGING_D1_ID:databaseId,
  WRANGLER_SEND_METRICS:'false',
  CI:'true'
 };
 const execute=(script,extra={})=>{
  const result=spawnSync(process.execPath,[script],{
   cwd:repoRoot,env:{...env,...extra},encoding:'utf8',timeout:20*60*1000,maxBuffer:8*1024*1024
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.error||result.status!==0)fail('Operator step failed: '+script+'; see private evidence directory');
 };
 execute('scripts/private-db-backup.mjs');
 const candidates=readdirSync(root).filter(x=>!before.has(x)&&x!=='.recovery-drill.lock');
 if(candidates.length!==1)fail('Cannot uniquely identify newly created encrypted backup');
 const folder=resolveNewPrivateBackupFolder(root,candidates[0]);
 const manifest=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
 if(manifest.format!=='private-d1-backup-v1'||!manifest.local_restore_verified||
    manifest.remote_restore_verified!==false||!manifest.encrypted||
    manifest.source_database_id!==PROD_DATABASE)
  fail('BACKUP_MANIFEST_NOT_VERIFIED');
 execute('scripts/restore-private-backup.mjs',{PRIVATE_BACKUP_DIRECTORY:folder});
 const complete=JSON.parse(readFileSync(join(folder,'manifest.json'),'utf8'));
 const evidence=JSON.parse(readFileSync(join(folder,'restore-evidence.json'),'utf8'));
 if(!complete.remote_restore_verified||
    complete.remote_restore_database_id!==databaseId||
    evidence.staging_database_id!==databaseId||
    evidence.staging_account_id!==accountId||evidence.schema!==17||
    evidence.backup_sha256!==complete.sha256||
    !existsSync(join(folder,'privacy-replay-evidence.json')))
  fail('ISOLATED_RESTORE_EVIDENCE_INCOMPLETE');
 const record={
  status:'PRIVATE_RECOVERY_DRILL_COMPLETED_NOT_RELEASE_APPROVED',
  source_database_id:PROD_DATABASE,
  restore_database_id:databaseId,
  restore_account_id:accountId,
  backup_ciphertext_sha256:complete.encrypted.ciphertext_sha256,
  backup_plaintext_sha256:complete.sha256,
  recovery_schema:evidence.schema,
  verified_at:new Date().toISOString(),
  operator_review_required:true,
  note:'Must be reviewed and bound to the approved release commit. Device, staging, load, rollback, dependency audit and release gates are separate.'
 };
 writeFileSync(join(folder,'recovery-drill-evidence.json'),JSON.stringify(record,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({status:record.status,restore_database_id:databaseId,evidence_directory:folder},null,2));
}finally{
 if(handle!==undefined)closeSync(handle);
 unlinkSync(lock);
}

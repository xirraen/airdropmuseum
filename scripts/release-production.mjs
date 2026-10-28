/**
 * Manual operator release. This script cannot be run by GitHub Actions:
 * backup and recovery keys must stay on an operator-controlled private drive.
 *
 * Required: CLOUDFLARE_API_TOKEN, PRIVATE_BACKUP_ROOT, PRIVATE_BACKUP_KEY_ROOT,
 * AIRDROP_PRODUCTION_RELEASE=APPROVED, RESTORE_DRILL_VERIFIED=YES.
 */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
const cfg=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const ACCOUNT='9880cf2cc57c2096f8c3ae253d9852e6',DB='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const reject=reason=>{throw Error('PRODUCTION_RELEASE_BLOCKED: '+reason)};
if(process.env.AIRDROP_PRODUCTION_RELEASE!=='APPROVED')reject('Missing explicit owner authorization');
if(process.env.RESTORE_DRILL_VERIFIED!=='YES')reject('Verify private recovery of a current production backup before release');
if(!process.env.CLOUDFLARE_API_TOKEN)reject('Missing Cloudflare API token');
if(cfg.account_id!==ACCOUNT||cfg.d1_databases?.[0]?.database_id!==DB||cfg.name!=='airdrop-museum')reject('Unexpected production target');
const repo=realpathSync('.');
function privateDirectory(key){
 const p=process.env[key];
 if(!p||!isAbsolute(p)||!existsSync(p))reject('Missing absolute private directory: '+key);
 const r=realpathSync(p),relativePath=relative(repo,r);
 if(!relativePath||relativePath!== '..'&&!relativePath.startsWith('..'+sep)&&!isAbsolute(relativePath))reject('Private directory is inside repository');
 return r;
}
const backup=privateDirectory('PRIVATE_BACKUP_ROOT'),keyRoot=privateDirectory('PRIVATE_BACKUP_KEY_ROOT');
if(backup===keyRoot||backup.startsWith(keyRoot+sep)||keyRoot.startsWith(backup+sep))reject('Backup and key paths must be separate');
const run=(cmd,args,label)=>{console.log('RELEASE STEP:',label);execFileSync(cmd,args,{stdio:'inherit',timeout:600000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}})};
const read=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:60000}).trim();
if(read('git',['branch','--show-current'])!=='main')reject('Run only on main');
if(read('git',['status','--porcelain']))reject('Working tree is dirty');
if(!/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)xirraen\/airdropmuseum(\.git)?$/.test(read('git',['remote','get-url','origin'])))reject('Wrong GitHub repository');
run('npm',['ci'],'Install frozen dependencies');
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler))reject('Wrangler not installed');
for(const [label,args] of [['Lint',['run','lint']],['Typecheck',['run','typecheck']],['Build',['run','build']],['Unit tests',['test']],['Worker runtime tests',['run','test:runtime']],['Audit',['audit','--omit=dev','--audit-level=high']]])run('npm',args,label);
run('node',['scripts/security-scan.mjs'],'Credential scan');
run('node',['--experimental-sqlite','scripts/validate-migrations.mjs'],'Migration validation');
run('node',['scripts/private-db-backup.mjs'],'Encrypted production backup + private SQLite restore');
run('node',[wrangler,'d1','migrations','list','airdrop-museum','--remote','--config','wrangler.jsonc'],'Pending migration review');
run('node',[wrangler,'d1','migrations','apply','airdrop-museum','--remote','--config','wrangler.jsonc'],'Apply pending migrations');
const query=sql=>JSON.parse(read('node',[wrangler,'d1','execute','airdrop-museum','--remote','--config','wrangler.jsonc','--json','--command',sql]))[0]?.results||[];
if(query('SELECT MAX(version) AS v FROM am_core_schema')[0]?.v!==16)reject('Live schema is not version 16; Worker deployment aborted');
if(query('PRAGMA foreign_key_check').length)reject('Live D1 foreign key violations; Worker deployment aborted');
run('node',[wrangler,'deploy','--config','wrangler.jsonc'],'Deploy versioned Worker');
console.log('WORKER_DEPLOYED: now verify Telegram owner session, public API privacy, WalletConnect, and scheduled queues.');

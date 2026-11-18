/**
 * Manual operator release. This script cannot be run by GitHub Actions:
 * backup and recovery keys must stay on an operator-controlled private drive.
 *
 * Required: CLOUDFLARE_API_TOKEN, PRIVATE_BACKUP_ROOT, PRIVATE_BACKUP_KEY_ROOT,
 * AIRDROP_PRODUCTION_RELEASE=APPROVED, RESTORE_DRILL_VERIFIED=YES.
 */
import {verifyReleaseEvidence} from './release-evidence.mjs';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,realpathSync,readdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
const cfg=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const ACCOUNT='9880cf2cc57c2096f8c3ae253d9852e6',DB='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const reject=reason=>{throw Error('PRODUCTION_RELEASE_BLOCKED: '+reason)};
if(process.env.AIRDROP_PRODUCTION_RELEASE!=='APPROVED')reject('Missing explicit owner authorization');
if(process.env.RESTORE_DRILL_VERIFIED!=='YES')reject('Verify private recovery of a current production backup before release');
if(!process.env.CLOUDFLARE_API_TOKEN)reject('Missing Cloudflare API token');
if(cfg.account_id!==ACCOUNT||cfg.d1_databases?.[0]?.database_id!==DB||cfg.name!=='airdrop-museum')reject('Unexpected production target');
// Do not disable the only public workers.dev URL until an alternative route is configured.
if(cfg.workers_dev!==false)reject('WORKERS_DEV_MUST_BE_DISABLED_AFTER_CUSTOM_ROUTE_MIGRATION');
if(!cfg.route&&!(Array.isArray(cfg.routes)&&cfg.routes.length))reject('PUBLIC_CUSTOM_ROUTE_REQUIRED');
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
const candidate=read('git',['rev-parse','HEAD']);
verifyReleaseEvidence(process.env.RELEASE_EVIDENCE_FILE,candidate);
// Refuse to replace an independently deployed feature branch with an older main.
async function productionSnapshot(){
 const base='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+cfg.name;
 const get=async path=>{
  const response=await fetch(base+path,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(15000)});
  if(!response.ok)reject('PRODUCTION_METADATA_READ_FAILED');
  const json=await response.json();
  if(!json.success)reject('PRODUCTION_METADATA_READ_FAILED');
  return json.result;
 };
 const deployments=await get('/deployments'),current=deployments?.deployments?.[0];
 if(!current?.id||current.versions?.length!==1||Number(current.versions[0].percentage)!==100)
  reject('PRODUCTION_TRAFFIC_NOT_EXCLUSIVE');
 const versionId=current.versions[0].version_id;
 const version=await get('/versions/'+encodeURIComponent(versionId));
 const annotations=version?.annotations||{};
 const commit=annotations['workers/commit_sha'];
 if(!/^[a-f0-9]{40}$/.test(commit||'')||
    annotations['workers/repository_url']!=='https://github.com/xirraen/airdropmuseum')
  reject('LIVE_SOURCE_PROVENANCE_UNVERIFIED');
 return {commit,deployment_id:current.id,version_id:versionId};
}
const live=await productionSnapshot();
try{execFileSync('git',['merge-base','--is-ancestor',live.commit,candidate],{stdio:'ignore'});}
catch{reject('LIVE_COMMIT_NOT_ANCESTOR_OF_CANDIDATE');}
run('npm',['ci'],'Install frozen dependencies');
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler))reject('Wrangler not installed');
for(const [label,args] of [['Lint',['run','lint']],['Typecheck',['run','typecheck']],['Build',['run','build']],['Unit tests',['test']],['Worker runtime tests',['run','test:runtime']],['Browser E2E',['run','test:e2e']],['Audit',['audit','--omit=dev','--audit-level=high']]])run('npm',args,label);
run('node',['scripts/security-scan.mjs'],'Credential scan');
run('node',['--experimental-sqlite','scripts/validate-migrations.mjs'],'Migration validation');
run('git',['diff','--exit-code','--','src/worker.mjs','dist/aggregator-ui-bundle.js'],'Verify generated artifact parity');
if(read('git',['status','--porcelain']))reject('Build changed candidate artifacts; commit and reverify');
run('node',['scripts/verify-production-bindings.mjs'],'Verify live binding destinations and deployment credential separation');
run('node',['scripts/private-db-backup.mjs'],'Encrypted production backup + private SQLite restore');
run('node',[wrangler,'d1','migrations','list','airdrop-museum','--remote','--config','wrangler.jsonc'],'Pending migration review');
// Pending migrations require a separate reviewed additive-only release, never an implicit production write.
const query=sql=>JSON.parse(read('node',[wrangler,'d1','execute','airdrop-museum','--remote','--config','wrangler.jsonc','--json','--command',sql]))[0]?.results||[];
const applied=new Set(query('SELECT name FROM d1_migrations').map(row=>row.name));
const migrationFiles=readdirSync('migrations').filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const pending=migrationFiles.filter(name=>!applied.has(name));
if(pending.length)reject('PENDING_MIGRATIONS_REQUIRE_SEPARATE_ADDITIVE_APPROVAL: '+pending.slice(0,8).join(','));
if(Number(query('SELECT MAX(version) AS v FROM am_core_schema')[0]?.v)!==17)reject('Live schema is not version 17; Worker deployment aborted');
if(query('PRAGMA foreign_key_check').length)reject('Live D1 foreign key violations; Worker deployment aborted');
const latest=await productionSnapshot();
if(latest.deployment_id!==live.deployment_id||latest.version_id!==live.version_id)reject('PRODUCTION_DEPLOYMENT_CHANGED_DURING_RELEASE');
run('node',[wrangler,'deploy','--config','wrangler.jsonc'],'Deploy versioned Worker');
console.log('WORKER_DEPLOYED: now verify Telegram owner session, public API privacy, WalletConnect, and scheduled queues.');

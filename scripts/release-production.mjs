/**
 * Operator-run, code-only release for the current production Worker.
 * No migration, D1 write, queue mutation, or secret replacement is performed.
 * Human authorization is a single explicit deployment intent, not 13 audit artifacts.
 */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';

const cfg=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const ACCOUNT='9880cf2cc57c2096f8c3ae253d9852e6';
const DATABASE='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const WORKER='airdrop-museum';
const ORIGIN='https://airdrop-museum.xirraen.workers.dev';
const fail=code=>{throw Error('PRODUCTION_RELEASE_BLOCKED: '+code);};
const exec=(bin,args,label)=>{
 console.log('RELEASE STEP:',label);
 execFileSync(bin,args,{stdio:'inherit',timeout:600000,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'}});
};
const capture=(bin,args)=>execFileSync(bin,args,{encoding:'utf8',timeout:60000}).trim();
const git=(...args)=>capture('git',args);

if(process.env.AIRDROP_PRODUCTION_RELEASE!=='APPROVED')fail('Explicit deploy approval required');
if(!process.env.CLOUDFLARE_API_TOKEN)fail('CLOUDFLARE_API_TOKEN_REQUIRED');
if(cfg.name!==WORKER||cfg.account_id!==ACCOUNT||
 cfg.d1_databases?.[0]?.database_id!==DATABASE)fail('PRODUCTION_TARGET_DRIFT');
if(cfg.workers_dev===false&&!cfg.route&&!(Array.isArray(cfg.routes)&&cfg.routes.length))
 fail('PUBLIC_ROUTE_WOULD_BE_DISABLED');
if(git('branch','--show-current')!=='main')fail('MAIN_BRANCH_REQUIRED');
if(git('status','--porcelain'))fail('WORKTREE_MUST_BE_CLEAN');
if(!/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)xirraen\/airdropmuseum(\.git)?$/.test(git('remote','get-url','origin')))
 fail('REPOSITORY_MISMATCH');
const candidate=git('rev-parse','HEAD');

async function cloudflareGet(path){
 const url='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/workers/scripts/'+WORKER+path;
 const response=await fetch(url,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(15000)});
 if(!response.ok)fail('CLOUDFLARE_METADATA_READ_FAILED');
 const body=await response.json();
 if(!body.success)fail('CLOUDFLARE_METADATA_READ_FAILED');
 return body.result;
}
async function liveSnapshot(){
 const deployments=await cloudflareGet('/deployments');
 const current=deployments?.deployments?.[0];
 if(!current?.id||current.versions?.length!==1||Number(current.versions[0].percentage)!==100)
  fail('PRODUCTION_TRAFFIC_STATE_UNEXPECTED');
 const versionId=current.versions[0].version_id;
 const version=await cloudflareGet('/versions/'+encodeURIComponent(versionId));
 const annotations=version?.annotations||{};
 const commit=annotations['workers/commit_sha']||
  /\b(?:Verified main |source )([a-f0-9]{40})\b/.exec(annotations['workers/message']||'')?.[1];
 if(!/^[a-f0-9]{40}$/.test(commit||''))fail('LIVE_COMMIT_UNAVAILABLE');
 const repository=annotations['workers/repository_url'];
 if(repository&&repository!=='https://github.com/xirraen/airdropmuseum')
  fail('LIVE_REPOSITORY_MISMATCH');
 return {commit,deployment_id:current.id,version_id:versionId};
}
const live=await liveSnapshot();
// Reconcile the live feature branch into main before deploying. Never regress live features.
try{execFileSync('git',['merge-base','--is-ancestor',live.commit,candidate],{stdio:'ignore'});}
catch{fail('LIVE_FEATURES_NOT_IN_CANDIDATE');}
// Keep the current production endpoint reachable. A custom domain is not required.
if(cfg.workers_dev!==false){
 const subdomain=await cloudflareGet('/subdomain');
 if(subdomain?.enabled!==true)fail('WORKERS_DEV_ROUTE_NOT_ACTIVE');
}

exec('npm',['ci'],'Install locked dependencies');
for(const [name,args] of [
 ['Lint',['run','lint']],
 ['Types',['run','typecheck']],
 ['Build',['run','build']],
 ['Unit and integration',['test']],
 ['Workerd and D1',['run','test:runtime']],
 ['Browser E2E',['run','test:e2e']]
])exec('npm',args,name);
exec('node',['scripts/security-scan.mjs'],'Scan committed credentials');
exec('node',['--experimental-sqlite','scripts/validate-migrations.mjs'],'Validate immutable schema');
exec('git',['diff','--exit-code','--','src/worker.mjs','dist/aggregator-ui-bundle.js'],'Generated bundle parity');
if(git('status','--porcelain'))fail('BUILD_CHANGED_WORKTREE');
exec('node',['scripts/verify-production-bindings.mjs'],'Check binding destinations');
// This release never mutates D1. A pending migration is a separate release operation.
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler))fail('WRANGLER_MISSING');
function query(sql){
 const output=JSON.parse(capture('node',[wrangler,'d1','execute',WORKER,'--remote','--config','wrangler.jsonc','--json','--command',sql]));
 if(!Array.isArray(output)||output.some(x=>x.success===false))fail('D1_METADATA_QUERY_FAILED');
 return output.flatMap(x=>x.results||[]);
}
const applied=new Set(query('SELECT name FROM d1_migrations').map(r=>r.name));
const migrations=readdirSync('migrations').filter(n=>/^\d+.*\.sql$/.test(n)).sort();
const pending=migrations.filter(n=>!applied.has(n));
if(pending.length)fail('PENDING_SCHEMA_MIGRATIONS: '+pending.slice(0,6).join(','));
if(Number(query('SELECT MAX(version) AS v FROM am_core_schema')[0]?.v)!==17)fail('SCHEMA_VERSION_MISMATCH');
if(query('PRAGMA foreign_key_check').length)fail('FOREIGN_KEY_VIOLATIONS');

const beforeDeploy=await liveSnapshot();
if(beforeDeploy.deployment_id!==live.deployment_id||beforeDeploy.version_id!==live.version_id)
 fail('PRODUCTION_CHANGED_DURING_RELEASE');
console.log('ROLLBACK_VERSION_ID:',live.version_id);
console.log('ROLLBACK_DEPLOYMENT_ID:',live.deployment_id);
const message='Verified main '+candidate+'; previous version '+live.version_id;
exec('node',[wrangler,'deploy','--config','wrangler.jsonc','--message',message],
 'Deploy existing production Worker (code only)');
const after=await liveSnapshot();
if(after.deployment_id===live.deployment_id||after.commit!==candidate)
 fail('POST_DEPLOY_VERSION_PROVENANCE_MISMATCH');
const response=await fetch(ORIGIN+'/',{signal:AbortSignal.timeout(15000)});
if(response.status!==200||!response.headers.get('content-security-policy'))
 fail('POST_DEPLOY_PUBLIC_SMOKE_FAILED');
console.log(JSON.stringify({status:'DEPLOYED',candidate,previous_version_id:live.version_id,
 deployment_id:after.deployment_id,version_id:after.version_id,public_url:ORIGIN}));

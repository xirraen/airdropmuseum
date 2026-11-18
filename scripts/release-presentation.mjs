/**
 * Strictly scoped, operator-only style release. This is NOT a bypass for
 * changed API, wallet, auth, migration, Worker config, JS or HTML files.
 * Production must already be annotated with its deployed base Git commit.
 */
import {execFileSync} from 'node:child_process';
import {releaseChildEnv} from './release-child-env.mjs';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyReleaseEvidence} from './release-evidence.mjs';
import {getLiveReleaseBaseline,localReleaseDiff} from './release-policy.mjs';

const fail=code=>{throw Error('PRESENTATION_RELEASE_BLOCKED: '+code)};
if(process.env.AIRDROP_PRESENTATION_RELEASE!=='APPROVED')fail('OWNER_APPROVAL_REQUIRED');
if(!process.env.CLOUDFLARE_API_TOKEN)fail('CLOUDFLARE_TOKEN_REQUIRED');
if(!process.env.RELEASE_EVIDENCE_FILE)fail('REVIEWED_EVIDENCE_REQUIRED');
const cmd=(tool,args,{cloudAccess=false}={})=>execFileSync(tool,args,{encoding:'utf8',timeout:60000,env:releaseChildEnv(process.env,{cloudAccess})}).trim();
if(cmd('git',['branch','--show-current'])!=='main')fail('MAIN_REQUIRED');
if(cmd('git',['status','--porcelain']))fail('DIRTY_GIT_TREE');
if(!/^(https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)xirraen\/airdropmuseum(\.git)?$/.test(cmd('git',['remote','get-url','origin'])))
 fail('WRONG_REPOSITORY');
const commit=cmd('git',['rev-parse','HEAD']);
const root=realpathSync('.');
const evidence=realpathSync(process.env.RELEASE_EVIDENCE_FILE);
const rel=relative(root,evidence);
if(!rel||!isAbsolute(evidence)||rel!== '..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel))fail('EVIDENCE_MUST_BE_PRIVATE');
const manifest=verifyReleaseEvidence(evidence,commit,Date.now(),'presentation');
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(config.account_id!=='9880cf2cc57c2096f8c3ae253d9852e6'||
   config.name!=='airdrop-museum'||config.d1_databases?.[0]?.database_id!=='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3')fail('TARGET_DRIFT');

async function requireLiveBase(){
 const live=await getLiveReleaseBaseline(process.env.CLOUDFLARE_API_TOKEN);
 if(live.commit!==manifest.production_base_commit||
    live.deployment_id!==manifest.production_deployment_id||
    live.artifact_sha256!==manifest.production_base_artifact_sha256)fail('PRODUCTION_BASELINE_CHANGED');
 const diff=localReleaseDiff(live.commit,commit);
 if(diff.tier!=='presentation')fail('NON_PRESENTATION_CHANGES: '+diff.blockers.map(x=>x.path).slice(0,6).join(','));
 return live;
}
const live=await requireLiveBase();
const run=(tool,args,label,{cloudAccess=false}={})=>{
 console.log('PRESENTATION GATE: '+label);
 execFileSync(tool,args,{stdio:'inherit',timeout:600000,env:releaseChildEnv(process.env,{cloudAccess})});
};
run('npm',['ci'],'Locked dependencies');
for(const [label,args] of [
 ['Lint',['run','lint']],['Wallet types',['run','typecheck']],
 ['Build',['run','build']],['Unit and integration',['test']],
 ['Workerd and D1',['run','test:runtime']],['Browser E2E',['run','test:e2e']],
 ['Dependency audit',['audit','--omit=dev','--audit-level=high']]
])run('npm',args,label);
run('node',['scripts/security-scan.mjs'],'Credential scan');
run('node',['--experimental-sqlite','scripts/validate-migrations.mjs'],'Migration validation');
if(cmd('git',['status','--porcelain']))fail('BUILD_MODIFIED_GIT_TREE');
run('node',['scripts/verify-production-bindings.mjs'],'Live binding and secret inventory',{cloudAccess:true});
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
if(!existsSync(wrangler))fail('WRANGLER_UNAVAILABLE');
const query=sql=>{
 const raw=cmd('node',[wrangler,'d1','execute','airdrop-museum','--remote','--config','wrangler.jsonc','--json','--command',sql],{cloudAccess:true});
 const parsed=JSON.parse(raw);
 if(!Array.isArray(parsed)||parsed.some(x=>!x.success))fail('DATABASE_PREFLIGHT_FAILED');
 return parsed.flatMap(x=>x.results||[]);
};
if(Number(query('SELECT MAX(version) AS version FROM am_core_schema')[0]?.version)!==17)fail('SCHEMA_DRIFT');
if(query('PRAGMA foreign_key_check').length)fail('FOREIGN_KEY_VIOLATION');
// Race check: another deployment cannot overtake a previously reviewed base.
await requireLiveBase();
const hash=createHash('sha256').update(readFileSync('src/worker.mjs')).digest('hex');
run('node',[wrangler,'deploy','--strict','--config','wrangler.jsonc',
 '--message','Verified main '+commit+'; artifact '+hash,
 '--tag','main-'+commit.slice(0,7)],'Style-only Worker deployment',{cloudAccess:true});
const deployed=await getLiveReleaseBaseline(process.env.CLOUDFLARE_API_TOKEN);
if(deployed.commit!==commit||deployed.artifact_sha256!==hash||
   deployed.deployment_id===live.deployment_id)fail('DEPLOYMENT_PROVENANCE_MISMATCH');
const response=await fetch('https://airdrop-museum.xirraen.workers.dev/',{signal:AbortSignal.timeout(15000)});
if(response.status!==200||!response.headers.get('content-security-policy'))fail('POST_DEPLOY_HOME_SMOKE_FAILED');
const admin=await fetch('https://airdrop-museum.xirraen.workers.dev/admin',{redirect:'manual',signal:AbortSignal.timeout(15000)});
if(admin.status!==403)fail('UNAUTHENTICATED_ADMIN_BOUNDARY_CHANGED');
if(Number(query('SELECT MAX(version) AS version FROM am_core_schema')[0]?.version)!==17||
   query('PRAGMA foreign_key_check').length)fail('POST_DEPLOY_SCHEMA_CHANGED');
console.log('PRESENTATION_RELEASE_DEPLOYED: verify live version hash, owner session, mobile styling and rollback window.');

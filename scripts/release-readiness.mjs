// Read-only, practical release readiness. No AUD manifest or external checklists.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {getLiveReleaseBaseline,assertLiveSourceIncluded} from './release-policy.mjs';

const output={status:'blocked',commit:null,production:null,checks:[]};
const check=(name,status,detail)=>output.checks.push({name,status,...(detail?{detail}:{})});
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',timeout:30000}).trim();
try{
 const cfg=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 output.commit=git('rev-parse','HEAD');
 if(cfg.name!=='airdrop-museum'||cfg.account_id!=='9880cf2cc57c2096f8c3ae253d9852e6'||
  cfg.d1_databases?.[0]?.database_id!=='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3')
  throw Error('PRODUCTION_TARGET_DRIFT');
 check('production_target','PASS');
 if(cfg.workers_dev===false&&!cfg.route&&!(Array.isArray(cfg.routes)&&cfg.routes.length))
  throw Error('PUBLIC_ROUTE_WOULD_BE_DISABLED');
 check('public_route_config','PASS');
 if(git('branch','--show-current')!=='main')throw Error('MAIN_BRANCH_REQUIRED');
 if(git('status','--porcelain'))throw Error('CLEAN_WORKTREE_REQUIRED');
 check('clean_main','PASS');
 const live=await getLiveReleaseBaseline(process.env.CLOUDFLARE_API_TOKEN);
 output.production={commit:live.commit,deployment_id:live.deployment_id,version_id:live.version_id};
 const parity=assertLiveSourceIncluded(live.commit,output.commit);
 check('live_source_parity','PASS',parity.mode);
 check('live_deployment_metadata','PASS');
 output.status='ready_for_code_only_release';
}catch(error){check('preflight','BLOCKED',error.message);}
console.log(JSON.stringify(output,null,2));
if(output.status==='blocked')process.exitCode=2;

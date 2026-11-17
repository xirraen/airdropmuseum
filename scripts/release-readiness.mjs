// Read-only readiness diagnosis. This script does not create versions, touch D1,
// manage secrets, export private data, or call any deployment endpoint.
import {execFileSync} from 'node:child_process';
import {getLiveReleaseBaseline,localReleaseDiff} from './release-policy.mjs';
import {requiredReleaseGates,verifyReleaseEvidence} from './release-evidence.mjs';

const sha=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const output={
 status:'blocked',commit:null,production:null,
 tier:'full',changed_files:0,changed_paths:[],required_gates:[],checks:[]
};
const check=(name,status,details)=>output.checks.push({name,status,...(details?{details}:{})});
try{
 output.commit=sha();
 const live=await getLiveReleaseBaseline(process.env.CLOUDFLARE_API_TOKEN);
 output.production={commit:live.commit,deployment_id:live.deployment_id,
  version_id:live.version_id,deployed_at:live.deployed_at};
 const diff=localReleaseDiff(live.commit,output.commit);
 output.tier=diff.tier;
 output.changed_files=diff.changed_files;
 output.changed_paths=diff.blockers.map(e=>e.path).slice(0,50);
 output.presentation_assets=diff.presentation_assets;
 output.required_gates=[...requiredReleaseGates(diff.tier)];
 check('live_commit_attested','PASS');
 check('scope_classification','PASS',diff.reason);
 if(diff.tier==='full')check('full_release_required','PASS',
  'Full release evidence is mandatory for executable, configuration or schema changes since the live Worker.');
 if(!process.env.RELEASE_EVIDENCE_FILE){
  check('reviewed_manifest','BLOCKED','RELEASE_EVIDENCE_FILE is not configured.');
 }else{
  try{
   const evidence=verifyReleaseEvidence(process.env.RELEASE_EVIDENCE_FILE,output.commit,Date.now(),diff.tier);
   if(diff.tier==='presentation'&&(evidence.production_base_commit!==live.commit||
     evidence.production_deployment_id!==live.deployment_id||
     evidence.production_base_artifact_sha256!==live.artifact_sha256))
    throw Error('LIVE_BASELINE_EVIDENCE_MISMATCH');
   check('reviewed_manifest','PASS');
  }catch(error){check('reviewed_manifest','BLOCKED',error.message);}
 }
 output.status=output.checks.every(x=>x.status==='PASS')?'evidence_ready':'blocked';
}catch(error){check('read_only_preflight','BLOCKED',error.message);}
console.log(JSON.stringify(output,null,2));
if(output.status==='blocked')process.exitCode=2;

// Read-only release diagnosis: never uploads Workers, writes D1, or reads secret values.
// An unannotated live Worker is not evidence of a Git commit or a zero-file diff.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {getLiveDeploymentIdentity,getLiveReleaseBaseline,localReleaseDiff} from './release-policy.mjs';
import {requiredReleaseGates,verifyReleaseEvidence} from './release-evidence.mjs';

const gitHead=()=>execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();

/** Dependency injection exists only for offline regression tests of release decisions. */
export async function inspectReadiness({
 token=process.env.CLOUDFLARE_API_TOKEN,
 evidenceFile=process.env.RELEASE_EVIDENCE_FILE,
 head=gitHead,
 identity=getLiveDeploymentIdentity,
 baseline=getLiveReleaseBaseline,
 compare=localReleaseDiff,
 verify=verifyReleaseEvidence
}={}){
 const output={
  status:'blocked',commit:null,production:null,
  tier:'full',changed_files:null,changed_paths:null,
  required_gates:[...requiredReleaseGates('full')],checks:[]
 };
 const check=(name,status,details)=>output.checks.push({name,status,...(details?{details}:{})});
 try{
  output.commit=head();
  const deployed=await identity(token);
  output.production={commit:null,deployment_id:deployed.deployment_id,
   version_id:deployed.version_id,deployed_at:deployed.deployed_at};
  check('live_deployment_identity','PASS');
  let live;
  try{live=await baseline(token);}
  catch(error){
   if(error.message!=='PRODUCTION_BASELINE_UNATTESTED')throw error;
   // Avoid displaying an outdated ID when a concurrent operator has deployed.
   const fresh=await identity(token);
   if(fresh.deployment_id!==deployed.deployment_id||fresh.version_id!==deployed.version_id)
    throw Error('PRODUCTION_DEPLOYMENT_CHANGED_DURING_PREFLIGHT');
   check('live_commit_attested','BLOCKED','PRODUCTION_BASELINE_UNATTESTED');
   check('scope_classification','BLOCKED','Deployed Git commit is unverified; diff size and presentation eligibility are unknown.');
   check('reviewed_manifest','BLOCKED','Full release gates remain mandatory; do not invent source lineage or approval evidence.');
   return output;
  }
  if(live.deployment_id!==deployed.deployment_id||live.version_id!==deployed.version_id)
   throw Error('PRODUCTION_DEPLOYMENT_CHANGED_DURING_PREFLIGHT');
  output.production.commit=live.commit;
  check('live_commit_attested','PASS');
  const diff=compare(live.commit,output.commit);
  output.tier=diff.tier;
  output.changed_files=diff.changed_files;
  output.changed_paths=diff.blockers.map(x=>x.path).slice(0,50);
  output.presentation_assets=diff.presentation_assets;
  output.required_gates=[...requiredReleaseGates(diff.tier)];
  check('scope_classification','PASS',diff.reason);
  if(diff.tier==='full')check('full_release_required','PASS',
   'Full release evidence is mandatory for executable, configuration or schema changes since the live Worker.');
  if(!evidenceFile)check('reviewed_manifest','BLOCKED','RELEASE_EVIDENCE_FILE is not configured.');
  else{
   try{
    const evidence=verify(evidenceFile,output.commit,Date.now(),diff.tier);
    if(diff.tier==='presentation'&&(evidence.production_base_commit!==live.commit||
      evidence.production_deployment_id!==live.deployment_id||
      evidence.production_base_artifact_sha256!==live.artifact_sha256))
     throw Error('LIVE_BASELINE_EVIDENCE_MISMATCH');
    check('reviewed_manifest','PASS');
   }catch(error){check('reviewed_manifest','BLOCKED',error.message);}
  }
  output.status=output.checks.every(c=>c.status==='PASS')?'evidence_ready':'blocked';
 }catch(error){check('read_only_preflight','BLOCKED',error.message);}
 return output;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const output=await inspectReadiness();
 console.log(JSON.stringify(output,null,2));
 if(output.status==='blocked')process.exitCode=2;
}

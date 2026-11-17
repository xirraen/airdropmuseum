import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {inspectReadiness} from '../scripts/release-readiness.mjs';
import {REQUIRED_GATES,PRESENTATION_GATES} from '../scripts/release-evidence.mjs';

const head='a'.repeat(40);
const identityData={deployment_id:'0fd82ac4-7201-4eb7-a3c9-4fa26d66076f',
 version_id:'4765aba5-550e-40de-a945-2c287d4ec328',deployed_at:'2026-11-17T16:43:32Z'};

test('missing Cloudflare token does not attempt a release diff or claim zero changed files',async()=>{
 let compared=false;
 const result=await inspectReadiness({token:null,head:()=>head,
  identity:async token=>{if(!token)throw Error('CLOUDFLARE_TOKEN_REQUIRED');},
  compare:()=>{compared=true;throw Error('NEVER_COMPARE');}
 });
 assert.equal(result.status,'blocked');
 assert.equal(result.production,null);
 assert.equal(result.changed_files,null);
 assert.equal(result.changed_paths,null);
 assert.deepEqual(result.required_gates,[...REQUIRED_GATES]);
 assert.equal(result.checks.at(-1).details,'CLOUDFLARE_TOKEN_REQUIRED');
 assert.equal(compared,false);
});

test('unannotated live Worker reports exact deployed identity, unknown diff, and full release gates',async()=>{
 let identities=0,comparison=0,verification=0;
 const result=await inspectReadiness({token:'READ_ONLY_TOKEN',head:()=>head,
  identity:async()=>{identities++;return identityData;},
  baseline:async()=>{throw Error('PRODUCTION_BASELINE_UNATTESTED');},
  compare:()=>{comparison++;throw Error('BAD_SOURCE_GUESS');},
  verify:()=>{verification++;throw Error('BAD_MANIFEST_GUESS');},
  evidenceFile:'/nonexistent/private/evidence.json'
 });
 assert.equal(result.status,'blocked');
 assert.equal(result.production.deployment_id,identityData.deployment_id);
 assert.equal(result.production.version_id,identityData.version_id);
 assert.equal(result.production.commit,null);
 assert.equal(result.changed_files,null);
 assert.equal(result.changed_paths,null);
 assert.deepEqual(result.required_gates,[...REQUIRED_GATES]);
 assert.equal(identities,2);
 assert.equal(comparison,0);
 assert.equal(verification,0);
 assert.equal(result.checks.find(s=>s.name==='live_commit_attested').details,'PRODUCTION_BASELINE_UNATTESTED');
 assert.equal(result.checks.find(s=>s.name==='scope_classification').status,'BLOCKED');
});

test('concurrent deployment during unattested inspection blocks without claiming source provenance',async()=>{
 let calls=0;
 const result=await inspectReadiness({token:'READ_ONLY_TOKEN',head:()=>head,
  identity:async()=>({...identityData,deployment_id:++calls===1?identityData.deployment_id:'beef0000-1234-4567-9876-123456789012'}),
  baseline:async()=>{throw Error('PRODUCTION_BASELINE_UNATTESTED');}
 });
 assert.equal(result.status,'blocked');
 assert.equal(result.production.commit,null);
 assert.equal(result.checks.at(-1).details,'PRODUCTION_DEPLOYMENT_CHANGED_DURING_PREFLIGHT');
});

test('attested production retains CSS-only classifier with six exact evidence gates',async()=>{
 const live={...identityData,commit:'b'.repeat(40),artifact_sha256:'c'.repeat(64)};
 const result=await inspectReadiness({token:'READ_ONLY_TOKEN',head:()=>head,
  identity:async()=>identityData,baseline:async()=>live,
  compare:(base,candidate)=>{
   assert.equal(base,live.commit);assert.equal(candidate,head);
   return {tier:'presentation',changed_files:2,blockers:[],presentation_assets:['dist/mini-ui.css'],reason:'VERIFIED_STYLE_ONLY_DIFF'};
  }
 });
 assert.equal(result.status,'blocked');
 assert.equal(result.production.commit,live.commit);
 assert.equal(result.changed_files,2);
 assert.deepEqual(result.required_gates,[...PRESENTATION_GATES]);
 assert.equal(result.checks.at(-1).details,'RELEASE_EVIDENCE_FILE is not configured.');
});

test('attested baseline drift between two reads aborts release assessment',async()=>{
 const result=await inspectReadiness({token:'READ_ONLY_TOKEN',head:()=>head,
  identity:async()=>identityData,
  baseline:async()=>({...identityData,version_id:'different',commit:'b'.repeat(40),artifact_sha256:'c'.repeat(64)}),
  compare:()=>{throw Error('SHOULD_NOT_COMPARE');}
 });
 assert.equal(result.status,'blocked');
 assert.equal(result.checks.at(-1).details,'PRODUCTION_DEPLOYMENT_CHANGED_DURING_PREFLIGHT');
 assert.equal(result.changed_files,null);
});

test('readiness CLI without token returns blocked JSON and exit code 2',()=>{
 const child=spawnSync(process.execPath,['scripts/release-readiness.mjs'],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}
 });
 assert.equal(child.status,2);
 const output=JSON.parse(child.stdout);
 assert.equal(output.status,'blocked');
 assert.equal(output.checks.at(-1).details,'CLOUDFLARE_TOKEN_REQUIRED');
 assert.equal(output.changed_files,null);
 assert.deepEqual(output.required_gates,[...REQUIRED_GATES]);
});

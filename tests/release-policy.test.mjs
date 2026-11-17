import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {
 parseNameStatus,classifyReleaseChanges,getLiveReleaseBaseline
} from '../scripts/release-policy.mjs';
import {
 REQUIRED_GATES,PRESENTATION_GATES,requiredReleaseGates,verifyReleaseEvidence
} from '../scripts/release-evidence.mjs';

test('style-only changes require modified approved bundled CSS and reject executable files',()=>{
 const ok=classifyReleaseChanges([{status:'M',path:'dist/mini-ui.css'},{status:'M',path:'tests/navigation.test.mjs'},
  {status:'A',path:'docs/RELEASE.md'}]);
 assert.equal(ok.tier,'presentation');
 assert.equal(ok.changed_files,3);
 assert.deepEqual(ok.blockers,[]);
 for(const entry of [
  {status:'M',path:'dist/app.js'},{status:'M',path:'dist/index.html'},
  {status:'M',path:'src/admin/adminRoutes.ts'},{status:'M',path:'wrangler.jsonc'},
  {status:'M',path:'scripts/release-policy.mjs'},{status:'M',path:'package.json'},
  {status:'A',path:'dist/new.css'},{status:'D',path:'dist/mini-ui.css'},
  {status:'M',path:'migrations/0021_extra.sql'}
 ]){
  assert.equal(classifyReleaseChanges([{status:'M',path:'dist/mini-ui.css'},entry]).tier,'full',entry.path);
 }
 assert.equal(classifyReleaseChanges([{status:'A',path:'docs/ONLY_DOCS.md'}]).tier,'full');
 assert.equal(classifyReleaseChanges([]).tier,'full');
});
test('git status parser is deterministic and treats rename records as unsafe',()=>{
 const entries=parseNameStatus('M\0dist/mini-ui.css\0A\0docs/new.md\0');
 assert.deepEqual(entries,[{status:'M',path:'dist/mini-ui.css'},{status:'A',path:'docs/new.md'}]);
 assert.throws(()=>parseNameStatus('M\0dist/mini-ui.css\0dangling'),/RELEASE_DIFF_INVALID/);
 assert.throws(()=>parseNameStatus('R100\0dist/new.css\0'),/RELEASE_DIFF_INVALID/);
 assert.throws(()=>parseNameStatus('M\0../secrets.css\0'),/RELEASE_DIFF_INVALID/);
});
test('live production version must have exclusive traffic and a verified commit annotation',async()=>{
 const path='/accounts/9880cf2cc57c2096f8c3ae253d9852e6/workers/scripts/airdrop-museum';
 let requested=0;
 const fetcher=async(url,options)=>{
  requested++;assert.equal(options.headers.Authorization,'Bearer MOCK_TOKEN');
  assert.ok(url.startsWith('https://api.cloudflare.com/client/v4'+path));
  const result=url.endsWith('/deployments')?
   {deployments:[{id:'9cda2eaa-69e9-4acc-a46c-cf1db391adaf',versions:[{version_id:'a3a38eb1-050d-4907-bb73-518d0d0e5f43',percentage:100}]}]}:
   {annotations:{'workers/message':'Verified main '+'a'.repeat(40)+'; artifact '+'c'.repeat(64)}};
  return {ok:true,json:async()=>({success:true,result})};
 };
 const live=await getLiveReleaseBaseline('MOCK_TOKEN',{fetcher});
 assert.equal(live.commit,'a'.repeat(40));
 assert.equal(live.artifact_sha256,'c'.repeat(64));
 assert.equal(requested,2);
 await assert.rejects(getLiveReleaseBaseline('MOCK_TOKEN',{fetcher:async()=>({ok:true,json:async()=>({
  success:true,result:{deployments:[{id:'x',versions:[{version_id:'a',percentage:50},{version_id:'b',percentage:50}]}]}
 })})}),/NONEXCLUSIVE_PRODUCTION_TRAFFIC/);
 await assert.rejects(getLiveReleaseBaseline('MOCK_TOKEN',{fetcher:async url=>({ok:true,json:async()=>({
  success:true,result:url.endsWith('deployments')?
   {deployments:[{id:'x',versions:[{version_id:'a',percentage:100}]}]}:
   {annotations:{'workers/message':'Unknown origin'}}
 })})}),/PRODUCTION_BASELINE_UNATTESTED/);
});
test('full release still requires all 13 original gates; presentation accepts only its six reviewed gates',()=>{
 assert.equal(REQUIRED_GATES.length,13);
 assert.equal(PRESENTATION_GATES.length,6);
 assert.deepEqual(requiredReleaseGates(),REQUIRED_GATES);
 assert.deepEqual(requiredReleaseGates('presentation'),PRESENTATION_GATES);
 assert.throws(()=>requiredReleaseGates('nope'),/INVALID_RELEASE_TIER/);
 const dir=mkdtempSync(join(tmpdir(),'am-release-policy-'));
 try{
  const file=join(dir,'evidence.json'),artifact=join(dir,'review.txt');
  writeFileSync(artifact,'approved and verified');
  const digest=createHash('sha256').update(readFileSync(artifact)).digest('hex');
  const gates=Object.fromEntries(PRESENTATION_GATES.map(name=>[name,{
   status:'PASS',reviewer:'operator',artifact:'review.txt',sha256:digest
  }]));
  const commit='b'.repeat(40);
  const manifest={commit,tier:'presentation',verified_at:new Date().toISOString(),
   production_base_commit:'a'.repeat(40),
   production_deployment_id:'9cda2eaa-69e9-4acc-a46c-cf1db391adaf',
   production_base_artifact_sha256:'c'.repeat(64),gates};
  writeFileSync(file,JSON.stringify(manifest));
  assert.equal(verifyReleaseEvidence(file,commit,Date.now(),'presentation').tier,'presentation');
  assert.throws(()=>verifyReleaseEvidence(file,commit),/RELEASE_TIER_MISMATCH/);
  delete manifest.gates.production_approval;
  writeFileSync(file,JSON.stringify(manifest));
  assert.throws(()=>verifyReleaseEvidence(file,commit,Date.now(),'presentation'),/production_approval/);
  manifest.gates.production_approval=gates.production_baseline;
  manifest.production_base_artifact_sha256='bad';
  writeFileSync(file,JSON.stringify(manifest));
  assert.throws(()=>verifyReleaseEvidence(file,commit,Date.now(),'presentation'),/PRESENTATION_BASELINE_REQUIRED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('presentation release is explicitly approved and cannot apply D1 migrations',()=>{
 const script=readFileSync('scripts/release-presentation.mjs','utf8');
 const result=spawnSync(process.execPath,['scripts/release-presentation.mjs'],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}
 });
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/OWNER_APPROVAL_REQUIRED/);
 assert.match(script,/getLiveReleaseBaseline/);
 assert.match(script,/localReleaseDiff/);
 assert.match(script,/PRODUCTION_BASELINE_CHANGED/);
 assert.match(script,/--strict/);
 assert.match(script,/verifyProductionBindings|verify-production-bindings/);
 assert.doesNotMatch(script,/'migrations','apply'/);
 assert.doesNotMatch(script,/scripts\/private-db-backup\.mjs/);
});

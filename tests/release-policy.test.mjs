import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseNameStatus,classifyReleaseChanges,getLiveReleaseBaseline
} from '../scripts/release-policy.mjs';

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

test('current Cloudflare commit annotation is sufficient to identify live version',async()=>{
 const path='/accounts/9880cf2cc57c2096f8c3ae253d9852e6/workers/scripts/airdrop-museum';
 const sha='7'.repeat(40);
 const fetcher=async url=>({ok:true,json:async()=>({success:true,result:
  url.endsWith('/deployments')?
   {deployments:[{id:'9cda2eaa-69e9-4acc-a46c-cf1db391adaf',
    created_on:'2026-11-18T15:57:42Z',
    versions:[{version_id:'a3a38eb1-050d-4907-bb73-518d0d0e5f43',percentage:100}]}]}:
   {annotations:{'workers/commit_sha':sha,
    'workers/repository_url':'https://github.com/xirraen/airdropmuseum',
    'workers/message':'Feature release #53'}}
 })});
 const live=await getLiveReleaseBaseline('MOCK_TOKEN',{fetcher});
 assert.equal(live.commit,sha);
 assert.equal(live.artifact_sha256,null);
 await assert.rejects(getLiveReleaseBaseline('MOCK_TOKEN',{fetcher:async url=>({
  ok:true,json:async()=>({success:true,result:url.endsWith('/deployments')?
   {deployments:[{id:'x',versions:[{version_id:'a',percentage:100}]}]}:
   {annotations:{'workers/commit_sha':sha,'workers/repository_url':'https://github.com/other/repo'}}
  })
 })}),/PRODUCTION_REPOSITORY_MISMATCH/);
});

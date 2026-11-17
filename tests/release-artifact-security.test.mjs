import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync,mkdirSync,truncateSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gateArtifact,REQUIRED_GATES,verifyReleaseEvidence} from '../scripts/release-evidence.mjs';

test('private release gate evidence reads a bounded regular file inside its manifest directory',()=>{
 const root=mkdtempSync(join(tmpdir(),'am-release-evidence-safe-'));
 try{
  const manifest=join(root,'manifest.json');
  writeFileSync(manifest,'{}');
  mkdirSync(join(root,'sub'));
  const path=join(root,'sub','staging.txt');
  writeFileSync(path,'reviewed original evidence');
  assert.equal(gateArtifact(manifest,'sub/staging.txt').toString(),'reviewed original evidence');
  assert.equal(gateArtifact(manifest,'sub/../sub/staging.txt').toString(),'reviewed original evidence');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('release evidence blocks absolute path, traversal, and both file and directory symlinks',()=>{
 const root=mkdtempSync(join(tmpdir(),'am-release-evidence-unsafe-'));
 try{
  const safe=join(root,'private'),outside=join(root,'outside');
  mkdirSync(safe);mkdirSync(outside);
  const manifest=join(safe,'manifest.json'),evidence=join(safe,'review.txt'),external=join(outside,'secret.txt');
  writeFileSync(manifest,'{}');writeFileSync(evidence,'reviewed');
  writeFileSync(external,'private information');
  symlinkSync(external,join(safe,'file-link'));
  symlinkSync(outside,join(safe,'dir-link'));
  symlinkSync(evidence,join(safe,'internal-link'));
  for(const path of [
   external,'../outside/secret.txt','/etc/passwd','file-link','internal-link',
   'dir-link/secret.txt','.','','bad'+String.fromCharCode(0)+'name'
  ])assert.throws(()=>gateArtifact(manifest,path),/RELEASE_ARTIFACT_UNSAFE/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('oversized sparse gate evidence is rejected before reading into memory',()=>{
 const root=mkdtempSync(join(tmpdir(),'am-release-evidence-limit-'));
 try{
  const manifest=join(root,'manifest.json'),large=join(root,'large.bin');
  writeFileSync(manifest,'{}');writeFileSync(large,'x');
  truncateSync(large,64*1024*1024+1);
  assert.throws(()=>gateArtifact(manifest,'large.bin'),/RELEASE_ARTIFACT_TOO_LARGE/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('the 13 full release gates continue to require matching private artifact hashes',()=>{
 const root=mkdtempSync(join(tmpdir(),'am-release-evidence-gates-'));
 try{
  const commit='b'.repeat(40),filename='verified.txt',manifest=join(root,'manifest.json');
  const payload='authentic operator evidence must be reviewed';
  writeFileSync(join(root,filename),payload);
  const hash=createHash('sha256').update(payload).digest('hex');
  const gates=Object.fromEntries(REQUIRED_GATES.map(name=>[name,{
   status:'PASS',reviewer:'operator',artifact:filename,sha256:hash
  }]));
  writeFileSync(manifest,JSON.stringify({commit,verified_at:new Date().toISOString(),gates}));
  assert.equal(verifyReleaseEvidence(manifest,commit).commit,commit);
  gates.production_approval={...gates.production_approval,artifact:'../unreviewed.txt'};
  writeFileSync(manifest,JSON.stringify({commit,verified_at:new Date().toISOString(),gates}));
  assert.throws(()=>verifyReleaseEvidence(manifest,commit),/RELEASE_ARTIFACT_UNSAFE/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

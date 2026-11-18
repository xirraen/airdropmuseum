import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveNewPrivateBackupFolder} from '../scripts/recovery-path.mjs';

function privateDirs(run){
 const root=mkdtempSync(join(tmpdir(),'am-recovery-folder-'));
 try{
  const backup=join(root,'private'),elsewhere=join(root,'elsewhere');
  mkdirSync(backup);mkdirSync(elsewhere);
  return run({root,backup,elsewhere});
 }finally{rmSync(root,{recursive:true,force:true});}
}

test('newly created encrypted backup folder directly under operator root is accepted',()=>privateDirs(({backup})=>{
 const id='2026-11-17T21-27-42.349Z-0e110d30-f082-4c3f-af8e-b8851360276d';
 mkdirSync(join(backup,id));
 const resolved=resolveNewPrivateBackupFolder(backup,id);
 assert.equal(resolved,join(backup,id));
}));

test('rejects parent traversal, absolute filenames, root itself and nested paths',()=>privateDirs(({backup,elsewhere})=>{
 mkdirSync(join(backup,'legitimate'));
 for(const name of ['../elsewhere','.', '..','', '/etc','legitimate/../legitimate','legitimate/child','legitimate\\child','\0'])
  assert.throws(()=>resolveNewPrivateBackupFolder(backup,name),/BACKUP_ESCAPED_PRIVATE_DIRECTORY/);
}));

test('rejects symlink to outside and inside, file rather than directory',()=>privateDirs(({backup,elsewhere})=>{
 mkdirSync(join(backup,'good'));
 symlinkSync(elsewhere,join(backup,'outside-link'),'dir');
 symlinkSync(join(backup,'good'),join(backup,'inside-link'),'dir');
 writeFileSync(join(backup,'plain.sql'),'sensitive');
 for(const name of ['outside-link','inside-link','plain.sql'])
  assert.throws(()=>resolveNewPrivateBackupFolder(backup,name),/BACKUP_ESCAPED_PRIVATE_DIRECTORY/);
}));

test('operator recovery runner uses verified direct-child folder, never inverted outside check',()=>{
 const source=readFileSync('scripts/run-isolated-recovery-drill.mjs','utf8');
 assert.match(source,/resolveNewPrivateBackupFolder\(root,candidates\[0\]\)/);
 assert.doesNotMatch(source,/!outside\(relative\(root,folder\)\)/);
});

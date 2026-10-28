import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const target='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
function fixture(directory,key=randomBytes(32)){
 const rows={parents:[{id:'p1',name:'A source row'}],children:[{id:'c1',parent_id:'p1',detail:'Synthetic verification'}]};
 const snapshot={format:'airdropmuseum-d1-snapshot-v1',database_id:target,schema:[
  {type:'table',name:'parents',sql:'CREATE TABLE parents(id TEXT PRIMARY KEY, name TEXT NOT NULL)'},
  {type:'table',name:'children',sql:'CREATE TABLE children(id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parents(id), detail TEXT NOT NULL)'},
  {type:'index',name:'idx_children_parent',sql:'CREATE INDEX idx_children_parent ON children(parent_id)'}],
  rows,counts:{parents:1,children:1}};
 const plain=Buffer.from(JSON.stringify(snapshot));const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);
 const encrypted=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
 const envelope={format:'airdropmuseum-aes256-gcm-v1',algorithm:'AES-256-GCM',iv:iv.toString('base64'),ciphertext:encrypted.toString('base64'),plaintext_sha256:createHash('sha256').update(plain).digest('hex'),plaintext_bytes:plain.length};
 const data=join(directory,'production.aesgcm');const keys=join(directory,'offline-key.txt');
 writeFileSync(data,JSON.stringify(envelope));writeFileSync(keys,'D1_RECOVERY_AES256_KEY='+key.toString('hex')+'\n',{mode:0o600});
 return {data,keys};
}
function run(...files){return spawnSync(process.execPath,['--no-warnings','--experimental-sqlite','scripts/verify-d1-json-recovery.mjs',...files],{cwd:process.cwd(),encoding:'utf8',timeout:15_000});}
test('encrypted D1 snapshots restore offline with full count and FK integrity',()=>{
 const dir=mkdtempSync(join(tmpdir(),'airdrop-rest-'));
 try{const {data,keys}=fixture(dir),output=join(dir,'restored.sqlite');const r=run(data,keys,output);
 assert.equal(r.status,0,r.stderr);
 assert.equal(JSON.parse(r.stdout).rows,2);
 const db=new DatabaseSync(output);
 assert.equal(db.prepare('SELECT name FROM parents WHERE id=?').get('p1').name,'A source row');
 assert.equal(db.prepare('SELECT detail FROM children WHERE id=?').get('c1').detail,'Synthetic verification');
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close();
 assert.equal(run(data,keys,output).status,1,'Existing restore must not be overwritten');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('wrong recovery key and tampered ciphertext fail without creating recovered database',()=>{
 const dir=mkdtempSync(join(tmpdir(),'airdrop-rest-'));
 try{const {data,keys}=fixture(dir);const wrong=join(dir,'wrong.txt');writeFileSync(wrong,'D1_RECOVERY_AES256_KEY='+randomBytes(32).toString('hex'));const output=join(dir,'no-restore.sqlite');
 assert.equal(run(data,wrong,output).status,1);assert.equal(existsSync(output),false);
 const original=JSON.parse(readFileSync(data,'utf8'));original.ciphertext='AAAA'+original.ciphertext.slice(4);writeFileSync(data,JSON.stringify(original));
 assert.equal(run(data,keys,output).status,1);assert.equal(existsSync(output),false);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

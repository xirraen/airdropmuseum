// Restore the AES-256-GCM JSON snapshot created through the authenticated D1 API.
// Offline verification only: NEVER connects to, overwrites, or deploys to Cloudflare.
// Usage: node --experimental-sqlite scripts/verify-d1-json-recovery.mjs snapshot.json.aesgcm recovery-keys.txt /absolute/private/restore.sqlite
import {readFileSync,existsSync,mkdirSync,realpathSync,rmSync,chmodSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {createDecipheriv,createHash,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const PROD_DB='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const SAFE=/^[a-zA-Z_][a-zA-Z0-9_]*$/;
const fail=(s)=>{throw Error(s)};
function safeOut(target){
 if(!isAbsolute(target))fail('RESTORE_DESTINATION_MUST_BE_ABSOLUTE');
 const out=resolve(target),root=realpathSync(process.cwd());
 if(out===root||relative(root,out)===''||(!relative(root,out).startsWith('..'+sep)&&relative(root,out)!=='..'&&!isAbsolute(relative(root,out))))fail('RESTORE_INSIDE_REPOSITORY_DENIED');
 if(existsSync(out)||existsSync(out+'-wal')||existsSync(out+'-shm'))fail('RESTORE_TARGET_ALREADY_EXISTS');
 mkdirSync(dirname(out),{recursive:true,mode:0o700});
 return out;
}
function decrypt(file,keyFile){
 const envelope=JSON.parse(readFileSync(file,'utf8'));
 if(envelope.format!=='airdropmuseum-aes256-gcm-v1'||envelope.algorithm!=='AES-256-GCM')fail('INVALID_ENCRYPTED_FORMAT');
 const keys=readFileSync(keyFile,'utf8');
 const k=/^D1_RECOVERY_AES256_KEY=([0-9a-f]{64})$/m.exec(keys)?.[1];
 if(!k)fail('MISSING_AES256_RECOVERY_KEY');
 const iv=Buffer.from(envelope.iv||'','base64'),crypt=Buffer.from(envelope.ciphertext||'','base64');
 if(iv.length!==12||crypt.length<17)fail('INVALID_ENCRYPTED_PAYLOAD');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(k,'hex'),iv);
 decipher.setAuthTag(crypt.subarray(crypt.length-16));
 const plain=Buffer.concat([decipher.update(crypt.subarray(0,crypt.length-16)),decipher.final()]);
 const expected=Buffer.from(envelope.plaintext_sha256||'','hex');
 const actual=createHash('sha256').update(plain).digest();
 if(expected.length!==32||!timingSafeEqual(expected,actual)||envelope.plaintext_bytes!==plain.length)fail('ENCRYPTED_SNAPSHOT_INTEGRITY_FAILED');
 const record=JSON.parse(plain.toString('utf8'));
 if(record.format!=='airdropmuseum-d1-snapshot-v1'||record.database_id!==PROD_DB)fail('UNEXPECTED_DATABASE_IDENTITY');
 if(!Array.isArray(record.schema)||typeof record.rows!=='object'||!record.rows||typeof record.counts!=='object')fail('INVALID_SNAPSHOT');
 return {record,sha256:actual.toString('hex')};
}
function restore(record,output){
 const db=new DatabaseSync(output);
 try {
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec('BEGIN IMMEDIATE');
  const tables=record.schema.filter(s=>s.type==='table');
  for(const s of tables){
   if(!SAFE.test(s.name)||typeof s.sql!=='string'||!/^CREATE\s+TABLE\b/i.test(s.sql))fail('INVALID_TABLE_SCHEMA');
   db.exec(s.sql);
  }
  for(const [name,rows] of Object.entries(record.rows)){
   if(!SAFE.test(name)||!Array.isArray(rows)||!tables.some(s=>s.name===name)||rows.length!==record.counts[name])fail('INVALID_TABLE_DATA');
   for(const row of rows){
    const fields=Object.keys(row);
    if(!fields.length||fields.some(k=>!SAFE.test(k)))fail('INVALID_COLUMN_NAME');
    const q=(s)=>'"'+s+'"';
    const sql='INSERT INTO '+q(name)+'('+fields.map(q).join(',')+') VALUES('+fields.map(()=>'?').join(',')+')';
    db.prepare(sql).run(...fields.map(k=>row[k]));
   }
  }
  for(const s of record.schema.filter(s=>s.type==='index'&&s.sql)){
   if(!SAFE.test(s.name)||!/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(s.sql))fail('INVALID_INDEX_SCHEMA');
   db.exec(s.sql);
  }
  db.exec('COMMIT');
  db.exec('PRAGMA foreign_keys=ON');
  if(db.prepare('PRAGMA foreign_key_check').all().length)fail('RESTORED_FOREIGN_KEY_VIOLATION');
  if(db.prepare('PRAGMA integrity_check').all().some(r=>r.integrity_check!=='ok'))fail('RESTORED_SQLITE_INTEGRITY_FAILED');
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
  if(names.length!==tables.length)fail('RESTORED_TABLE_COUNT_MISMATCH');
  let total=0;
  for(const [name,n] of Object.entries(record.counts)){
   const found=db.prepare('SELECT COUNT(*) AS n FROM "'+name+'"').get().n;
   if(found!==n)fail('RESTORED_ROW_COUNT_MISMATCH');
   total+=n;
  }
  return {tables:tables.length,rows:total,foreign_keys:'ok',sqlite_integrity:'ok'};
 }finally{db.close();}
}
let out=null;
try{
 if(process.argv.length!==5)fail('USAGE: node --experimental-sqlite scripts/verify-d1-json-recovery.mjs <encrypted-snapshot> <offline-keyfile> </absolute/private/restore.sqlite>');
 out=safeOut(process.argv[4]);
 const {record,sha256}=decrypt(process.argv[2],process.argv[3]);
 const info=restore(record,out);
 chmodSync(out,0o600);
 console.log(JSON.stringify({result:'PASS',...info,sha256,restored_to:'private offline SQLite file'}));
}catch(e){if(out){for(const f of [out,out+'-wal',out+'-shm'])try{rmSync(f,{force:true})}catch{}}console.error('RESTORE_VERIFICATION_FAILED: '+e.message);process.exitCode=1;}

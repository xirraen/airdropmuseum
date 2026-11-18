import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configureDisposableRestore,verifyBackup} from '../scripts/verify-private-backup.mjs';

function scratch(fn){
 const dir=mkdtempSync(join(tmpdir(),'am-disposable-sqlite-'));
 try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}
}

test('disposable verifier uses in-memory journal and skips fsync only on temporary SQLite connection',()=>scratch(dir=>{
 const dbPath=join(dir,'temporary.sqlite');
 const db=new DatabaseSync(dbPath);
 try{
  configureDisposableRestore(db);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode,'memory');
  assert.equal(db.prepare('PRAGMA synchronous').get().synchronous,0);
  db.exec('CREATE TABLE disposable (id INTEGER PRIMARY KEY); INSERT INTO disposable VALUES (1)');
  assert.equal(db.prepare('SELECT count(*) AS n FROM disposable').get().n,1);
 }finally{db.close();}
 // The setting does not convert the backing database into an unsafe
 // persistent WAL/journal mode for later, unrelated connections.
 const reopened=new DatabaseSync(dbPath);
 try{
  assert.notEqual(reopened.prepare('PRAGMA journal_mode').get().journal_mode,'memory');
  assert.equal(reopened.prepare('SELECT count(*) AS n FROM disposable').get().n,1);
 }finally{reopened.close();}
}));

test('disposable restore validates many independent SQL statements with normal inventory, hashes and integrity',()=>scratch(dir=>{
 const sql=[
  'CREATE TABLE am_core_schema(version INTEGER);INSERT INTO am_core_schema VALUES(17);',
  'CREATE TABLE d1_migrations(id INTEGER,name TEXT);INSERT INTO d1_migrations VALUES(1,\'0017_core.sql\');',
  'CREATE TABLE private_items(id INTEGER PRIMARY KEY, note TEXT);',
  ...Array.from({length:650},(_,i)=>`INSERT INTO private_items(id,note) VALUES (${i+1}, 'payload-${i+1}');`)
 ].join('\n');
 const dump=join(dir,'backup.sql'),restored=join(dir,'verify.sqlite');
 writeFileSync(dump,sql,{mode:0o600});
 const manifest=verifyBackup(dump,restored,['private_items']);
 assert.equal(manifest.table_counts.private_items,650);
 assert.equal(manifest.schema,17);
 assert.equal(manifest.integrity,'ok');
 assert.equal(manifest.foreign_keys,'ok');
 assert.deepEqual(manifest.migrations,['0017_core.sql']);
 assert.match(manifest.sha256,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(manifest).includes('payload-'),false);
 assert.equal(existsSync(restored+'-journal'),false);
}));

test('optimized verifier still rejects foreign-key orphans and malformed SQL exports',()=>scratch(dir=>{
 const dump=join(dir,'export.sql');
 writeFileSync(dump,[
  'PRAGMA foreign_keys=OFF;',
  'CREATE TABLE am_core_schema(version INTEGER);INSERT INTO am_core_schema VALUES(17);',
  "CREATE TABLE d1_migrations(id INTEGER,name TEXT);INSERT INTO d1_migrations VALUES(1,'0017_core.sql');",
  'CREATE TABLE parents(id INTEGER PRIMARY KEY);',
  'CREATE TABLE children(parent_id INTEGER REFERENCES parents(id));',
  'INSERT INTO children VALUES(123);'
 ].join('\n'));
 assert.throws(()=>verifyBackup(dump,join(dir,'orphaned.sqlite')),/BACKUP_FOREIGN_KEYS_FAILED/);
 writeFileSync(dump,'INVALID SQL HERE;');
 assert.throws(()=>verifyBackup(dump,join(dir,'syntax.sqlite')));
}));

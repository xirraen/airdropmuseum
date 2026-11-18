import {DatabaseSync} from 'node:sqlite';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';

// This SQLite file is a disposable local verifier, NEVER the production D1.
// Durable rollback journaling and fsync per INSERT in a large SQL dump can
// amplify a ~4 MB export into hundreds of MB of disk writes on ext4.
// Keep its rollback journal in memory and skip fsync for this disposable copy.
// SQL integrity, FK, inventory, migrations and SHA-256 checks are unchanged.
// A crash invalidates the temp copy; the operator must rerun the verification.
export function configureDisposableRestore(db){
 const journal=db.prepare('PRAGMA journal_mode=MEMORY').get()?.journal_mode;
 if(journal!=='memory')throw Error('BACKUP_LOCAL_JOURNAL_CONFIG_FAILED');
 db.exec('PRAGMA synchronous=OFF');
 if(db.prepare('PRAGMA synchronous').get()?.synchronous!==0)
  throw Error('BACKUP_LOCAL_SYNC_CONFIG_FAILED');
}

// Called only with a trusted D1 export and a new, private local destination.
export function verifyBackup(dumpPath,sqlitePath,expectedTables=[]){
 if(statSync(dumpPath).size>256*1024*1024)throw Error('BACKUP_TOO_LARGE_FOR_LOCAL_VERIFIER');
 const dump=readFileSync(dumpPath),db=new DatabaseSync(sqlitePath);
 try{
  configureDisposableRestore(db);
  db.exec(dump.toString('utf8'));
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('BACKUP_INTEGRITY_FAILED');
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('BACKUP_FOREIGN_KEYS_FAILED');
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all().map(x=>x.name);
  if(expectedTables.some(name=>!tables.includes(name)))throw Error('BACKUP_TABLE_MISSING');
  if(!tables.includes('am_core_schema')||!tables.includes('d1_migrations'))throw Error('BACKUP_CHECKPOINT_MISSING');
  const counts=Object.fromEntries(tables.map(name=>[name,db.prepare('SELECT COUNT(*) n FROM "'+name.replaceAll('"','""')+'"').get().n]));
  const migrations=db.prepare('SELECT name FROM d1_migrations ORDER BY id').all().map(x=>x.name);
  const schema=db.prepare('SELECT MAX(version) version FROM am_core_schema').get().version;
  return {format:'private-d1-backup-v1',sha256:createHash('sha256').update(dump).digest('hex'),bytes:dump.length,schema,migrations,table_counts:counts,integrity:'ok',foreign_keys:'ok'};
 }finally{db.close();}
}

import {DatabaseSync} from 'node:sqlite';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Called only with a trusted D1 export and a new, private local destination.
export function verifyBackup(dumpPath,sqlitePath,expectedTables=[]){
 if(statSync(dumpPath).size>256*1024*1024)throw Error('BACKUP_TOO_LARGE_FOR_LOCAL_VERIFIER');
 const dump=readFileSync(dumpPath),db=new DatabaseSync(sqlitePath);
 try{
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

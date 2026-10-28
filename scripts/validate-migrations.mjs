import {readdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const files=readdirSync('migrations').filter(x=>/^\d+.*\.sql$/.test(x)).sort();
if(files.length<3)throw Error('Missing migrations');
const db=new DatabaseSync(':memory:');
try{
 db.exec('PRAGMA foreign_keys=ON');
 for(const name of files){
  const sql=readFileSync('migrations/'+name,'utf8');
  if(!sql.trim())throw Error('Empty migration '+name);
  try{db.exec(sql);}catch(e){throw Error('Migration '+name+' is invalid: '+e.message);}
 }
 const core=db.prepare('SELECT MAX(version) v FROM am_core_schema').get();
 if(core.v<14)throw Error('Registry/decision bridge schema marker missing');
 if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key violations');
 for(const name of ['autopsy_events_immutable_update','autopsy_events_immutable_delete','autopsy_events_version_guard','aggregator_registry_insert','aggregator_registry_update'])
  if(!db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?").get(name))throw Error('Missing trigger '+name);
 console.log('Validated '+files.length+' migrations in a fresh SQLite database, schema version '+core.v);
}finally{db.close();}

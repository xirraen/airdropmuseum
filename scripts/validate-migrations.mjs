import {readdirSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const files=readdirSync('migrations').filter(x=>/^\d+.*\.sql$/.test(x)).sort();
if(files.length<3)throw Error('Missing migrations');
const db=new DatabaseSync(':memory:');
try{
 for(const name of files){
  const sql=readFileSync('migrations/'+name,'utf8');
  if(!sql.trim())throw Error('Empty migration '+name);
  try{db.exec(sql);}catch(e){throw Error('Migration '+name+' is invalid: '+e.message);}
 }
 const core=db.prepare('SELECT MAX(version) v FROM am_core_schema').get();
 if(core.v<9)throw Error('Sprint 9 schema marker missing');
 console.log('Validated '+files.length+' migrations in a fresh SQLite database, schema version '+core.v);
}finally{db.close();}

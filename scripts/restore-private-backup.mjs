import {readFileSync,writeFileSync,realpathSync,chmodSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

process.umask(0o077);
const id=process.env.RESTORE_STAGING_D1_ID||'';
if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)||['4e75c8b9-6c58-4bac-a180-01e5bec0d0a3','461404c7-a2c6-4222-bb13-6aa26fce2332'].includes(id.toLowerCase()))throw Error('FRESH_STAGING_DATABASE_REQUIRED');
if(!process.env.PRIVATE_BACKUP_DIRECTORY)throw Error('PRIVATE_BACKUP_DIRECTORY required');
const folder=realpathSync(process.env.PRIVATE_BACKUP_DIRECTORY),manifestPath=join(folder,'manifest.json');
for(let dir=folder;;dir=dirname(dir)){if(existsSync(join(dir,'.git')))throw Error('BACKUP_ROOT_IS_GIT_REPOSITORY');if(dirname(dir)===dir)break;}
chmodSync(folder,0o700);
const manifest=JSON.parse(readFileSync(manifestPath,'utf8')),dump=join(folder,'production.sql');
if(manifest.format!=='private-d1-backup-v1'||!manifest.local_restore_verified||manifest.source_database_id!=='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3'||createHash('sha256').update(readFileSync(dump)).digest('hex')!==manifest.sha256)throw Error('BACKUP_MANIFEST_OR_HASH_INVALID');
const config=join(folder,'restore-staging.json');
writeFileSync(config,JSON.stringify({name:'airdrop-museum-restore-drill',account_id:'9880cf2cc57c2096f8c3ae253d9852e6',compatibility_date:'2026-10-27',d1_databases:[{binding:'DB',database_name:'airdrop-museum-restore-drill',database_id:id,migrations_dir:resolve('migrations')}]}),{mode:0o600});
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
function run(args,label){
 const r=spawnSync(process.execPath,[wrangler,...args,'--config',config],{encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
 writeFileSync(join(folder,'restore-'+label+'.log'),(r.stdout||'')+(r.stderr||''),{mode:0o600});
 if(r.status!==0)throw Error('STAGING_RESTORE_STEP_FAILED: '+label+'; inspect private logs');
 return r.stdout;
}
function query(sql,label){
 const data=JSON.parse(run(['d1','execute','DB','--remote','--json','--command',sql],label));
 if(!Array.isArray(data)||data.some(x=>!x.success))throw Error('STAGING_QUERY_FAILED');
 return data.flatMap(x=>x.results||[]);
}
try{
 if(query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*'",'empty-check').length)throw Error('STAGING_NOT_EMPTY');
 run(['d1','execute','DB','--remote','--file',dump],'import');
 const tables=Object.keys(manifest.table_counts);
 const quote=name=>'"'+name.replaceAll('"','""')+'"';
 const counts=[];
 // D1 limits compound SELECT terms; separate statements preserve complete inventories.
 for(let offset=0;offset<tables.length;offset+=10){
  const countSql=tables.slice(offset,offset+10).map(name=>"SELECT '"+name.replaceAll("'","''")+"' table_name,COUNT(*) n FROM "+quote(name)).join('; ');
  counts.push(...query(countSql,'counts-'+offset));
 }
 if(counts.length!==tables.length||counts.some(row=>row.n!==manifest.table_counts[row.table_name]))throw Error('STAGING_RESTORE_COUNT_MISMATCH');
 if(query('PRAGMA foreign_key_check','foreign-keys').length)throw Error('STAGING_RESTORE_FOREIGN_KEYS_FAILED');
 // Imported d1_migrations is authoritative: Wrangler applies only the missing suffix.
 run(['d1','migrations','apply','DB','--remote'],'migrations');
 const marker=query('SELECT MAX(version) version FROM am_core_schema','schema');
 if(marker[0]?.version!==14)throw Error('STAGING_RELEASE_SCHEMA_MISSING');
 const applied=query('SELECT name FROM d1_migrations ORDER BY id','migration-history').map(row=>row.name);
 const expected=readdirSync(resolve('migrations')).filter(name=>name.endsWith('.sql')).sort();
 if(applied.length!==expected.length||!expected.every(name=>applied.includes(name))||!manifest.migrations.every(name=>applied.includes(name)))throw Error('STAGING_MIGRATION_HISTORY_MISMATCH');
 if(query('PRAGMA foreign_key_check','post-migration-foreign-keys').length)throw Error('STAGING_POST_MIGRATION_FOREIGN_KEYS_FAILED');
 writeFileSync(join(folder,'restore-evidence.json'),JSON.stringify({backup_sha256:manifest.sha256,staging_database_id:id,restored_counts:counts,migrations:applied,schema:14,verified_at:new Date().toISOString()},null,2)+'\n',{mode:0o600});
 writeFileSync(manifestPath,JSON.stringify({...manifest,remote_restore_verified:true,remote_restore_database_id:id},null,2)+'\n',{mode:0o600});
 console.log('PASS private backup restored into empty isolated D1; counts, migration history and foreign keys verified. No Worker deployed.');
}catch(error){console.error('Staging restore did not complete. '+error.message);process.exitCode=1;}

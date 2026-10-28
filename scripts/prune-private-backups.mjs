import {realpathSync,readdirSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {dirname,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
export function pruneBackups(root,{apply=false,now=Date.now()}={}){
 if(!root||!isAbsolute(root))throw Error('PRIVATE_BACKUP_ROOT_REQUIRED');
 const base=realpathSync(root);
 for(let dir=base;;dir=dirname(dir)){if(existsSync(join(dir,'.git')))throw Error('BACKUP_ROOT_IS_GIT_REPOSITORY');if(dirname(dir)===dir)break;}
 let expired=0,removed=0;
 for(const entry of readdirSync(base,{withFileTypes:true})){
  if(!entry.isDirectory()||existsSync(join(base,entry.name,'.git')))continue;
  let manifest;try{manifest=JSON.parse(readFileSync(join(base,entry.name,'manifest.json'),'utf8'));}catch{continue;}
  const date=Date.parse(manifest.created_at);
  if(manifest.format!=='private-d1-backup-v1'||manifest.source_database_id!=='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3'||!Number.isFinite(date)||now-date<30*86400000)continue;
  expired++;if(apply){rmSync(join(base,entry.name),{recursive:true,force:false});removed++;}
 }
 return {retention_days:30,expired,removed,dry_run:!apply};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(pruneBackups(process.env.PRIVATE_BACKUP_ROOT,{apply:process.env.PRIVATE_BACKUP_PRUNE_APPLY==='1'})));

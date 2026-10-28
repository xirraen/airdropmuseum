import {mkdirSync,writeFileSync,readFileSync,realpathSync,chmodSync,existsSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,relative,isAbsolute,join,sep,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyBackup} from './verify-private-backup.mjs';
import {encryptBackup,decryptBackup} from './backup-crypto.mjs';

process.umask(0o077);
const repo=realpathSync('.'),root=process.env.PRIVATE_BACKUP_ROOT;
if(!root||!isAbsolute(root))throw Error('PRIVATE_BACKUP_ROOT must be an absolute private directory outside Git');
mkdirSync(root,{recursive:true,mode:0o700});
const base=realpathSync(root),rel=relative(repo,base);
// Reject the repository and all children, including symlinks into it.
if(!rel||!(rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel)))throw Error('BACKUP_INSIDE_REPOSITORY_DENIED');
for(let dir=base;;dir=dirname(dir)){if(existsSync(join(dir,'.git')))throw Error('BACKUP_ROOT_IS_GIT_REPOSITORY');if(dirname(dir)===dir)break;}
chmodSync(base,0o700);
const keyRoot=process.env.PRIVATE_BACKUP_KEY_ROOT||join(homedir(),'.local','share','airdropmuseum-private-backup-keys');
if(!isAbsolute(keyRoot))throw Error('ABSOLUTE_BACKUP_KEY_ROOT_REQUIRED');
mkdirSync(keyRoot,{recursive:true,mode:0o700});const keys=realpathSync(keyRoot),keyRel=relative(base,keys);
if(!keyRel||!(keyRel==='..'||keyRel.startsWith('..'+sep)||isAbsolute(keyRel)))throw Error('BACKUP_KEYS_MUST_BE_SEPARATE');
for(let dir=keys;;dir=dirname(dir)){if(existsSync(join(dir,'.git')))throw Error('BACKUP_KEY_ROOT_IS_GIT_REPOSITORY');if(dirname(dir)===dir)break;}
chmodSync(keys,0o700);
const folder=join(base,new Date().toISOString().replaceAll(':','-')+'-'+crypto.randomUUID());
mkdirSync(folder,{mode:0o700});
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(config.account_id!=='9880cf2cc57c2096f8c3ae253d9852e6'||config.d1_databases?.[0]?.database_id!=='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3')throw Error('PRODUCTION_TARGET_MISMATCH');
const wrangler=resolve('node_modules/wrangler/bin/wrangler.js');
function run(args,label){
 const r=spawnSync(process.execPath,[wrangler,...args],{encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}});
 writeFileSync(join(folder,label+'.log'),(r.stdout||'')+(r.stderr||''),{mode:0o600});
 if(r.status!==0)throw Error('BACKUP_STEP_FAILED: '+label+'; inspect private logs');
 return r.stdout;
}
try{
 run(['d1','time-travel','info','airdrop-museum','--config','wrangler.jsonc','--json'],'checkpoint-before');
 const inventory=JSON.parse(run(['d1','execute','airdrop-museum','--remote','--config','wrangler.jsonc','--json','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' ORDER BY name"],'source-inventory'));
 if(!Array.isArray(inventory)||!inventory[0]?.success||!Array.isArray(inventory[0]?.results))throw Error('SOURCE_INVENTORY_INVALID');
 const expectedTables=inventory[0].results.map(row=>row.name);
 const dump=join(folder,'production.sql');
 run(['d1','export','airdrop-museum','--remote','--config','wrangler.jsonc','--output',dump],'export');
 chmodSync(dump,0o600);
 const manifest=verifyBackup(dump,join(folder,'restored.sqlite'),expectedTables);
 run(['d1','time-travel','info','airdrop-museum','--config','wrangler.jsonc','--json'],'checkpoint-after');
 const keyId=crypto.randomUUID(),sealed=join(folder,'production.sql.aesgcm'),keyFile=join(keys,keyId+'.key');
 const encrypted=encryptBackup(dump,sealed,keyFile),roundtrip=join(folder,'verified-roundtrip.sql');
 const verified=decryptBackup(sealed,roundtrip,keyFile);if(verified.sha256!==manifest.sha256)throw Error('ENCRYPTED_BACKUP_ROUNDTRIP_FAILED');
 writeFileSync(join(folder,'manifest.json'),JSON.stringify({...manifest,created_at:new Date().toISOString(),source_database_id:config.d1_databases[0].database_id,local_restore_verified:true,remote_restore_verified:false,encrypted:{...encrypted,key_id:keyId,file:'production.sql.aesgcm'}},null,2)+'\n',{mode:0o600});
 for(const file of [dump,roundtrip,join(folder,'restored.sqlite')])rmSync(file);
 console.log('PASS encrypted private export, authenticated decryption, SQLite restore, integrity and foreign keys. Remote staging restore remains required.');
}catch(error){
 console.error('Private backup did not complete. '+error.message);
 process.exitCode=1;
}

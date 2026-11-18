import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseChildEnv} from '../scripts/release-child-env.mjs';

test('offline release children inherit no Cloudflare, backup, GitHub, npm or WalletConnect credentials',()=>{
 const input={
  PATH:'/usr/bin',HOME:'/tmp/operator',CI:'false',
  CLOUDFLARE_API_TOKEN:'secret-live-token',
  CLOUDFLARE_API_KEY:'danger',
  CF_API_TOKEN:'secret-cloudflare',
  WRANGLER_API_TOKEN:'secret-wrangler',
  CLOUDFLARE_ACCOUNT_ID:'private-account',
  GITHUB_TOKEN:'github-token',
  GH_TOKEN:'other-github-token',
  NPM_TOKEN:'registry-token',
  npm_config__authToken:'registry-auth',
  SSH_AUTH_SOCK:'/tmp/private-key-socket',
  PRIVATE_BACKUP_KEY_ROOT:'/operator/backup-keys',
  PRIVATE_BACKUP_ROOT:'/operator/backup-files',
  RELEASE_EVIDENCE_FILE:'/operator/private-evidence',
  AIRDROP_PRODUCTION_RELEASE:'APPROVED',
  RESTORE_DRILL_VERIFIED:'YES',
  TELEGRAM_BOT_TOKEN:'telegram-token',
  WALLETCONNECT_PROJECT_ID:'project-id',
  DATABASE_PASSWORD:'private',
  API_HASH_PEPPER:'pepper'
 };
 const original={...input};
 const offline=releaseChildEnv(input);
 assert.deepEqual(input,original,'Input environment must not be mutated');
 assert.equal(offline.PATH,input.PATH);
 assert.equal(offline.HOME,input.HOME);
 assert.equal(offline.CI,'true');
 assert.equal(offline.WRANGLER_SEND_METRICS,'false');
 for(const key of Object.keys(input)){
  if(key==='PATH'||key==='HOME'||key==='CI')continue;
  assert.equal(Object.hasOwn(offline,key),false,key+' was leaked into offline child');
 }
 const cloud=releaseChildEnv(input,{cloudAccess:true});
 for(const [key,value] of Object.entries(input))
  assert.equal(cloud[key],key==='CI'?'true':value,'Cloudflare operator command should retain intentional credentials: '+key);
 assert.equal(cloud.WRANGLER_SEND_METRICS,'false');
});

test('operator release uses an offline environment for npm install/tests/build/audit',()=>{
 const source=readFileSync('scripts/release-production.mjs','utf8');
 assert.match(source,/import \{releaseChildEnv\} from '\.\/release-child-env\.mjs'/);
 assert.match(source,/const run=\(cmd,args,label,\{cloudAccess=false\}=\{\}\)/);
 assert.match(source,/env:releaseChildEnv\(process\.env,\{cloudAccess\}\)/);
 assert.match(source,/run\('npm',\['ci'\],'Install frozen dependencies'\)/);
 assert.match(source,/\['Audit',\['audit','--omit=dev','--audit-level=high'\]\]/);
 assert.match(source,/scripts\/private-db-backup\.mjs.*\{cloudAccess:true\}/);
 assert.match(source,/migrations','apply'.*\{cloudAccess:true\}/);
 assert.match(source,/Deploy versioned Worker with source provenance',\{cloudAccess:true\}/);
});

test('Wrangler custom builds run with sanitized credentials even from a cloud-enabled parent',async()=>{
 const {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');
 const {spawnSync}=await import('node:child_process');const root=mkdtempSync(join(tmpdir(),'am-custom-build-env-'));
 try{
  mkdirSync(join(root,'scripts'));
  for(const name of ['build-worker-offline.mjs','release-child-env.mjs'])copyFileSync(resolve('scripts',name),join(root,'scripts',name));
  writeFileSync(join(root,'scripts','build-worker.mjs'),"console.log(JSON.stringify({token:process.env.CLOUDFLARE_API_TOKEN,backup:process.env.PRIVATE_BACKUP_KEY_ROOT,approval:process.env.AIRDROP_PRESENTATION_RELEASE,ci:process.env.CI}));");
  const result=spawnSync(process.execPath,['scripts/build-worker-offline.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,CLOUDFLARE_API_TOKEN:'SYNTHETIC_TOKEN',PRIVATE_BACKUP_KEY_ROOT:'/synthetic/keys',AIRDROP_PRESENTATION_RELEASE:'APPROVED'}});
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{ci:'true'});
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  assert.equal(config.build.command,'node scripts/build-worker-offline.mjs');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('presentation release isolates offline subprocesses and grants auth only to remote checks',()=>{
 const source=readFileSync('scripts/release-presentation.mjs','utf8');
 assert.match(source,/import \{releaseChildEnv\} from '\.\/release-child-env\.mjs'/);
 assert.match(source,/env:releaseChildEnv\(process\.env,\{cloudAccess\}\)/);
 assert.match(source,/const run=\(tool,args,label,\{cloudAccess=false\}=\{\}\)/);
 assert.match(source,/scripts\/verify-production-bindings\.mjs.*\{cloudAccess:true\}/);
 assert.match(source,/Style-only Worker deployment',\{cloudAccess:true\}/);
 assert.match(source,/--command',sql\],\{cloudAccess:true\}/);
});

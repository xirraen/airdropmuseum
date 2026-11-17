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

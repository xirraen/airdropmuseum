import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,rmSync} from 'node:fs';
const settings={STAGING_ACCOUNT_ID:'a'.repeat(32),STAGING_RATE_LIMIT_NAMESPACE_ID:'9999',STAGING_ORIGIN:'https://airdrop-museum-staging.example.workers.dev',STAGING_D1_DATABASE_ID:'00000000-0000-4000-8000-000000000099',STAGING_TRUST_KV_ID:'1'.repeat(32),STAGING_ERASURE_KV_ID:'2'.repeat(32)};
test('full staging config uses distinct resources and omits production credentials',()=>{
 try{
  const generate=(env)=>spawnSync(process.execPath,['scripts/create-staging-config.mjs'],{encoding:'utf8',env:{...process.env,...settings,...env}});
  assert.equal(generate({}).status,0);
  const p=JSON.parse(readFileSync('wrangler.jsonc','utf8')),s=JSON.parse(readFileSync('.wrangler-staging.jsonc','utf8'));
  assert.equal(s.account_id,settings.STAGING_ACCOUNT_ID);assert.equal(s.vars.TELEGRAM_AUTH_MODE,'synthetic');
  assert.notEqual(s.d1_databases[0].database_id,p.d1_databases[0].database_id);
  assert.ok(s.queues.producers.every(b=>b.queue.startsWith('airdrop-museum-staging-')));
  assert.ok(s.queues.consumers.every(b=>b.queue.startsWith('airdrop-museum-staging-')));
  assert.equal(s.vars.TELEGRAM_BOT_TOKEN,undefined);assert.equal(s.vars.RPC_1,undefined);
  assert.notEqual(generate({STAGING_D1_DATABASE_ID:p.d1_databases[0].database_id.toUpperCase()}).status,0);
  assert.notEqual(generate({STAGING_TRUST_KV_ID:p.kv_namespaces[0].id}).status,0);
  assert.notEqual(generate({STAGING_ORIGIN:'https://airdrop-museum.example.workers.dev'}).status,0);
 }finally{rmSync('.wrangler-staging.jsonc',{force:true});}
});

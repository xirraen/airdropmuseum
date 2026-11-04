import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBindings,verifyProductionBindings} from '../scripts/verify-production-bindings.mjs';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
test('production binding gate fails closed for audit drift and runtime deployment credentials',async()=>{
 assert.throws(()=>validateBindings({bindings:[]},config),/MISSING_PRODUCTION_BINDINGS/);
 const bindings=[...config.d1_databases.map(b=>({name:b.binding,id:b.database_id})),...config.kv_namespaces.map(b=>({name:b.binding,namespace_id:b.id})),...config.r2_buckets.map(b=>({name:b.binding,bucket_name:b.bucket_name})),...config.queues.producers.map(b=>({name:b.binding,queue_name:b.queue})),...config.ratelimits.map(b=>({name:b.name})),...config.analytics_engine_datasets.map(b=>({name:b.binding})),...['TELEGRAM_BOT_TOKEN','ADMIN_CSRF_PEPPER','BACKUP_SIGNING_KEY','API_HASH_PEPPER','WEBHOOK_MASTER_SECRET'].map(name=>({name,type:'secret_text'}))];
 assert.equal(validateBindings({bindings},config).verified,true);
 assert.throws(()=>validateBindings({bindings:[...bindings,{name:'CLOUDFLARE_API_TOKEN',type:'secret_text'}]},config),/CREDENTIAL_IN_RUNTIME/);
 assert.throws(()=>validateBindings({bindings:bindings.map(b=>b.name==='DB'?{...b,id:'wrong'}:b)},config),/D1_TARGET_DRIFT/);
 await assert.rejects(()=>verifyProductionBindings(config,null),/CREDENTIAL_REQUIRED/);
});

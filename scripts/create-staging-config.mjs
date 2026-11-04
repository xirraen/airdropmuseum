import {readFileSync,writeFileSync} from 'node:fs';
const production=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const value=name=>{const v=process.env[name];if(!v)throw Error('STAGING_SETTING_REQUIRED: '+name);return v;};
const uuid=name=>{const v=value(name).toLowerCase();if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)||production.d1_databases.some(b=>b.database_id.toLowerCase()===v))throw Error('ISOLATED_STAGING_D1_REQUIRED');return v;};
const kv=name=>{const v=value(name).toLowerCase();if(!/^[a-f0-9]{32}$/.test(v)||production.kv_namespaces.some(b=>b.id.toLowerCase()===v))throw Error('ISOLATED_STAGING_KV_REQUIRED');return v;};
const namespace=value('STAGING_RATE_LIMIT_NAMESPACE_ID');if(!/^\d+$/.test(namespace)||production.ratelimits.some(b=>String(b.namespace_id)===namespace))throw Error('ISOLATED_STAGING_LIMITER_REQUIRED');
const origin=new URL(value('STAGING_ORIGIN'));if(origin.protocol!=='https:'||origin.username||origin.password||origin.port||!origin.hostname.startsWith('airdrop-museum-staging.')||!origin.hostname.endsWith('.workers.dev'))throw Error('DEDICATED_STAGING_ORIGIN_REQUIRED');
const config=structuredClone(production);
config.name='airdrop-museum-staging';
const account=process.env.STAGING_ACCOUNT_ID||production.account_id;
if(!/^[a-f0-9]{32}$/.test(account))throw Error('STAGING_ACCOUNT_ID_INVALID');
config.account_id=account;
config.d1_databases=[{binding:'DB',database_name:'airdrop-museum-staging',database_id:uuid('STAGING_D1_DATABASE_ID'),migrations_dir:'migrations'}];
config.kv_namespaces=[{binding:'TRUST_CACHE',id:kv('STAGING_TRUST_KV_ID')},{binding:'JOURNAL_ERASURE_LEDGER',id:kv('STAGING_ERASURE_KV_ID')}];
if(config.kv_namespaces[0].id===config.kv_namespaces[1].id)throw Error('DISTINCT_STAGING_KV_REQUIRED');
config.r2_buckets=[{binding:'AGGREGATOR_BACKUP_BUCKET',bucket_name:'airdrop-museum-staging-user-backups'}];
const queue=name=>name.replace('airdrop-museum-','airdrop-museum-staging-');
for(const b of config.queues.producers)b.queue=queue(b.queue);
for(const b of config.queues.consumers){b.queue=queue(b.queue);if(b.dead_letter_queue)b.dead_letter_queue=queue(b.dead_letter_queue);}
config.ratelimits[0].namespace_id=namespace;
config.analytics_engine_datasets[0].dataset='airdropmuseum_staging_operations';
config.vars={ENVIRONMENT:'staging',SIDE_EFFECTS_ENABLED:'0',TELEGRAM_AUTH_MODE:'synthetic',REQUIRE_RATE_LIMIT_BINDINGS:'1',PUBLIC_APP_URL:origin.origin,PUBLIC_API_ORIGIN:origin.origin,TRUST_PUBLIC_ORIGIN:origin.origin,PUBLIC_API_ALLOWED_ORIGINS:origin.origin,AGGREGATOR_QUEUE_NAME:'airdrop-museum-staging-aggregator',PARTNER_WEBHOOK_QUEUE_NAME:'airdrop-museum-staging-partner-webhook',PARTNER_WEBHOOK_DLQ_NAME:'airdrop-museum-staging-partner-webhook-dlq',PARTNER_WEBHOOK_ALLOWED_HOSTS:''};
// No production secrets, discovery URLs, RPCs or credentials are copied.
writeFileSync('.wrangler-staging.jsonc',JSON.stringify(config,null,2)+'\n',{mode:0o600});
console.log('Generated isolated staging configuration; no resources were provisioned or deployed.');

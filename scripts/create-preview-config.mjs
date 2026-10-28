import {readFileSync,writeFileSync} from 'node:fs';
const production=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const id=process.env.PREVIEW_D1_DATABASE_ID||'';
const limiter=process.env.PREVIEW_RATE_LIMIT_NAMESPACE_ID||'';
const pr=process.env.PREVIEW_PR_NUMBER||'';
if(!/^[0-9a-f-]{36}$/i.test(id)||id===production.d1_databases?.[0]?.database_id)throw Error('Dedicated preview D1 binding required');
if(!/^\d+$/.test(limiter)||limiter===String(production.ratelimits?.[0]?.namespace_id))throw Error('Dedicated preview rate limit namespace required');
if(!/^\d{1,7}$/.test(pr))throw Error('Invalid PR number');
const cfg={name:'airdrop-museum-preview-pr-'+pr,main:'src/worker.mjs',compatibility_date:production.compatibility_date,compatibility_flags:production.compatibility_flags,workers_dev:true,build:production.build,
 d1_databases:[{binding:'DB',database_name:'airdrop-museum-preview',database_id:id,migrations_dir:'migrations'}],
 ratelimits:[{name:'PUBLIC_API_RATE_LIMITER',namespace_id:limiter,simple:{limit:150,period:60}}],
 vars:{REQUIRE_RATE_LIMIT_BINDINGS:'1',PUBLIC_API_ORIGIN:'https://example.org',PUBLIC_API_ALLOWED_ORIGINS:'',TRUST_PUBLIC_ORIGIN:'https://example.org'},
 observability:{enabled:true,logs:{enabled:true,head_sampling_rate:1}}};
writeFileSync('.wrangler-preview.jsonc',JSON.stringify(cfg,null,2)+'\n',{mode:0o600});

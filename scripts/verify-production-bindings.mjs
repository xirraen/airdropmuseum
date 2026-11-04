import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
export function validateBindings(settings,config){
 const required=[...config.d1_databases.map(b=>b.binding),...config.kv_namespaces.map(b=>b.binding),...config.r2_buckets.map(b=>b.binding),...config.queues.producers.map(b=>b.binding),...config.ratelimits.map(b=>b.name),...config.analytics_engine_datasets.map(b=>b.binding)];
 const bindings=new Map((settings.bindings||[]).map(b=>[b.name,b]));
 const missing=required.filter(name=>!bindings.has(name));
 if(missing.length)throw Error('MISSING_PRODUCTION_BINDINGS: '+missing.join(','));
 if(bindings.has('CLOUDFLARE_API_TOKEN'))throw Error('DEPLOYMENT_CREDENTIAL_IN_RUNTIME');
 for(const expected of config.d1_databases)if(bindings.get(expected.binding)?.id!==expected.database_id)throw Error('D1_TARGET_DRIFT');
 for(const expected of config.kv_namespaces)if(bindings.get(expected.binding)?.namespace_id!==expected.id)throw Error('KV_TARGET_DRIFT');
 for(const expected of config.r2_buckets)if(bindings.get(expected.binding)?.bucket_name!==expected.bucket_name)throw Error('R2_TARGET_DRIFT');
 for(const expected of config.queues.producers)if(bindings.get(expected.binding)?.queue_name!==expected.queue)throw Error('QUEUE_TARGET_DRIFT');
 for(const name of ['TELEGRAM_BOT_TOKEN','ADMIN_CSRF_PEPPER','BACKUP_SIGNING_KEY','API_HASH_PEPPER','WEBHOOK_MASTER_SECRET'])if(bindings.get(name)?.type!=='secret_text')throw Error('RUNTIME_SECRET_REQUIRED: '+name);
 return {verified:true,binding_names:[...bindings.keys()].sort()};
}
export async function verifyProductionBindings(config,token,fetcher=fetch){
 if(!token)throw Error('DEPLOYMENT_CREDENTIAL_REQUIRED');
 const response=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/workers/scripts/${config.name}/settings`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('PRODUCTION_BINDING_READ_FAILED');
 const data=await response.json();if(!data.success)throw Error('PRODUCTION_BINDING_READ_FAILED');
 return validateBindings(data.result,config);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 console.log(JSON.stringify(await verifyProductionBindings(config,process.env.CLOUDFLARE_API_TOKEN)));
}

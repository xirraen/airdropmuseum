// Connected operator transport: creates an inactive release version, never activates it.
// Credentials stay in the connector; existing runtime secrets are explicitly inherited.
export async function prepareProductionVersion(request,accountId,source,expectedHash,config,commit){
 if(accountId!=='9880cf2cc57c2096f8c3ae253d9852e6'||config.account_id!==accountId||config.name!=='airdrop-museum'||config.d1_databases?.[0]?.database_id!=='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3')throw Error('PRODUCTION_TARGET_MISMATCH');
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('VERIFIED_COMMIT_REQUIRED');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==expectedHash)throw Error('ARTIFACT_HASH_MISMATCH');
 const old=await request({method:'GET',path:`/accounts/${accountId}/workers/scripts/airdrop-museum/settings`});
 if(!old.success)throw Error('SETTINGS_READ_FAILED');
 const secrets=new Set(old.result.bindings.filter(b=>b.type==='secret_text').map(b=>b.name));
 for(const required of ['TELEGRAM_BOT_TOKEN','ADMIN_CSRF_PEPPER','BACKUP_SIGNING_KEY'])if(!secrets.has(required))throw Error('EXISTING_SECRET_REQUIRED: '+required);
 const bindings=[{name:'DB',type:'d1',database_id:config.d1_databases[0].database_id},{name:'AI',type:'ai'}];
 for(const name of secrets)if(name!=='CLOUDFLARE_API_TOKEN')bindings.push({name,type:'inherit'});
 for(const name of ['API_HASH_PEPPER','WEBHOOK_MASTER_SECRET'])if(!secrets.has(name))bindings.push({name,type:'secret_text',text:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')});
 for(const b of config.kv_namespaces)bindings.push({name:b.binding,type:'kv_namespace',namespace_id:b.id});
 for(const b of config.r2_buckets)bindings.push({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name});
 for(const b of config.queues.producers)bindings.push({name:b.binding,type:'queue',queue_name:b.queue});
 for(const b of config.ratelimits)bindings.push({name:b.name,type:'ratelimit',namespace_id:b.namespace_id,simple:b.simple});
 for(const b of config.analytics_engine_datasets)bindings.push({name:b.binding,type:'analytics_engine',dataset:b.dataset});
 for(const [name,text]of Object.entries({...config.vars,ENVIRONMENT:'production',PARTNER_WEBHOOK_ALLOWED_HOSTS:''})){if(/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY/.test(name))throw Error('PLAINTEXT_SECRET_DENIED');bindings.push({name,type:'plain_text',text});}
 const metadata={main_module:'worker.js',compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags,bindings,annotations:{'workers/commit_sha':commit,'workers/message':'Owner-authorized main release; artifact '+hash}};
 const boundary='----ProductionVersion'+Date.now();
 const body=['--'+boundary,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(metadata),'--'+boundary,'Content-Disposition: form-data; name="worker.js"; filename="worker.js"','Content-Type: application/javascript+module','',source,'--'+boundary+'--',''].join('\r\n');
 const result=await request({method:'POST',path:`/accounts/${accountId}/workers/scripts/airdrop-museum/versions`,body,contentType:'multipart/form-data; boundary='+boundary,rawBody:true});
 if(!result.success)throw Error('PRODUCTION_VERSION_PREPARATION_FAILED');
 return {version_id:result.result.id,artifact_sha256:hash,commit,activated:false,binding_names:bindings.map(b=>b.name).sort()};
}

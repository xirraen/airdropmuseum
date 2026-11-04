// Reusable transport-neutral operations for the authenticated Cloudflare connector.
// Never receives, returns or installs a Cloudflare deployment credential.
export async function provisionStaging(request,accountId){
 if(!/^[a-f0-9]{32}$/.test(accountId))throw Error('INVALID_STAGING_ACCOUNT');
 const base='/accounts/'+accountId,resources={},blocked=[];
 const call=async(method,path,body)=>{const r=await request({method,path:base+path,...(body?{body}:{})});if(!r.success)throw Error('CLOUDFLARE_REQUEST_FAILED');return r.result;};
 const databases=await call('GET','/d1/database');
 let db=databases.find(x=>x.name==='airdrop-museum-staging');
 if(!db)db=await call('POST','/d1/database',{name:'airdrop-museum-staging',primary_location_hint:'apac'});
 const databaseId=db.uuid||db.id;if(databaseId==='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3')throw Error('PRODUCTION_DATABASE_DENIED');
 resources.d1={id:databaseId,name:db.name};
 const namespaces=await call('GET','/storage/kv/namespaces');resources.kv=[];
 for(const title of ['airdrop-museum-staging-trust-cache','airdrop-museum-staging-journal-erasure-ledger']){
  let kv=namespaces.find(x=>x.title===title);if(!kv)kv=await call('POST','/storage/kv/namespaces',{title});resources.kv.push({id:kv.id,name:kv.title});
 }
 try{
  const buckets=(await call('GET','/r2/buckets')).buckets;let bucket=buckets.find(x=>x.name==='airdrop-museum-staging-user-backups');
  if(!bucket)bucket=await call('POST','/r2/buckets',{name:'airdrop-museum-staging-user-backups',locationHint:'apac'});
  resources.r2={name:bucket.name};
 }catch{blocked.push('R2_UNAVAILABLE: enable R2 in the selected staging account; do not substitute a production bucket');}
 const queues=await call('GET','/queues');resources.queues=[];
 for(const suffix of ['discovery','discovery-dlq','partner-webhook','partner-webhook-dlq','aggregator','aggregator-dlq']){
  const name='airdrop-museum-staging-'+suffix;let q=queues.find(x=>x.queue_name===name);
  if(!q)q=await call('POST','/queues',{queue_name:name});resources.queues.push({id:q.queue_id,name:q.queue_name});
 }
 const subdomain=(await call('GET','/workers/subdomain')).subdomain;
 return {account_id:accountId,resources,origin:'https://airdrop-museum-staging.'+subdomain+'.workers.dev',blocked};
}
export async function deployStaging(request,accountId,source,expectedHash,config,{allowPartial=false}={}){
 if(config.name!=='airdrop-museum-staging'||config.account_id!==accountId||!/^[a-f0-9]{32}$/.test(accountId))throw Error('STAGING_TARGET_REQUIRED');
 if(config.vars?.ENVIRONMENT!=='staging'||config.vars?.SIDE_EFFECTS_ENABLED!=='0')throw Error('STAGING_SAFETY_REQUIRED');
 if(config.d1_databases?.length!==1||config.d1_databases[0].database_name!=='airdrop-museum-staging'||config.d1_databases[0].database_id==='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3')throw Error('ISOLATED_STAGING_D1_REQUIRED');
 const missing=[];if(!config.r2_buckets?.length)missing.push('R2');if(!config.analytics_engine_datasets?.length)missing.push('ANALYTICS');
 if(missing.length&&!allowPartial)throw Error('FULL_STAGING_BINDINGS_REQUIRED');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==expectedHash)throw Error('ARTIFACT_HASH_MISMATCH');
 const bindings=[{name:'DB',type:'d1',id:config.d1_databases[0].database_id}];
 for(const kv of config.kv_namespaces||[]){if(['bc8fc9f66cf7495f9ad2f2c4917e1674','cb0cc6c853a74270b23771ab35515d1b'].includes(kv.id))throw Error('PRODUCTION_KV_DENIED');bindings.push({name:kv.binding,type:'kv_namespace',namespace_id:kv.id});}
 for(const r of config.r2_buckets||[]){if(!r.bucket_name.startsWith('airdrop-museum-staging-'))throw Error('PRODUCTION_R2_DENIED');bindings.push({name:r.binding,type:'r2_bucket',bucket_name:r.bucket_name});}
 for(const q of config.queues?.producers||[]){if(!q.queue.startsWith('airdrop-museum-staging-'))throw Error('PRODUCTION_QUEUE_DENIED');bindings.push({name:q.binding,type:'queue',queue_name:q.queue});}
 for(const r of config.ratelimits||[]){if(String(r.namespace_id)==='1008')throw Error('PRODUCTION_RATE_LIMITER_DENIED');bindings.push({name:r.name,type:'ratelimit',namespace_id:r.namespace_id,simple:r.simple});}
 for(const a of config.analytics_engine_datasets||[])bindings.push({name:a.binding,type:'analytics_engine',dataset:a.dataset});
 for(const [name,text]of Object.entries(config.vars)){if(/TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY/.test(name))throw Error('SECRET_IN_CONFIGURATION_DENIED');bindings.push({name,type:'plain_text',text});}
 const metadata={main_module:'worker.js',compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags,bindings,keep_bindings:['secret_text'],annotations:{'workers/message':'Staging artifact '+hash+'; missing: '+missing.join(',')},observability:{enabled:true,logs:{enabled:true,invocation_logs:true}}};
 const boundary='----StagingUpload'+Date.now();
 const body=['--'+boundary,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(metadata),'--'+boundary,'Content-Disposition: form-data; name="worker.js"; filename="worker.js"','Content-Type: application/javascript+module','',source,'--'+boundary+'--',''].join('\r\n');
 const r=await request({method:'PUT',path:'/accounts/'+accountId+'/workers/scripts/airdrop-museum-staging',body,contentType:'multipart/form-data; boundary='+boundary,rawBody:true});
 if(!r.success)throw Error('STAGING_UPLOAD_FAILED');
 return {deployment_id:r.result?.deployment_id,artifact_sha256:hash,missing_capabilities:missing,production_ready:false};
}

/**
 * Refuse to import a private production backup into an unknown, old, or
 * Worker-bound D1 database. This check only uses Cloudflare GET endpoints.
 *
 * The caller still MUST test that the D1 is empty and have separate human
 * evidence that no Worker, namespace, or consumer can access the restore copy.
 * A current settings inventory cannot prove all future/indirect bindings.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ACCOUNT=/^[0-9a-f]{32}$/i;
const PROD='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const DISALLOWED=new Set([
 PROD,'461404c7-a2c6-4222-bb13-6aa26fce2332',
 'dbdc0402-dd9a-4548-bea1-f5f1f2af5aa0',
 '2befecb7-2d37-43df-aec6-113c6d1d7bf5'
]);
const MAX_WORKERS=500;
const MAX_AGE=72*60*60*1000;

async function cloudflareGet(fetcher,token,path){
 const response=await fetcher('https://api.cloudflare.com/client/v4'+path,{
  method:'GET',headers:{Authorization:'Bearer '+token},
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw Error('RESTORE_TARGET_CLOUDFLARE_READ_FAILED');
 const value=await response.json();
 if(!value?.success)throw Error('RESTORE_TARGET_CLOUDFLARE_READ_FAILED');
 return value.result;
}

function checkRestoreBindings(bindings,databaseId){
   if(!Array.isArray(bindings))throw Error('RESTORE_WORKER_BINDINGS_UNVERIFIED');
   for(const binding of bindings){
    if(binding?.type!=='d1'&&binding?.type!=='d1_database')continue;
    const bound=binding.id||binding.database_id;
    if(typeof bound!=='string'||!UUID.test(bound))
     throw Error('RESTORE_WORKER_BINDINGS_UNVERIFIED');
    if(bound.toLowerCase()===databaseId.toLowerCase())
     throw Error('RESTORE_DATABASE_ALREADY_BOUND_TO_WORKER');
   }
}

/**
 * Read-only target audit to run immediately before the first remote D1 write.
 * Returns non-sensitive evidence metadata; never returns secret values.
 */
export async function verifyRestoreTarget({
 accountId,databaseId,token=process.env.CLOUDFLARE_API_TOKEN,
 now=Date.now(),fetcher=fetch
}={}){
 if(!ACCOUNT.test(accountId||''))throw Error('RESTORE_TARGET_ACCOUNT_INVALID');
 if(!UUID.test(databaseId||'')||DISALLOWED.has(databaseId.toLowerCase()))
  throw Error('FRESH_STAGING_DATABASE_REQUIRED');
 if(!token)throw Error('RESTORE_TARGET_CLOUDFLARE_TOKEN_REQUIRED');
 const base='/accounts/'+accountId;
 const database=await cloudflareGet(fetcher,token,base+'/d1/database/'+databaseId);
 if(database?.uuid?.toLowerCase()!==databaseId.toLowerCase()||
    !/^airdrop-museum-restore-drill(?:-[a-z0-9-]{1,32})?$/.test(database.name||''))
  throw Error('RESTORE_TARGET_DATABASE_IDENTITY_MISMATCH');
 const created=Date.parse(database.created_at||'');
 if(!Number.isFinite(created)||created>now+5*60*1000||now-created>MAX_AGE)
  throw Error('RESTORE_TARGET_NOT_RECENTLY_CREATED');
 const scripts=await cloudflareGet(fetcher,token,base+'/workers/scripts');
 if(!Array.isArray(scripts)||scripts.length>MAX_WORKERS||
    scripts.some(s=>typeof s?.id!=='string'||!/^[a-z0-9_][a-z0-9_-]*$/.test(s.id)))
  throw Error('RESTORE_WORKER_INVENTORY_INVALID');
 // A partial list or failed settings request must NEVER be treated as isolation.
 const seen=new Set(),snapshots=new Map();
 let activeVersionsChecked=0;
 for(const script of scripts){
  if(seen.has(script.id))throw Error('RESTORE_WORKER_INVENTORY_INVALID');
  seen.add(script.id);
  const settings=await cloudflareGet(fetcher,token,base+'/workers/scripts/'+encodeURIComponent(script.id)+'/settings');
  if(!Array.isArray(settings?.bindings))throw Error('RESTORE_WORKER_BINDINGS_UNVERIFIED');
  checkRestoreBindings(settings.bindings,databaseId);
  // The script's latest settings do not necessarily describe the version
  // currently receiving requests. Inspect every positive-traffic version.
  const prefix=base+'/workers/scripts/'+encodeURIComponent(script.id);
  const live=await cloudflareGet(fetcher,token,prefix+'/deployments');
  const current=live?.deployments?.[0];
  if(!current?.id||!Array.isArray(current.versions)||current.versions.length>20||
     !current.versions.length)
   throw Error('RESTORE_ACTIVE_DEPLOYMENT_UNVERIFIED');
  const percentages=current.versions.map(v=>Number(v?.percentage));
  if(percentages.some(n=>!Number.isFinite(n)||n<0||n>100)||
     Math.abs(percentages.reduce((a,b)=>a+b,0)-100)>0.001)
   throw Error('RESTORE_ACTIVE_DEPLOYMENT_UNVERIFIED');
  const versionIds=new Set();
  for(let index=0;index<current.versions.length;index++){
   if(percentages[index]===0)continue;
   const versionId=current.versions[index].version_id;
   if(!UUID.test(versionId||'')||versionIds.has(versionId))
    throw Error('RESTORE_ACTIVE_DEPLOYMENT_UNVERIFIED');
   versionIds.add(versionId);
   const version=await cloudflareGet(fetcher,token,prefix+'/versions/'+encodeURIComponent(versionId));
   if(version?.id!==versionId)throw Error('RESTORE_ACTIVE_DEPLOYMENT_UNVERIFIED');
   checkRestoreBindings(version.resources?.bindings,databaseId);
   activeVersionsChecked++;
  }
  snapshots.set(script.id,JSON.stringify(current));
  // A routing change during the inspection invalidates the isolation finding.
  const reread=await cloudflareGet(fetcher,token,prefix+'/deployments');
  if(reread?.deployments?.[0]?.id!==current.id)
   throw Error('RESTORE_ACTIVE_DEPLOYMENT_CHANGED');
 }
 // A Worker inspected early may change while later Workers are being read.
 // Recheck account membership, latest bindings and all deployment snapshots
 // after the complete first pass. No read-only check can prevent a deployment
 // after it returns: the operator still must exclude concurrent deploys/imports.
 const finalScripts=await cloudflareGet(fetcher,token,base+'/workers/scripts');
 if(!Array.isArray(finalScripts)||finalScripts.length!==seen.size||
    new Set(finalScripts.map(s=>s?.id)).size!==seen.size||
    finalScripts.some(s=>!seen.has(s?.id)))
  throw Error('RESTORE_WORKER_INVENTORY_CHANGED');
 for(const script of finalScripts){
  const prefix=base+'/workers/scripts/'+encodeURIComponent(script.id);
  const settings=await cloudflareGet(fetcher,token,prefix+'/settings');
  checkRestoreBindings(settings?.bindings,databaseId);
  const live=await cloudflareGet(fetcher,token,prefix+'/deployments');
  if(JSON.stringify(live?.deployments?.[0])!==snapshots.get(script.id))
   throw Error('RESTORE_ACTIVE_DEPLOYMENT_CHANGED');
 }
 return {
  status:'READ_ONLY_TARGET_ISOLATION_CHECK_PASSED',
  account_id:accountId,
  database_id:databaseId,
  database_name:database.name,
  created_at:database.created_at,
  worker_scripts_checked:scripts.length,
  active_worker_versions_checked:activeVersionsChecked,
  all_current_worker_bindings_checked:true,
  no_worker_deployed_or_database_written:true,
  note:'Does not replace independent empty-database, private-network, staging isolation, erasure replay and human approval checks.'
 };
}

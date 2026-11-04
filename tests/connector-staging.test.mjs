import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {provisionStaging,deployStaging} from '../scripts/connector-staging.mjs';
const account='a'.repeat(32);
test('connector provisioning is idempotent and continues independent queues when R2 is unavailable',async()=>{
 const db=[],kv=[],queues=[];let writes=0;
 const request=async({method,path,body})=>{
  if(path.endsWith('/r2/buckets'))throw Error('R2 not enabled');
  if(path.endsWith('/workers/subdomain'))return {success:true,result:{subdomain:'test'}};
  const list=path.endsWith('/d1/database')?db:path.endsWith('/storage/kv/namespaces')?kv:queues;
  if(method==='POST'){writes++;const item={...body,uuid:'test-d1',id:'test-kv-'+writes,queue_id:'queue-'+writes};list.push(item);return {success:true,result:item};}
  return {success:true,result:list};
 };
 const first=await provisionStaging(request,account),count=writes;assert.equal(first.resources.queues.length,6);assert.equal(first.blocked.length,1);
 const second=await provisionStaging(request,account);assert.equal(writes,count);assert.deepEqual(second.resources,first.resources);
});
test('connector deployment refuses production, wrong artifacts and silently reduced staging',async()=>{
 const source='export default {}',sha=createHash('sha256').update(source).digest('hex');
 const config={name:'airdrop-museum-staging',account_id:account,vars:{ENVIRONMENT:'staging',SIDE_EFFECTS_ENABLED:'0'},d1_databases:[{database_name:'airdrop-museum-staging',database_id:'isolated'}],placement:{region:'aws:ap-southeast-1'},compatibility_date:'2026-10-27',compatibility_flags:['nodejs_compat']};
 let calls=0;const request=async r=>{calls++;assert.match(r.body,/keep_bindings/);assert.match(r.body,/ap-southeast-1/);return {success:true,result:{deployment_id:'staging-version'}};};
 await assert.rejects(()=>deployStaging(request,account,source,sha,config),/FULL_STAGING/);
 await assert.rejects(()=>deployStaging(request,account,source,'0'.repeat(64),config,{allowPartial:true}),/HASH/);
 await assert.rejects(()=>deployStaging(request,account,source,sha,{...config,name:'airdrop-museum'},{allowPartial:true}),/STAGING_TARGET/);
 assert.equal(calls,0);const r=await deployStaging(request,account,source,sha,config,{allowPartial:true});assert.equal(r.production_ready,false);assert.deepEqual(r.missing_capabilities,['R2','ANALYTICS']);
});

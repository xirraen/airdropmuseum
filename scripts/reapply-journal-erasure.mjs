import {readFileSync,writeFileSync} from 'node:fs';
import {reapplyErasureReceipt} from '../src/autopsy/privacyService.ts';
process.umask(0o077);
const account='9880cf2cc57c2096f8c3ae253d9852e6',production='4e75c8b9-6c58-4bac-a180-01e5bec0d0a3';
const target=(process.env.RESTORE_STAGING_D1_ID||'').toLowerCase();
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
if(!uuid.test(target)||[production,'461404c7-a2c6-4222-bb13-6aa26fce2332','dbdc0402-dd9a-4548-bea1-f5f1f2af5aa0'].includes(target))throw Error('ISOLATED_RESTORE_TARGET_REQUIRED');
const synthetic=process.env.PRIVACY_REPLAY_SYNTHETIC==='1';
const source=synthetic?'dbdc0402-dd9a-4548-bea1-f5f1f2af5aa0':production;
const namespace=synthetic?'302160a39d3c4608a0665d267512c777':JSON.parse(readFileSync('wrangler.jsonc','utf8')).kv_namespaces.find(n=>n.binding==='JOURNAL_ERASURE_LEDGER')?.id;
if(!/^[a-f0-9]{32}$/.test(namespace||''))throw Error('ERASURE_NAMESPACE_REQUIRED');
const base=process.env.CLOUDFLARE_API_BASE_URL||'https://api.cloudflare.com/client/v4';
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token)throw Error('CLOUDFLARE_API_TOKEN required; never pass it as a command argument');
if(base!=='https://api.cloudflare.com/client/v4'&&!(base==='http://127.0.0.1:8792'&&token==='local-connector-transport-marker'))throw Error('API_TRANSPORT_DENIED');
async function api(path,body,raw=false){
 const r=await fetch(base+'/accounts/'+account+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw Error('RESTORE_API_FAILED: '+r.status);
 const data=await r.json();if(raw)return data;
 if(!data.success)throw Error('RESTORE_API_FAILED');return data;
}
async function query(id,sql,params=[]){return (await api('/d1/database/'+id+'/query',{sql,params})).result.flatMap(r=>r.results||[]);}
const DB={prepare(sql){let params=[];const q={sql,params,bind(...values){params=values;q.params=params;return q;},async first(){return (await query(target,sql,params))[0]||null;},async all(){return {results:await query(target,sql,params)};},async run(){return (await api('/d1/database/'+target+'/query',{sql,params})).result[0];}};return q;},async batch(statements){return (await api('/d1/database/'+target+'/query',{batch:statements.map(q=>({sql:q.sql,params:q.params}))})).result;}};
// Read the live outbox as a completeness barrier. Stop writes/erasure first;
// never silently accept an eventually consistent KV listing missing a receipt.
const restoredVersion=(await query(target,'SELECT MAX(version) version FROM am_core_schema'))[0]?.version;
if(restoredVersion!==16)throw Error('PRIVACY_RESTORE_MIGRATION_REQUIRED');
const version=(await query(source,'SELECT MAX(version) version FROM am_core_schema'))[0]?.version;
if(version>=15){const mode=JSON.parse((await query(source,"SELECT value FROM system_settings WHERE key='maintenance_mode'"))[0]?.value||'"normal"');if(!['read_only','maintenance'].includes(mode))throw Error('LIVE_SOURCE_MUST_BE_READ_ONLY');}
const expected=version>=15?(await query(source,'SELECT request_id,ledger_synced FROM journal_erasure_receipts')):[];
if(expected.some(r=>!r.ledger_synced))throw Error('LIVE_ERASURE_OUTBOX_PENDING');
const keys=[];let cursor='';
do{const page=await api('/storage/kv/namespaces/'+namespace+'/keys?prefix=journal-erasure%3A'+(cursor?'&cursor='+encodeURIComponent(cursor):''));keys.push(...page.result);cursor=page.result_info?.cursor||'';}while(cursor);
const names=new Set(keys.map(k=>k.name));
if(expected.some(r=>!names.has('journal-erasure:'+r.request_id)))throw Error('ERASURE_LEDGER_NOT_YET_CONSISTENT');
const receipts=[];
for(const key of keys){
 if(!/^journal-erasure:[a-f0-9-]{36}$/.test(key.name))throw Error('INVALID_ERASURE_KEY');
 const receipt=await api('/storage/kv/namespaces/'+namespace+'/values/'+encodeURIComponent(key.name),undefined,true);
 if(key.name!=='journal-erasure:'+receipt.request_id)throw Error('ERASURE_KEY_MISMATCH');receipts.push(receipt);
}
for(const receipt of receipts){
 await reapplyErasureReceipt(DB,receipt);
 const targets=JSON.stringify(receipt.aggregate_ids);
 const payloads=await query(target,'SELECT COUNT(*) n FROM journal_private_payloads WHERE event_id IN (SELECT id FROM autopsy_events WHERE aggregate_id IN (SELECT value FROM json_each(?)))',[targets]);
 const owners=await query(target,'SELECT COUNT(*) n FROM autopsy_events WHERE aggregate_id IN (SELECT value FROM json_each(?)) AND user_scope<>?',[targets,receipt.erased_scope]);
 if(payloads[0]?.n||owners[0]?.n)throw Error('ERASURE_REPLAY_VERIFICATION_FAILED');
}
if((await query(target,'PRAGMA foreign_key_check')).length)throw Error('RESTORE_FOREIGN_KEYS_FAILED');
const evidence={database_id:target,ledger_namespace:namespace,restored_schema:restoredVersion,source_schema:version,receipts_applied:receipts.length,live_receipts_checked:expected.length,verified_at:new Date().toISOString()};
if(process.env.PRIVATE_REPLAY_EVIDENCE_FILE)writeFileSync(process.env.PRIVATE_REPLAY_EVIDENCE_FILE,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
console.log('PASS erasure ledger replay and restored payload/owner verification ('+receipts.length+' receipts).');

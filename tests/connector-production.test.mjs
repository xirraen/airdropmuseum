import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareProductionVersion} from '../scripts/connector-production.mjs';
const cfg=JSON.parse(readFileSync('wrangler.jsonc'));
test('production preparation is inactive, exact-targeted and excludes deployment credentials',async()=>{
 const calls=[];const request=async c=>{calls.push(c);return c.method==='GET'?{success:true,result:{bindings:['TELEGRAM_BOT_TOKEN','ADMIN_CSRF_PEPPER','BACKUP_SIGNING_KEY','CLOUDFLARE_API_TOKEN'].map(name=>({name,type:'secret_text'}))}}:{success:true,result:{id:'candidate'}};};
 const source='export default {}',hash=createHash('sha256').update(source).digest('hex');
 const r=await prepareProductionVersion(request,cfg.account_id,source,hash,cfg,'a'.repeat(40));
 assert.equal(r.activated,false);assert.equal(calls.length,2);assert.equal(calls[1].method,'POST');assert.ok(calls[1].path.endsWith('/versions'));
 assert.ok(!r.binding_names.includes('CLOUDFLARE_API_TOKEN'));assert.ok(r.binding_names.includes('WEBHOOK_MASTER_SECRET'));
 assert.ok(!calls[1].body.includes('keep_bindings'));assert.ok(calls[1].body.includes('"name":"TELEGRAM_BOT_TOKEN","type":"inherit"'));
 await assert.rejects(()=>prepareProductionVersion(request,cfg.account_id,source,'0'.repeat(64),cfg,'a'.repeat(40)),/HASH_MISMATCH/);
 await assert.rejects(()=>prepareProductionVersion(request,'wrong',source,hash,cfg,'a'.repeat(40)),/TARGET_MISMATCH/);
});

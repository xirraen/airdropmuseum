import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {adminRoutes} from '../src/admin/adminRoutes.ts';
import {hash} from '../src/admin/types.ts';
import {flagEnabled} from '../src/admin/featureFlagService.ts';
import {health} from '../src/admin/healthService.ts';
import {maintenance} from '../src/admin/systemSettingsService.ts';
import {principal} from '../src/publicApi/auth.ts';
class D1 {
 constructor(){this.sqlite=new DatabaseSync(':memory:');for(const n of ['0001_core.sql','0003_platform.sql','0010_discovery_automation.sql','0011_source_trust.sql','0012_public_api.sql','0013_admin_operations.sql'])this.sqlite.exec(readFileSync(new URL('../migrations/'+n,import.meta.url),'utf8'));}
 prepare(query){const stmt=this.sqlite.prepare(query);let params=[];const q={bind(...args){params=args;return q;},async first(){return stmt.get(...params)||null;},async all(){return {results:stmt.all(...params)};},async run(){return {meta:{changes:Number(stmt.run(...params).changes)}};}};return q;}
 async batch(qs){const out=[];for(const q of qs)out.push(await q.run());return out;}
}
const origin='https://museum.example.org';
const headers=cookie=>({'Cookie':'am_session='+cookie,'Origin':origin,'Content-Type':'application/json'});
function req(path,opts={}){return new Request(origin+path,opts);}
async function env(role='super_admin'){
 const DB=new D1(),cookie='a'.repeat(64),scope='tg:admin';
 await DB.prepare('INSERT INTO am_users(id,username) VALUES(?,?)').bind(scope,'operator').run();
 await DB.prepare('INSERT INTO am_sessions(token_hash,user_id,expires) VALUES(?,?,?)').bind(await hash(cookie),scope,Math.floor(Date.now()/1000)+3600).run();
 await DB.prepare('INSERT INTO admin_users(admin_scope,role) VALUES(?,?)').bind(scope,role).run();
 const kv=new Map(),e={DB,ADMIN_CSRF_PEPPER:'pepper',ADMIN_AUDIT_PEPPER:'audit-pepper',TRUST_CACHE:{async get(k){return kv.get(k)||null;},async put(k,v){kv.set(k,JSON.parse(v));},async delete(k){kv.delete(k);}},PARTNER_WEBHOOK_QUEUE:{messages:[],async send(m){this.messages.push(m);}},WEBHOOK_MASTER_SECRET:'q'.repeat(40)};
 const csrf=await hash('admin-csrf:v1:'+cookie+':pepper');
 return {e,cookie,csrf,scope};
}
const request=(path,auth,method='GET',data=undefined)=>req('/api/admin/'+path,{method,headers:{...headers(auth.cookie),'X-CSRF-Token':auth.csrf},...(data===undefined?{}:{body:JSON.stringify(data)})});
const run=async(path,auth,method='GET',data)=>adminRoutes(request(path,auth,method,data),auth.e,{waitUntil(p){p.catch(()=>{});}});
test('0013 schema is compatible with 0001/0003/0010/0011/0012 and preserves records',async()=>{
 const {e}=await env();
 for(const n of ['admin_users','admin_audit_log','feature_flags','system_settings','operational_events','admin_bulk_previews'])assert.ok(await e.DB.prepare("SELECT name FROM sqlite_master WHERE name=?").bind(n).first());
 assert.equal((await e.DB.prepare("SELECT version FROM am_core_schema WHERE version=9").first()).version,9);
});
test('all four roles: readonly cannot write, moderator limited, admin cannot maintain, super_admin can',async()=>{
 for(const role of ['readonly','moderator','admin','super_admin']){
  const a=await env(role);assert.equal((await run('session',a)).status,200);
  const writes=await run('maintenance-mode',a,'POST',{mode:'read_only'});
  assert.equal(writes.status,role==='super_admin'?200:403,role);
  const flags=await run('feature-flags/public_api_enabled',a,'PUT',{enabled:false});
  assert.equal(flags.status,['admin','super_admin'].includes(role)?200:403);
 }
});
test('csrf, authentication, no raw secrets in role response and audit log',async()=>{
 const a=await env();
 const noSession=await adminRoutes(req('/api/admin/session'),a.e);assert.equal(noSession.status,401);
 const forbidden=await adminRoutes(req('/api/admin/maintenance-mode',{method:'POST',headers:headers(a.cookie),body:'{"mode":"read_only"}'}),a.e);
 assert.equal(forbidden.status,403);
 assert.equal((await run('maintenance-mode',a,'POST',{mode:'read_only'})).status,200);
 const logs=(await (await run('audit',a)).json()).entries;
 assert.ok(logs.some(x=>x.action==='maintenance_mode.change'));
 assert.equal(JSON.stringify(logs).includes(a.cookie),false);
 assert.equal(JSON.stringify(logs).includes(a.csrf),false);
});
test('feature flag rollout, KV invalidation, normal/read_only/maintenance',async()=>{
 const a=await env();assert.equal(await flagEnabled(a.e,'public_api_enabled','partner:1'),true);
 const r=await run('feature-flags/public_api_enabled',a,'PUT',{enabled:false});
 assert.equal(r.status,200);assert.equal(await flagEnabled(a.e,'public_api_enabled','partner:1'),false);
 assert.equal(await maintenance(a.e),'normal');
 await run('maintenance-mode',a,'POST',{mode:'read_only'});assert.equal(await maintenance(a.e),'read_only');
 await run('maintenance-mode',a,'POST',{mode:'maintenance'});assert.equal(await maintenance(a.e),'maintenance');
});
test('bulk preview required, one-time confirmation, change audit recorded',async()=>{
 const a=await env();
 await a.e.DB.prepare('INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES(?,?,?,?)').bind('x1',JSON.stringify({status:'active',visibility:'private_draft'}),'https://example.org','confirmed').run();
 const absent=await run('campaigns/bulk-action',a,'POST',{preview_id:crypto.randomUUID(),confirm_phrase:'KONFIRMASI'});assert.equal(absent.status,409);
 const preview=await run('campaigns/bulk-preview?ids=x1&action=archive',a);assert.equal(preview.status,200);
 const data=await preview.json();
 const noConfirm=await run('campaigns/bulk-action',a,'POST',{preview_id:data.preview_id,confirm_phrase:'YES'});assert.equal(noConfirm.status,409);
 const success=await run('campaigns/bulk-action',a,'POST',{preview_id:data.preview_id,confirm_phrase:'KONFIRMASI'});
 assert.equal(success.status,200);assert.equal((await success.json()).succeeded,1);
 assert.equal((await run('campaigns/bulk-action',a,'POST',{preview_id:data.preview_id,confirm_phrase:'KONFIRMASI'})).status,409);
 assert.equal(JSON.parse((await a.e.DB.prepare("SELECT payload FROM am_core_exhibits WHERE id='x1'").first()).payload).visibility,'private_draft');
 const audits=await a.e.DB.prepare("SELECT COUNT(*) count FROM admin_audit_log WHERE action='bulk.archive'").first();
 assert.equal(audits.count,1);
});
test('discovery approval, duplicate review history and rejection reason safety',async()=>{
 const a=await env();
 await a.e.DB.prepare("INSERT INTO discovery_sources(id,name,source_type,feed_url) VALUES('s1','Feed','rss','https://feed.example.org/rss')").run();
 for(const id of ['i1','i2'])await a.e.DB.prepare('INSERT INTO discovery_items(id,source_id,url,title,content_fingerprint) VALUES(?,?,?,?,?)').bind(id,'s1','https://example.org/'+id,id,'fp-'+id).run();
 const preview=(await (await run('discovery/bulk-preview?ids=i1&action=approve',a)).json()).preview_id;
 const result=await run('discovery/bulk-action',a,'POST',{preview_id:preview,confirm_phrase:'KONFIRMASI'});
 assert.equal(result.status,200);assert.equal((await result.json()).succeeded,1);
 const second=(await (await run('discovery/bulk-preview?ids=i2&action=duplicate&reason=Mirip',a)).json()).preview_id;
 await run('discovery/bulk-action',a,'POST',{preview_id:second,confirm_phrase:'KONFIRMASI'});
 assert.equal((await a.e.DB.prepare("SELECT status FROM discovery_items WHERE id='i2'").first()).status,'duplicate');
 assert.equal((await a.e.DB.prepare("SELECT action FROM discovery_review_log WHERE item_id='i2'").first()).action,'duplicate');
});
test('API key plaintext once, SHA-256 persistence, expiration and revoke',async()=>{
 const a=await env();
 const creation=await run('api-keys',a,'POST',{name:'Sample partner',tier:'partner'});
 assert.equal(creation.status,201);const payload=await creation.json();
 const row=await a.e.DB.prepare('SELECT key_hash FROM api_keys WHERE id=?').bind(payload.key.id).first();
 assert.equal(row.key_hash,await hash(payload.api_key));
 assert.equal(JSON.stringify((await (await run('api-keys',a)).json())).includes(payload.api_key),false);
 const partner=await principal(req('/v1/campaigns',{headers:{Authorization:'Bearer '+payload.api_key}}),a.e);assert.equal(partner.tier,'partner');
 assert.equal((await run('api-keys/'+payload.key.id,a,'DELETE')).status,200);
 await assert.rejects(()=>principal(req('/v1/campaigns',{headers:{Authorization:'Bearer '+payload.api_key}}),a.e),/INVALID_API_KEY/);
});
test('webhook configuration and dummy delivery without exposing secret',async()=>{
 const a=await env();
 await a.e.DB.prepare("INSERT INTO api_keys(id,name,key_hash,partner_scope,tier,rate_limit_per_minute,daily_quota,created_by) VALUES('p','Partner','h','','partner',300,20000,'admin')").run();
 const created=await run('webhooks',a,'POST',{api_key_id:'p',url:'https://webhook.example.org/hook',events:['campaign.updated']});
 assert.equal(created.status,200);const item=await created.json();
 assert.equal(JSON.stringify(item).includes('whsec_'),false);
 const t=await run('webhooks/'+item.id+'/test',a,'POST',{});
 assert.equal(t.status,200);assert.equal(a.e.PARTNER_WEBHOOK_QUEUE.messages.length,1);
 const rows=await (await run('webhooks',a)).json();assert.equal(rows.webhooks.length,1);
 assert.equal(JSON.stringify(rows).includes('secret_hash'),false);
});
test('conflict resolution requires source selection + confirmation; health degrades safely',async()=>{
 const a=await env();
 await a.e.DB.prepare("INSERT INTO am_core_exhibits(id,payload,source_url,review_status) VALUES('c1','{}','https://official.example.org','confirmed')").run();
 for(const id of ['a','b'])await a.e.DB.prepare('INSERT INTO source_trust_profiles(id,source_url,host) VALUES(?,?,?)').bind(id,'https://example.org/'+id,'example.org').run();
 await a.e.DB.prepare("INSERT INTO source_conflicts(id,fingerprint,campaign_id,field,value_a,source_a,value_b,source_b,severity) VALUES('conf','f','c1','chain','\"Base\"','a','\"Ethereum\"','b','material')").run();
 assert.equal((await run('conflicts/conf/resolve',a,'POST',{selected_value:'a',resolution_note:'official'})).status,409);
 const r=await run('conflicts/conf/resolve',a,'POST',{selected_value:'a',resolution_note:'official',confirm:'RESOLVE'});
 assert.equal(r.status,200);assert.equal(JSON.parse((await a.e.DB.prepare("SELECT payload FROM am_core_exhibits WHERE id='c1'").first()).payload).chain,'Base');
 const h=await health(a.e);assert.ok(['healthy','degraded','unhealthy'].includes(h.status));assert.equal(h.checks.telegram,'degraded');
});

test('readonly access is limited to dashboard, audit and health',async()=>{
 const a=await env('readonly');
 assert.equal((await run('overview',a)).status,200);
 assert.equal((await run('audit',a)).status,200);
 for(const path of ['campaigns','discovery/queue','conflicts','api-keys','feature-flags','system-settings','webhooks'])
  assert.equal((await run(path,a)).status,403,path);
});
test('moderator can review a discovery item but cannot run bulk actions',async()=>{
 const a=await env('moderator');
 await a.e.DB.prepare("INSERT INTO discovery_sources(id,name,source_type,feed_url) VALUES('mfeed','Moderation','rss','https://feed.example.net/feed')").run();
 await a.e.DB.prepare("INSERT INTO discovery_items(id,source_id,url,title,content_fingerprint) VALUES('mitem','mfeed','https://feed.example.net/item','Review','mfp')").run();
 const denied=await run('discovery/bulk-preview?ids=mitem&action=approve',a);assert.equal(denied.status,403);
 const approved=await run('discovery/items/mitem/approve',a,'POST',{});
 assert.equal(approved.status,200);
 assert.equal((await a.e.DB.prepare("SELECT status FROM discovery_items WHERE id='mitem'").first()).status,'approved');
 const record=await a.e.DB.prepare("SELECT COUNT(*) count FROM admin_audit_log WHERE action='discovery.approve'").first();
 assert.equal(record.count,1);
});

test('super_admin may change safe operational settings with audit and validation',async()=>{
 const a=await env('super_admin');
 const update=await run('system-settings/webhook_failure_threshold',a,'PUT',{value:0.25});
 assert.equal(update.status,200);
 assert.equal((await a.e.DB.prepare("SELECT value FROM system_settings WHERE key='webhook_failure_threshold'").first()).value,'0.25');
 assert.equal((await run('system-settings/webhook_failure_threshold',a,'PUT',{value:-1})).status,400);
 const normal=await env('admin');
 assert.equal((await run('system-settings/webhook_failure_threshold',normal,'PUT',{value:0.2})).status,403);
 const trail=await a.e.DB.prepare("SELECT COUNT(*) n FROM admin_audit_log WHERE action='system_setting.update'").first();
 assert.equal(trail.n,1);
});

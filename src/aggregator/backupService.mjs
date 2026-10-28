import {validOfficial} from './portfolioService.mjs';
export const SCHEMA_VERSION=9,MAX_BACKUP_BYTES=524288,RETENTION_DAYS=30;
const q=(db,sql,...args)=>db.prepare(sql).bind(...args),rows=r=>r?.results||[];
const err=(code,status=400)=>{throw Object.assign(Error(code),{status});};
const encoder=new TextEncoder();
const id=()=>crypto.randomUUID();
const secrets=/(private.?key|seed.?phrase|mnemonic|bot.?token|api.?key|session.?secret|password|authorization|credential)/i;
const isScope=x=>typeof x==='string'&&/^tg:[1-9][0-9]*$/.test(x);
const string=(x,max=2048)=>typeof x==='string'&&x.length<=max;
const only=(obj,allowed)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).every(k=>allowed.includes(k)&&!secrets.test(k));
const toHex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
async function signature(payload,secret){if(!secret)err('BACKUP_SIGNING_KEY_REQUIRED',503);const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return toHex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(JSON.stringify(payload)))));}
async function verify(payload,token,secret){if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))err('INVALID_BACKUP_SIGNATURE',403);const expected=await signature(payload,secret);let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^token.charCodeAt(i);if(diff)err('INVALID_BACKUP_SIGNATURE',403);}
async function payloadFor(db,scope){
 if(!isScope(scope))err('INVALID_USER_SCOPE',403);
 const r=await db.batch([
  q(db,'SELECT chain,address,label FROM wallet_watchlist WHERE user_id=? ORDER BY chain,address LIMIT 5001',scope),
  q(db,'SELECT campaign_id FROM user_campaign_subscriptions WHERE user_scope=? ORDER BY campaign_id LIMIT 5001',scope),
  q(db,'SELECT quest_id,wallet_address,status,completed_at,evidence_url,note,points_awarded,updated_at,revision FROM user_quest_progress WHERE user_scope=? ORDER BY quest_id,id LIMIT 5001',scope),
  q(db,'SELECT id,campaign_id,quest_id,wallet_address,points,reason,created_at FROM user_points_ledger WHERE user_scope=? ORDER BY created_at,id LIMIT 5001',scope),
  q(db,'SELECT enabled,filters,event_types,weekly_enabled,weekly_timezone FROM alert_preferences WHERE user_id=?',scope),
  q(db,"SELECT er.campaign_id,er.rule_id,er.evaluation_status,er.evidence_refs,er.evaluated_at FROM eligibility_results er JOIN wallet_watchlist w ON w.id=er.wallet_id WHERE w.user_id=? ORDER BY er.evaluated_at DESC LIMIT 5001",scope)
 ]);
 if(r.some(x=>rows(x).length>5000))err('BACKUP_ROW_LIMIT',413);
 return {schema_version:SCHEMA_VERSION,user_scope:scope,created_at:new Date().toISOString(),
 wallet_watchlist:rows(r[0]),campaign_subscriptions:rows(r[1]),quest_progress:rows(r[2]),points_ledger:rows(r[3]),alert_preferences:rows(r[4])[0]||null,
 evidence_refs:rows(r[5]),notice:'Alamat publik dan poin internal saja. Evidence eligibility hanya catatan dan tidak diimpor sebagai hasil verifikasi baru.'};
}
function validatedEnvelope(envelope,secret){if(!only(envelope,['payload','signature']))err('INVALID_BACKUP');const p=envelope.payload;if(!p||!only(p,['schema_version','user_scope','created_at','wallet_watchlist','campaign_subscriptions','quest_progress','points_ledger','alert_preferences','evidence_refs','notice']))err('INVALID_BACKUP');
 if(p.schema_version!==SCHEMA_VERSION)err('SCHEMA_VERSION_MISMATCH',409);
 if(!isScope(p.user_scope))err('INVALID_USER_SCOPE');
 for(const k of ['wallet_watchlist','campaign_subscriptions','quest_progress','points_ledger','evidence_refs'])if(!Array.isArray(p[k])||p[k].length>5000)err('INVALID_BACKUP');
 if(!string(p.created_at,64)||!Number.isFinite(Date.parse(p.created_at)))err('INVALID_BACKUP');
 for(const w of p.wallet_watchlist)if(!only(w,['chain','address','label'])||!string(w.chain,64)||!string(w.address,128)||!string(w.label,60)||!(/^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(w.address)))err('INVALID_WALLET');
 for(const c of p.campaign_subscriptions)if(!only(c,['campaign_id'])||!string(c.campaign_id,120))err('INVALID_SUBSCRIPTION');
 for(const a of p.quest_progress)if(!only(a,['quest_id','wallet_address','status','completed_at','evidence_url','note','points_awarded','updated_at','revision'])||!string(a.quest_id,64)||!['todo','in_progress','submitted','verified','failed','expired','not_applicable'].includes(a.status)||a.wallet_address!=null&&!string(a.wallet_address,128)||a.evidence_url!=null&&!validOfficial(a.evidence_url)||!string(a.note,1000)||!Number.isSafeInteger(a.points_awarded)||a.points_awarded<0||a.points_awarded>100000||!Number.isSafeInteger(a.updated_at)||a.updated_at<0)err('INVALID_PROGRESS');
 for(const x of p.points_ledger)if(!only(x,['id','campaign_id','quest_id','wallet_address','points','reason','created_at'])||!string(x.id,120)||!string(x.campaign_id,120)||x.quest_id!=null&&!string(x.quest_id,64)||!Number.isSafeInteger(x.points)||Math.abs(x.points)>100000||!string(x.reason,80)||!Number.isSafeInteger(x.created_at))err('INVALID_LEDGER');
 if(p.alert_preferences!==null&&(!only(p.alert_preferences,['enabled','filters','event_types','weekly_enabled','weekly_timezone'])||![0,1].includes(p.alert_preferences.enabled)||![0,1].includes(p.alert_preferences.weekly_enabled)))err('INVALID_PREFERENCES');
 for(const e of p.evidence_refs)if(!only(e,['campaign_id','rule_id','evaluation_status','evidence_refs','evaluated_at'])||!string(e.campaign_id,120)||!string(e.rule_id,120)||!string(e.evidence_refs,16384))err('INVALID_EVIDENCE_REFS');
 return p;
}
export function checkBackupSize(value){
 const raw=typeof value==='string'?value:JSON.stringify(value);
 const length=encoder.encode(raw).byteLength;if(length>MAX_BACKUP_BYTES)err('BACKUP_TOO_LARGE',413);return length;
}
export async function createBackup(env,scope,{kind='user',period=null,now=Date.now()}={}){
 if(!env.DB||!env.AGGREGATOR_BACKUP_BUCKET)err('BACKUP_STORAGE_UNAVAILABLE',503);
 const payload=await payloadFor(env.DB,scope),envelope={payload,signature:await signature(payload,env.BACKUP_SIGNING_KEY)};
 const bytes=checkBackupSize(envelope),backupId=id(),object_key='sprint5/'+kind+'/'+id()+'/'+id()+'.json';
 const created=new Date(now).toISOString(),expires=new Date(now+RETENTION_DAYS*86400000).toISOString();
 // R2 is durable before publishing metadata. A failed DB write leaves only an orphan object.
 await env.AGGREGATOR_BACKUP_BUCKET.put(object_key,JSON.stringify(envelope),{httpMetadata:{contentType:'application/json'},customMetadata:{schema_version:String(SCHEMA_VERSION)}});
 try{await q(env.DB,"INSERT INTO backup_metadata(backup_id,user_scope,kind,object_key,size_bytes,schema_version,status,created_at,expires_at,period) VALUES(?,?,?,?,?,?,'ready',?,?,?)",backupId,scope,kind,object_key,bytes,SCHEMA_VERSION,created,expires,period).run();}
 catch(e){await env.AGGREGATOR_BACKUP_BUCKET.delete(object_key);throw e;}
 return {backup_id:backupId,created_at:created,size:bytes,schema_version:SCHEMA_VERSION,status:'ready',kind};
}
export async function getBackup(env,scope,backupId,{admin=false}={}){
 const meta=await q(env.DB,'SELECT * FROM backup_metadata WHERE backup_id=?',backupId).first();
 if(!meta||meta.status!=='ready'||meta.kind==='server'&&!admin||meta.kind!=='server'&&meta.user_scope!==scope)err('BACKUP_NOT_FOUND',404);
 const obj=await env.AGGREGATOR_BACKUP_BUCKET?.get(meta.object_key);
 if(!obj)err('BACKUP_NOT_FOUND',404);
 if(Number(obj.size)>MAX_BACKUP_BYTES)err('BACKUP_TOO_LARGE',413);
 const raw=await obj.text();checkBackupSize(raw);
 return JSON.parse(raw);
}
export async function restoreBackup(env,scope,{backup_id,envelope,mode='merge',confirm_scope,confirm_phrase}={}){
 if(!isScope(scope))err('INVALID_USER_SCOPE',403);
 if(!['merge','replace'].includes(mode))err('INVALID_RESTORE_MODE');
 if(mode==='replace'&&(confirm_scope!==scope||confirm_phrase!=='HAPUS DATA SAYA'))err('RESTORE_CONFIRMATION_REQUIRED',428);
 if(!backup_id&&!envelope||backup_id&&envelope)err('BACKUP_SOURCE_REQUIRED');
 const data=backup_id?await getBackup(env,scope,backup_id):envelope;
 checkBackupSize(data);const p=validatedEnvelope(data);if(p.user_scope!==scope)err('BACKUP_SCOPE_MISMATCH',403);
 await verify(p,data.signature,env.BACKUP_SIGNING_KEY);
 const before=await createBackup(env,scope,{kind:'pre_restore'});
 const d=env.DB,stmts=[];
 if(mode==='replace')stmts.push(
 q(d,'DELETE FROM user_points_ledger WHERE user_scope=?',scope),
 q(d,'DELETE FROM user_quest_progress WHERE user_scope=?',scope),
 q(d,'DELETE FROM user_campaign_subscriptions WHERE user_scope=?',scope),
 q(d,'DELETE FROM wallet_watchlist WHERE user_id=?',scope),
 q(d,'DELETE FROM alert_preferences WHERE user_id=?',scope));
 for(const w of p.wallet_watchlist)stmts.push(q(d,'INSERT INTO wallet_watchlist(id,user_id,chain,address,label,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,chain,address) DO UPDATE SET label=excluded.label',id(),scope,w.chain,w.address,w.label,new Date().toISOString()));
 for(const x of p.campaign_subscriptions)stmts.push(q(d,'INSERT OR IGNORE INTO user_campaign_subscriptions(user_scope,campaign_id,updated_at) VALUES(?,?,?)',scope,x.campaign_id,Math.floor(Date.now()/1000)));
 for(const x of p.quest_progress){
  const wallet=x.wallet_address||null;
  stmts.push(q(d,"UPDATE user_quest_progress SET status=?,completed_at=?,evidence_url=?,note=?,points_awarded=?,updated_at=?,revision=MAX(revision,?) WHERE user_scope=? AND quest_id=? AND COALESCE(wallet_address,'')=?",x.status,x.completed_at||null,x.evidence_url||null,x.note,x.points_awarded,x.updated_at,x.revision||0,scope,x.quest_id,wallet||''));
  stmts.push(q(d,'INSERT OR IGNORE INTO user_quest_progress(id,user_scope,quest_id,wallet_address,status,completed_at,evidence_url,note,points_awarded,updated_at,revision) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id(),scope,x.quest_id,wallet,x.status,x.completed_at||null,x.evidence_url||null,x.note,x.points_awarded,x.updated_at,x.revision||0));
 }
 for(const x of p.points_ledger)stmts.push(q(d,'INSERT OR IGNORE INTO user_points_ledger(id,user_scope,campaign_id,quest_id,wallet_address,points,reason,created_at) VALUES(?,?,?,?,?,?,?,?)',x.id,scope,x.campaign_id,x.quest_id||null,x.wallet_address||null,x.points,x.reason,x.created_at));
 if(p.alert_preferences){
 const a=p.alert_preferences;
 stmts.push(q(d,'INSERT INTO alert_preferences(user_id,enabled,filters,event_types,updated_at,weekly_enabled,weekly_timezone) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,filters=excluded.filters,event_types=excluded.event_types,updated_at=excluded.updated_at,weekly_enabled=excluded.weekly_enabled,weekly_timezone=excluded.weekly_timezone',scope,a.enabled,typeof a.filters==='string'?a.filters:JSON.stringify(a.filters),typeof a.event_types==='string'?a.event_types:JSON.stringify(a.event_types),new Date().toISOString(),a.weekly_enabled,a.weekly_timezone||null));
 }
 // D1 batch is atomic; no partial restore is exposed. Evidence results never become verified through restore.
 if(stmts.length)await d.batch(stmts);
 await q(d,'DELETE FROM user_portfolio_snapshots WHERE user_scope=?',scope).run();
 return {restored:true,mode,pre_restore_backup_id:before.backup_id,counts:{wallets:p.wallet_watchlist.length,campaigns:p.campaign_subscriptions.length,quests:p.quest_progress.length,ledger:p.points_ledger.length}};
}
export async function history(env,scope,{admin=false,limit=50,offset=0}={}){
 const result=await q(env.DB,"SELECT backup_id,kind,created_at,size_bytes AS size,schema_version,status,expires_at FROM backup_metadata WHERE "+(admin?"(user_scope=? OR kind='server')":"user_scope=? AND kind!='server'")+" ORDER BY created_at DESC LIMIT ? OFFSET ?",scope,limit,offset).all();
 return {items:rows(result),limit,offset};
}
export async function scheduledBackups(env,{now=Date.now(),limit=20}={}){
 if(!env.DB||!env.AGGREGATOR_BACKUP_BUCKET||!env.BACKUP_SIGNING_KEY)return {skipped:true};
 const day=new Date(now).toISOString().slice(0,10);
 const list=await q(env.DB,"SELECT user_scope FROM (SELECT user_id user_scope FROM wallet_watchlist UNION SELECT user_scope FROM user_quest_progress UNION SELECT user_scope FROM user_campaign_subscriptions UNION SELECT user_id FROM alert_preferences) u WHERE NOT EXISTS (SELECT 1 FROM backup_metadata m WHERE m.user_scope=u.user_scope AND m.kind='server' AND m.period=? AND m.status='ready') LIMIT ?",day,limit).all();
 let completed=0,failed=0;
 for(const u of rows(list)){try{await createBackup(env,u.user_scope,{kind:'server',period:day,now});completed++;}catch{failed++;}}
 const expired=await q(env.DB,"SELECT backup_id,object_key FROM backup_metadata WHERE expires_at<? AND status='ready' ORDER BY expires_at LIMIT 100",new Date(now).toISOString()).all();
 for(const b of rows(expired)){try{await env.AGGREGATOR_BACKUP_BUCKET.delete(b.object_key);await q(env.DB,"UPDATE backup_metadata SET status='expired' WHERE backup_id=?",b.backup_id).run();}catch{/* retry during next cron */}}
 return {completed,failed,expired:rows(expired).length};
}

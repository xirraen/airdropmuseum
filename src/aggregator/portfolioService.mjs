import {nextActions} from './nextActionService.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const rows=r=>r?.results||[];
const safeJSON=(v,fallback=[])=>{try{return JSON.parse(v)}catch{return fallback}};
const validOfficial=u=>{try{const x=new URL(u);return x.protocol==='https:'&&!!x.hostname&&!x.username&&!x.password}catch{return false}};
const nowSeconds=()=>Math.floor(Date.now()/1000);
export function exposureLabel(maxShare,count){return !count?'Belum ada data':maxShare>=65?'Terkonsentrasi':maxShare<=40?'Tersebar':'Cukup seimbang';}
export function groupDeadline(items,now=Date.now()){const result={segera:[],minggu_ini:[],terlewat:[]};for(const item of items){const end=Date.parse(item.deadline);if(!Number.isFinite(end))continue;if(end<now)result.terlewat.push(item);else if(end<=now+86400000)result.segera.push(item);else if(end<=now+7*86400000)result.minggu_ini.push(item)}return result;}
async function load(db,scope){
 const queries=[
 q(db,"SELECT c.* FROM campaigns c WHERE EXISTS (SELECT 1 FROM user_campaign_subscriptions s WHERE s.user_scope=? AND s.campaign_id=c.id) OR EXISTS (SELECT 1 FROM campaign_quests cq JOIN user_quest_progress p ON p.quest_id=cq.id WHERE cq.campaign_id=c.id AND p.user_scope=?) OR EXISTS (SELECT 1 FROM eligibility_results er JOIN wallet_watchlist w ON w.id=er.wallet_id WHERE er.campaign_id=c.id AND w.user_id=?)",scope,scope,scope),
 q(db,"SELECT p.*,q.campaign_id,q.title,q.points,q.ends_at,q.official_url,q.verification_method,c.name AS campaign_name,c.claim_deadline_at FROM user_quest_progress p JOIN campaign_quests q ON q.id=p.quest_id JOIN campaigns c ON c.id=q.campaign_id WHERE p.user_scope=?",scope),
 q(db,"SELECT w.id,w.chain,w.address,w.label,w.last_scan_at,ws.protocol_activity FROM wallet_watchlist w LEFT JOIN wallet_snapshots ws ON ws.id=(SELECT z.id FROM wallet_snapshots z WHERE z.wallet_id=w.id ORDER BY z.scanned_at DESC LIMIT 1) WHERE w.user_id=?",scope),
 q(db,"SELECT er.wallet_id,er.campaign_id,er.rule_id,er.evaluation_status,er.evaluated_at,er.evidence_refs FROM eligibility_results er JOIN wallet_watchlist w ON w.id=er.wallet_id WHERE w.user_id=? AND er.id=(SELECT e2.id FROM eligibility_results e2 WHERE e2.wallet_id=er.wallet_id AND e2.campaign_id=er.campaign_id AND e2.rule_id=er.rule_id ORDER BY e2.evaluated_at DESC,e2.id DESC LIMIT 1)",scope),
 q(db,"SELECT cc.wallet_id,cc.campaign_id,cc.status,cc.evidence_refs,cc.checked_at FROM claim_checks cc JOIN wallet_watchlist w ON w.id=cc.wallet_id WHERE w.user_id=? AND cc.id=(SELECT x.id FROM claim_checks x WHERE x.wallet_id=cc.wallet_id AND x.campaign_id=cc.campaign_id ORDER BY x.checked_at DESC,x.id DESC LIMIT 1)",scope),
 q(db,"SELECT COALESCE(SUM(points),0) AS total FROM user_points_ledger WHERE user_scope=?",scope),
 q(db,"SELECT cq.id,cq.ends_at FROM campaign_quests cq JOIN user_campaign_subscriptions sub ON sub.campaign_id=cq.campaign_id AND sub.user_scope=?",scope)
 ];
 const r=await db.batch(queries);
 return {campaigns:rows(r[0]),progress:rows(r[1]),wallets:rows(r[2]),eligibility:rows(r[3]),claims:rows(r[4]),points:Number(rows(r[5])[0]?.total||0),availableQuests:rows(r[6])};
}
function engagement(data){const ids=new Set([...data.campaigns.map(c=>c.id),...data.progress.map(p=>p.campaign_id)]);return ids;}
export function computeSummary(data,now=Date.now()){
 const ids=engagement(data);
 const active=data.campaigns.filter(c=>ids.has(c.id)&&!['archived','expired'].includes(c.status)&&(!c.claim_deadline_at||Date.parse(c.claim_deadline_at)>=now)).length;
 const status=Object.fromEntries(['todo','in_progress','submitted','verified','expired'].map(x=>[x,0]));
 for(const q of data.availableQuests||[]){if(!data.progress.some(p=>p.quest_id===q.id)){status[q.ends_at&&q.ends_at<=now/1000?'expired':'todo']++;}}
 for(const p of data.progress){const effective=p.status!=='verified'&&p.ends_at&&p.ends_at<=now/1000?'expired':p.status;if(Object.hasOwn(status,effective))status[effective]++;}
 const seven=now+7*86400000,deadlines=data.campaigns.filter(c=>c.claim_deadline_at&&Date.parse(c.claim_deadline_at)>=now&&Date.parse(c.claim_deadline_at)<=seven).length+
 data.progress.filter(p=>p.status!=='verified'&&p.ends_at&&p.ends_at*1000>=now&&p.ends_at*1000<=seven).length;
 const byId=new Map(data.campaigns.map(c=>[c.id,c]));
 const claimable=data.claims.filter(c=>{if(c.status!=='claimable')return false;const campaign=byId.get(c.campaign_id);const urls=safeJSON(c.evidence_refs);return campaign&&Array.isArray(urls)&&urls.some(e=>validOfficial(e.source_url)&&safeJSON(campaign.official_urls).some(u=>{try{return new URL(u).hostname===new URL(e.source_url).hostname}catch{return false}}));}).length;
 const eligibilityProgress=Object.fromEntries(['passed','failed','action_required','manual_check','unknown'].map(k=>[k,data.eligibility.filter(e=>e.evaluation_status===k).length]));
 const manual=data.eligibility.filter(e=>['manual_check','unknown','action_required'].includes(e.evaluation_status)).length+data.progress.filter(p=>p.status==='submitted'||['manual','none'].includes(p.verification_method)).length+data.campaigns.filter(c=>c.kyc_requirement==='unknown').length;
 return {total_campaigns:ids.size,active_campaigns:active,quests:status,internal_points:Math.max(0,data.points),wallets_monitored:data.wallets.length,chains_used:new Set(data.wallets.map(w=>w.chain)).size,verified_claimable:claimable,deadlines_7d:deadlines,manual_review:manual,eligibility_progress:eligibilityProgress,updated_at:new Date(now).toISOString(),disclaimer:'Poin hanya metrik internal, bukan aset finansial. Claim dan eligibility perlu diverifikasi pada sumber resmi.'};
}
async function signals(db,scope){
 const result=await db.batch([
 q(db,"SELECT COALESCE(MAX(updated_at),0) v,COUNT(*) n FROM user_quest_progress WHERE user_scope=?",scope),
 q(db,"SELECT COALESCE(MAX(created_at),0) v,COUNT(*) n FROM user_points_ledger WHERE user_scope=?",scope),
 q(db,"SELECT COALESCE(MAX(created_at),'') v,COUNT(*) n FROM wallet_watchlist WHERE user_id=?",scope),
 q(db,"SELECT COALESCE(MAX(last_scan_at),'') v,COUNT(*) n FROM wallet_watchlist WHERE user_id=?",scope),
 q(db,"SELECT COALESCE(MAX(updated_at),'') v,COUNT(*) n FROM campaigns"),
 q(db,"SELECT COALESCE(MAX(evaluated_at),'') v,COUNT(*) n FROM eligibility_results WHERE wallet_id IN (SELECT id FROM wallet_watchlist WHERE user_id=?)",scope),
 q(db,"SELECT COALESCE(MAX(checked_at),'') v,COUNT(*) n FROM claim_checks WHERE wallet_id IN (SELECT id FROM wallet_watchlist WHERE user_id=?)",scope),
 q(db,"SELECT COALESCE(MAX(updated_at),0) v,COUNT(*) n FROM user_campaign_subscriptions WHERE user_scope=?",scope)
 ]);return JSON.stringify(result.map(x=>rows(x)[0]||{}));
}
export async function portfolioSummary(db,scope,{now=Date.now()}={}){
 const signature=await signals(db,scope);
 const cached=await q(db,'SELECT summary_json,generated_at,signature FROM user_portfolio_snapshots WHERE user_scope=?',scope).first();
 if(cached&&cached.signature===signature&&now-cached.generated_at<300000)return {...safeJSON(cached.summary_json,{}),cached:true};
 const summary=computeSummary(await load(db,scope),now);
 await q(db,"INSERT INTO user_portfolio_snapshots(user_scope,summary_json,signature,generated_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_scope) DO UPDATE SET summary_json=excluded.summary_json,signature=excluded.signature,generated_at=excluded.generated_at,updated_at=excluded.updated_at",scope,JSON.stringify(summary),signature,now,new Date(now).toISOString()).run();
 return {...summary,cached:false};
}
export async function deadlines(db,scope,{limit=100,offset=0,now=Date.now()}={}){
 const d=await load(db,scope);
 const items=[...d.campaigns.filter(c=>c.claim_deadline_at).map(c=>({type:'claim',campaign:c.name,campaign_id:c.id,deadline:c.claim_deadline_at,source_url:safeJSON(c.official_urls)[0]||null})),...d.progress.filter(p=>p.ends_at&&p.status!=='verified').map(p=>({type:'quest',campaign:p.campaign_name,quest:p.title,deadline:new Date(p.ends_at*1000).toISOString(),source_url:p.official_url}))].filter(x=>Date.parse(x.deadline)>=now-86400000&&Date.parse(x.deadline)<=now+7*86400000).sort((a,b)=>Date.parse(a.deadline)-Date.parse(b.deadline));
 return {items:items.slice(offset,offset+limit),grouped:groupDeadline(items,now),total:items.length,limit,offset};
}
export async function chainExposure(db,scope){
 const r=await q(db,"SELECT w.chain,w.id,ws.protocol_activity FROM wallet_watchlist w LEFT JOIN wallet_snapshots ws ON ws.id=(SELECT z.id FROM wallet_snapshots z WHERE z.wallet_id=w.id ORDER BY z.scanned_at DESC LIMIT 1) WHERE w.user_id=?",scope).all();
 const totals=new Map();
 for(const w of rows(r)){const activity=safeJSON(w.protocol_activity);const amount=Array.isArray(activity)&&activity.length?activity.length:1;totals.set(w.chain,(totals.get(w.chain)||0)+amount);}
 const total=[...totals.values()].reduce((a,b)=>a+b,0),items=[...totals].map(([chain,activity])=>({chain,activity,percent:total?Math.round(activity/total*1000)/10:0})).sort((a,b)=>b.activity-a.activity);
 return {items,total_activity:total,label:exposureLabel(items[0]?.percent||0,items.length),method:'Distribusi jumlah observasi aktivitas wallet per chain; bukan nilai aset.'};
}
export async function riskReview(db,scope,{limit=100,offset=0}={}){
 const data=await load(db,scope),issues=[];
 for(const c of data.campaigns){
 const sources=safeJSON(c.source_evidence),official=safeJSON(c.official_urls),verified=Array.isArray(sources)&&sources.some(e=>e.verified_by==='system'&&validOfficial(e.source_url)&&official.includes(e.source_url));
 if(!verified)issues.push({campaign:c.name,campaign_id:c.id,reason:'Sumber belum terverifikasi',label:'Perlu ditinjau',source_url:official.find(validOfficial)||null});
 if(c.kyc_requirement==='unknown'||safeJSON(c.risk_flags).some(f=>/geo|kyc/i.test(String(f))))issues.push({campaign:c.name,campaign_id:c.id,reason:'KYC atau pembatasan wilayah belum jelas',label:'Perlu ditinjau',source_url:official.find(validOfficial)||null});
 if(c.claim_endpoint&&!sources.some(e=>e.source_url===c.claim_endpoint&&e.verified_by==='system'))issues.push({campaign:c.name,campaign_id:c.id,reason:'Claim page belum memiliki evidence resmi',label:'Perlu ditinjau',source_url:official.find(validOfficial)||null});
 }
 for(const p of data.progress)if(p.status!=='verified'&&['manual','url_submission','admin_review','none'].includes(p.verification_method))issues.push({campaign:p.campaign_name,quest:p.title,reason:'Quest memerlukan tindakan atau verifikasi manual',label:'Perlu ditinjau',source_url:validOfficial(p.official_url)?p.official_url:null});
 return {items:issues.slice(offset,offset+limit),total:issues.length,limit,offset,disclaimer:'Label ini bukan penetapan aman atau scam.'};
}
export async function portfolioDashboard(db,scope){const [summary,deadline,exposure,risk,actions]=await Promise.all([portfolioSummary(db,scope),deadlines(db,scope,{limit:25}),chainExposure(db,scope),riskReview(db,scope,{limit:25}),nextActions(db,scope,{limit:30})]);return {summary,deadlines:deadline,chain_exposure:exposure,risk_review:risk,next_best_actions:actions};}
export async function portfolioCampaignRows(db,scope,limit=100,offset=0){
 const result=await q(db,"SELECT c.id,c.name,c.chain,c.claim_deadline_at,c.official_urls,COALESCE(p.status,'todo') status,cq.title quest,p.points_awarded points,p.wallet_address wallet,p.evidence_url,p.note FROM campaigns c LEFT JOIN campaign_quests cq ON cq.campaign_id=c.id LEFT JOIN user_quest_progress p ON p.quest_id=cq.id AND p.user_scope=? WHERE EXISTS (SELECT 1 FROM user_campaign_subscriptions sub WHERE sub.campaign_id=c.id AND sub.user_scope=?) OR EXISTS (SELECT 1 FROM campaign_quests q2 JOIN user_quest_progress x ON x.quest_id=q2.id WHERE q2.campaign_id=c.id AND x.user_scope=?) OR EXISTS (SELECT 1 FROM eligibility_results er JOIN wallet_watchlist w ON w.id=er.wallet_id WHERE er.campaign_id=c.id AND w.user_id=?) ORDER BY c.name,cq.title LIMIT ? OFFSET ?",scope,scope,scope,scope,limit,offset).all();
 return rows(result).map(r=>({...r,chain:safeJSON(r.chain).join(','),official_url:safeJSON(r.official_urls).find(validOfficial)||null}));
}
export {validOfficial};

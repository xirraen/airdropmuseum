import {campaign,iso} from '../dist/aggregator-core.js';
export const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
const jsonFields=['chain','official_urls','eligibility_rules','risk_flags','source_evidence'];
export function decodeCampaign(row){if(!row)return null;const c={...row};for(const key of jsonFields)c[key]=JSON.parse(c[key]);return c;}
export async function getCampaign(db,id){return decodeCampaign(await statement(db,'SELECT * FROM campaigns WHERE id=? OR slug=?',id,id).first());}
export async function listCampaigns(db){return (await db.prepare('SELECT * FROM campaigns ORDER BY updated_at DESC LIMIT 500').all()).results.map(decodeCampaign);}
export async function putCampaign(db,input,event='research',now=iso()){
 const c=campaign(input,now),old=await getCampaign(db,c.id);c.created_at=old?.created_at||now;
 const changed=old&&old.status!==c.status,sourceChanged=old&&(JSON.stringify(old.official_urls)!==JSON.stringify(c.official_urls)||JSON.stringify(old.source_evidence)!==JSON.stringify(c.source_evidence)),newQuest=old&&c.eligibility_rules.some(r=>!old.eligibility_rules.some(p=>p.id===r.id));
 const keys=Object.keys(c),params=keys.map(k=>jsonFields.includes(k)?JSON.stringify(c[k]):c[k]);
 const insert=statement(db,`INSERT INTO campaigns(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${keys.filter(k=>k!=='id'&&k!=='created_at').map(k=>k+'=excluded.'+k).join(',')}`,...params);
 const stmts=[insert];
 for(const e of c.source_evidence)stmts.push(statement(db,'INSERT INTO campaign_sources(id,campaign_id,source_url,source_type,captured_at,note,verified_by,event_type) VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),c.id,e.source_url,e.source_type,e.captured_at,e.note,e.verified_by,changed?`status:${old.status}→${c.status}`:event));
 // D1 batch transactions ensure status and evidence commit together.
 await db.batch(stmts);try{await statement(db,'DELETE FROM user_portfolio_snapshots').run()}catch{/* 0009 not yet applied */}return {campaign:c,events:[...(!old?['new_campaign']:[]),...(sourceChanged?['source_changed']:[]),...(newQuest?['new_quest']:[])]};
}
export function matches(c,filters={},now=iso()){
 const status=c.status!=='archived'&&c.claim_deadline_at&&Date.parse(c.claim_deadline_at)<Date.parse(now)?'expired':c.status;
 return (!filters.chain||c.chain.includes(filters.chain))&&(!filters.status||status===filters.status)&&(!filters.category||c.category===filters.category)&&(!filters.reward_type||c.reward_type===filters.reward_type)&&(!filters.kyc_requirement||c.kyc_requirement===filters.kyc_requirement)&&(!filters.deadline_before||(c.claim_deadline_at&&Date.parse(c.claim_deadline_at)<=Date.parse(filters.deadline_before)))&&(!filters.snapshot_before||(c.snapshot_at&&Date.parse(c.snapshot_at)<=Date.parse(filters.snapshot_before)))&&(filters.max_gas==null||(c.gas_cost_estimate!=null&&c.gas_cost_estimate<=Number(filters.max_gas)));
}

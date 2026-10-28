import {problem} from './questTypes.mjs';
export function priorityForQuest(q,now=Math.floor(Date.now()/1000)){
 const end=q.ends_at??(q.claim_deadline_at?Math.floor(Date.parse(q.claim_deadline_at)/1000):null);
 const hours_left=end==null||!Number.isFinite(end)?null:Math.max(0,Math.ceil((end-now)/3600));
 const urgency=hours_left==null?0:hours_left<=24?10:hours_left<=72?7:hours_left<=168?4:hours_left<=336?2:0;
 const effort=Number.isFinite(q.estimated_effort)?q.estimated_effort:0;
 const gas=Number.isFinite(q.gas_cost_estimate)?q.gas_cost_estimate:0;
 const priority=urgency*3+q.weight*2+q.points*0.5-effort-gas;
 const group=hours_left!=null&&hours_left<=72?'harus_segera':hours_left!=null&&hours_left<=168?'minggu_ini':'bisa_menunggu';
 const why=hours_left!=null&&hours_left<=24?'Tenggat kurang dari 24 jam.':hours_left!=null&&hours_left<=72?'Tenggat mendekat dalam tiga hari.':hours_left!=null&&hours_left<=168?'Periksa sebelum akhir pekan ini.':'Belum ada tenggat dekat; urutkan sesuai bobot dan usaha.';
 return {priority,group,hours_left,deadline:end,reason:why+' Poin hanya metrik internal; periksa syarat dan sumber resmi.'};
}
export async function nextActions(db,user_scope,{limit=100,offset=0}={},now=Math.floor(Date.now()/1000)){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>100000)problem('INVALID_PAGINATION');
 const rows=(await db.prepare(`SELECT q.id,q.title,q.quest_type,q.points,q.weight,q.ends_at,q.verification_method,
 c.name AS campaign_name,c.slug AS campaign_slug,c.status AS campaign_status,c.estimated_effort,c.gas_cost_estimate,c.claim_deadline_at,
 COALESCE(p.status,'todo') AS status
 FROM campaign_quests q JOIN campaigns c ON c.id=q.campaign_id
 LEFT JOIN user_quest_progress p ON p.quest_id=q.id AND p.user_scope=? AND p.wallet_address IS NULL
 WHERE (q.ends_at IS NULL OR q.ends_at>?) AND (q.starts_at IS NULL OR q.starts_at<=?)
 AND c.status NOT IN ('expired','archived') AND (c.claim_deadline_at IS NULL OR c.claim_deadline_at>?)
 AND NOT EXISTS (SELECT 1 FROM user_quest_progress p2 WHERE p2.quest_id=q.id AND p2.user_scope=? AND p2.status IN ('verified','not_applicable'))
 ORDER BY q.ends_at ASC LIMIT 500`).bind(user_scope,now,now,new Date(now*1000).toISOString(),user_scope).all()).results;
 const filtered=rows.map(q=>({...q,...priorityForQuest(q,now)})).sort((a,b)=>
 (a.deadline??Infinity)-(b.deadline??Infinity)||b.weight-a.weight||b.points-a.points||
 a.estimated_effort-b.estimated_effort|| (a.gas_cost_estimate??Infinity)-(b.gas_cost_estimate??Infinity)||
 (a.campaign_status==='confirmed'?-1:0)-(b.campaign_status==='confirmed'?-1:0)||b.priority-a.priority||a.id.localeCompare(b.id));
 const items=filtered.slice(offset,offset+limit).map(({priority,group,reason,hours_left,deadline,...q})=>({campaign_name:q.campaign_name,campaign_slug:q.campaign_slug,quest_id:q.id,quest_title:q.title,status:q.status,points:q.points,deadline,hours_left,priority,group,reason}));
 return {harus_segera:items.filter(q=>q.group==='harus_segera'),minggu_ini:items.filter(q=>q.group==='minggu_ini'),bisa_menunggu:items.filter(q=>q.group==='bisa_menunggu'),total:filtered.length,limit,offset};
}

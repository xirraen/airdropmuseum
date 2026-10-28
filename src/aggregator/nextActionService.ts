import {statement as s} from './pointsService.ts';
const day=86400000;
function deadline(q){const campaignDate=q.claim_deadline_at?Date.parse(q.claim_deadline_at):NaN;return q.ends_at??(Number.isFinite(campaignDate)?campaignDate:null);}
export function scoreAction(item,time=Date.now()){
 const due=deadline(item),hours=due===null?null:(due-time)/3600000;
 const urgency=hours===null?0:hours<=24?10:hours<=72?7:hours<=168?4:hours<=336?2:0;
 const effort=Math.max(0,Number(item.estimated_effort)||0),gas=Math.max(0,Number(item.gas_cost_estimate)||0);
 const priority=urgency*3+Number(item.weight)*2+Number(item.points)*.5-effort-gas;
 return {priority,hours_left:hours===null?null:Math.round(hours*10)/10,deadline:due,urgency};
}
export function rankActions(items,time=Date.now()){
 const scored=items.filter(q=>!['verified','expired','not_applicable'].includes(q.status)&&!['expired','archived'].includes(q.campaign_status)&&((deadline(q)??Infinity)>=time)&&(!q.starts_at||q.starts_at<=time)).map(q=>({...q,...scoreAction(q,time)}));
 return scored.sort((a,b)=>{
  const ad=a.deadline??Infinity,bd=b.deadline??Infinity;
  return ad-bd||b.weight-a.weight||b.points-a.points||(a.estimated_effort??Infinity)-(b.estimated_effort??Infinity)||(a.gas_cost_estimate??Infinity)-(b.gas_cost_estimate??Infinity)||(a.campaign_status==='confirmed'?-1:1)||(b.priority-a.priority)||a.id.localeCompare(b.id);
 }).slice(0,100).map(q=>{
  const group=q.hours_left!==null&&q.hours_left<=72?'harus_segera':q.hours_left!==null&&q.hours_left<=168?'minggu_ini':'bisa_menunggu';
  const message=q.hours_left===null?'Belum ada deadline resmi; periksa sumber dan rencanakan verifikasi.':q.hours_left<=24?'Tenggat kurang dari 24 jam; verifikasi syarat dan bukti resmi sebelum bertindak.':q.hours_left<=168?'Deadline dalam tujuh hari; jadwalkan pemeriksaan dan bukti.':'Tenggat masih jauh; utamakan langkah yang mendekati batas waktu.';
  return {id:q.id,campaign_name:q.campaign_name,campaign_slug:q.campaign_slug,quest_title:q.title,status:q.status,points:q.points,deadline:q.deadline,hours_left:q.hours_left,priority:q.priority,group,reason:message+(q.campaign_status!=='confirmed'?' Status campaign belum dikonfirmasi.':'')};
 });
}
export async function nextActions(db,scope,time=Date.now()){
 const {results}=await s(db,"SELECT q.id,q.title,q.weight,q.points,q.starts_at,q.ends_at,c.name campaign_name,c.slug campaign_slug,c.status campaign_status,c.claim_deadline_at,c.estimated_effort,c.gas_cost_estimate,COALESCE(p.status,'todo') status FROM campaign_quests q JOIN campaigns c ON c.id=q.campaign_id LEFT JOIN user_quest_progress p ON p.quest_id=q.id AND p.user_scope=? AND p.wallet_address IS NULL WHERE q.ends_at IS NULL OR q.ends_at>=? ORDER BY q.ends_at IS NULL,q.ends_at,q.id LIMIT 1500",scope,time).all();
 const ranked=rankActions(results,time);return {harus_segera:ranked.filter(v=>v.group==='harus_segera'),minggu_ini:ranked.filter(v=>v.group==='minggu_ini'),bisa_menunggu:ranked.filter(v=>v.group==='bisa_menunggu'),count:ranked.length,notice:'Prioritas adalah panduan tindakan, bukan perkiraan nilai atau jaminan reward.'};
}

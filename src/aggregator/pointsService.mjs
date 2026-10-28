import {problem} from './questTypes.mjs';
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
export async function pointsSummary(db,user_scope){
 const row=await stmt(db,'SELECT COALESCE(SUM(points),0) AS points FROM user_points_ledger WHERE user_scope=?',user_scope).first();
 return {points:Math.max(0,row?.points||0),kind:'metrik_internal',disclaimer:'Poin bukan token, saldo, atau janji reward.'};
}
export async function ledger(db,user_scope,{limit=20,offset=0}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0||offset>100000)problem('INVALID_PAGINATION');
 const [items,total]=await Promise.all([
 stmt(db,'SELECT id,campaign_id,quest_id,wallet_address,points,reason,created_at FROM user_points_ledger WHERE user_scope=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',user_scope,limit,offset).all(),
 stmt(db,'SELECT COUNT(*) AS n FROM user_points_ledger WHERE user_scope=?',user_scope).first()]);
 return {items:items.results,total:total.n,limit,offset};
}
export function streakFromDays(days,nowMs=Date.now(),zone='UTC'){
 let formatter;try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});}catch{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'});}
 const key=(ms)=>{const p=Object.fromEntries(formatter.formatToParts(ms).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
 const set=new Set(days.map(n=>key(n*1000)));
 let count=0,day=nowMs,last=Math.max(0,...days)*1000;
 if(!last||nowMs-last>48*3600000)return 0;
 if(!set.has(key(nowMs)))day=nowMs-86400000;
 while(set.has(key(day))){count++;day-=86400000;if(count>3650)break;}
 return count;
}
export async function userStreak(db,user_scope,timezone='UTC',now=Date.now()){
 const rows=await stmt(db,"SELECT DISTINCT completed_at FROM user_quest_progress WHERE user_scope=? AND status='verified' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 400",user_scope).all();
 return {streak:streakFromDays(rows.results.map(r=>r.completed_at),now,timezone),timezone};
}

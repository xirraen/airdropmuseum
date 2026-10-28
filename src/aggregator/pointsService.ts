// The ledger is append-only. Updates and ledger events must share a D1 batch.
import {err} from './questTypes.ts';
export const statement=(db,sql,...args)=>db.prepare(sql).bind(...args);
export async function pointsSummary(db,scope,{page=1,limit=30}={}){
 page=Math.max(1,Math.min(10000,Number(page)||1));limit=Math.max(1,Math.min(100,Number(limit)||30));
 const [{total}, {n}, {results}]=await Promise.all([
 statement(db,'SELECT COALESCE(SUM(points),0) total FROM user_points_ledger WHERE user_scope=?',scope).first(),
 statement(db,'SELECT COUNT(*) n FROM user_points_ledger WHERE user_scope=?',scope).first(),
 statement(db,'SELECT id,campaign_id,quest_id,wallet_address,points,reason,created_at FROM user_points_ledger WHERE user_scope=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',scope,limit,(page-1)*limit).all()]);
 return {points:total,ledger:results,page,limit,total_entries:n,has_more:page*limit<n};
}
export function dayKey(when,timeZone='UTC'){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(when));
 const val=k=>parts.find(p=>p.type===k).value;
 return [val('year'),val('month'),val('day')].join('-');
}
export function streakFromVerified(timestamps,time=Date.now(),tz='UTC'){
 let zone='UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:tz});zone=tz}catch{}
 const ordered=[...new Set(timestamps.filter(n=>Number.isFinite(n)&&n<=time).map(n=>dayKey(n,zone)))].sort().reverse();
 if(!ordered.length||time-Math.max(...timestamps.filter(n=>Number.isFinite(n)&&n<=time))>48*3600000)return 0;
 let previous=null,count=0;
 for(const day of ordered){if(previous){const a=Date.parse(previous+'T00:00:00Z'),b=Date.parse(day+'T00:00:00Z');if(a-b!==86400000)break;}previous=day;count++;}
 return count;
}
export async function userStreak(db,scope,tz='UTC',time=Date.now()){
 const rows=(await statement(db,"SELECT completed_at FROM user_quest_progress WHERE user_scope=? AND status='verified' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 365",scope).all()).results;
 return streakFromVerified(rows.map(v=>v.completed_at),time,tz);
}
// Only scoped reads; do not sum raw points from client requests.
export async function progressSummary(db,scope,campaignId){
 const rows=(await statement(db,'SELECT q.required,q.id,p.status,p.points_awarded FROM campaign_quests q LEFT JOIN user_quest_progress p ON p.quest_id=q.id AND p.user_scope=? AND p.wallet_address IS NULL WHERE q.campaign_id=?',scope,campaignId).all()).results;
 const required=rows.filter(r=>r.required),verified=required.filter(r=>r.status==='verified');
 return {total:rows.length,required:required.length,verified:verified.length,percent:required.length?Math.round(100*verified.length/required.length):0,has_evidence:verified.length>0};
}

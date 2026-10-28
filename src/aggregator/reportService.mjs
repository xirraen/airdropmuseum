import {portfolioSummary,deadlines,riskReview} from './portfolioService.mjs';
import {matches} from '../aggregator-store.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const rows=r=>r?.results||[];
export const REPORT_DISCLAIMER='Periksa ulang semua syarat dan tautan sumber resmi. Poin merupakan catatan internal; tidak ada jaminan eligibility atau reward.';
export function localTime(now=Date.now(),zone='UTC'){
 let parts;try{parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now)}catch{return localTime(now,'UTC')}
 const f=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const day=f.year+'-'+f.month+'-'+f.day;
 const dt=new Date(day+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()-(dt.getUTCDay()+6)%7);
 return {weekday:f.weekday,hour:Number(f.hour),local_date:day,week_start:dt.toISOString().slice(0,10),timezone:zone};
}
export async function weeklyReport(db,scope,{now=Date.now(),filters={}}={}){
 const start=Math.floor((now-7*86400000)/1000);
 const [quest,points,deadline,risk,newCampaigns]=await Promise.all([
  q(db,"SELECT COUNT(*) AS n FROM user_quest_progress WHERE user_scope=? AND status='verified' AND completed_at>=?",scope,start).first(),
  q(db,'SELECT COALESCE(SUM(points),0) AS n FROM user_points_ledger WHERE user_scope=? AND created_at>=?',scope,start).first(),
  deadlines(db,scope,{limit:20,now}),riskReview(db,scope,{limit:20}),
  q(db,'SELECT * FROM campaigns WHERE created_at>=? ORDER BY created_at DESC LIMIT 100',new Date(now-7*86400000).toISOString()).all()
 ]);
 const recent=rows(newCampaigns).map(c=>({...c,chain:JSON.parse(c.chain),risk_flags:JSON.parse(c.risk_flags),official_urls:JSON.parse(c.official_urls),source_evidence:JSON.parse(c.source_evidence),eligibility_rules:JSON.parse(c.eligibility_rules)})).filter(c=>matches(c,filters)).slice(0,10);
 const items=deadline.items.filter(d=>Date.parse(d.deadline)>=now);
 const review=risk.items;
 if(!Number(quest?.n)&&!Number(points?.n)&&!items.length&&!review.length&&!recent.length)return null;
 const sections=['Airdrop Museum · Laporan mingguan','Quest terverifikasi minggu lalu: '+Number(quest?.n||0),'Perubahan poin internal: '+Number(points?.n||0)];
 if(items.length)sections.push('Deadline 7 hari:',...items.slice(0,8).map(x=>'- '+x.campaign+' | '+x.deadline+' | '+(x.source_url||'Periksa sumber resmi')));
 if(recent.length)sections.push('Campaign baru sesuai filter:',...recent.map(x=>'- '+x.name+' | '+(x.official_urls.find(u=>u.startsWith('https://'))||'Periksa sumber resmi')));
 if(review.length)sections.push('Perlu verifikasi manual:',...review.slice(0,8).map(x=>'- '+x.campaign+': '+x.reason));
 sections.push(REPORT_DISCLAIMER);
 return {text:sections.join('\n').slice(0,3900),counts:{verified:Number(quest?.n||0),points:Number(points?.n||0),deadlines:items.length,campaigns:recent.length,manual_review:review.length}};
}
export async function sendWeeklyReports(env,fetcher=fetch,now=Date.now()){
 if(!env.DB||!env.TELEGRAM_BOT_TOKEN)return {skipped:true};
 const users=await q(env.DB,'SELECT user_id,filters,weekly_timezone FROM alert_preferences WHERE enabled=1 AND weekly_enabled=1 ORDER BY user_id LIMIT 500').all();
 let sent=0,skipped=0,failed=0;
 for(const p of rows(users)){
  const local=localTime(now,p.weekly_timezone||'UTC');
  if(local.weekday!=='Mon'||local.hour!==9)continue;
  const found=await q(env.DB,'SELECT status FROM weekly_report_deliveries WHERE user_scope=? AND week_start=?',p.user_id,local.week_start).first();
  if(found?.status==='sent'||found?.status==='skipped')continue;
  let filters={};try{filters=JSON.parse(p.filters||'{}')}catch{}
  try{
   const report=await weeklyReport(env.DB,p.user_id,{now,filters});
   if(!report){await q(env.DB,"INSERT INTO weekly_report_deliveries(user_scope,week_start,status,updated_at) VALUES(?,?,'skipped',?) ON CONFLICT(user_scope,week_start) DO UPDATE SET status='skipped',updated_at=excluded.updated_at",p.user_id,local.week_start,new Date(now).toISOString()).run();skipped++;continue;}
   const locked=await q(env.DB,"INSERT INTO weekly_report_deliveries(user_scope,week_start,status,updated_at) VALUES(?,?,'sending',?) ON CONFLICT(user_scope,week_start) DO UPDATE SET status='sending',updated_at=excluded.updated_at WHERE status='failed' OR (status='sending' AND updated_at<?)",p.user_id,local.week_start,new Date(now).toISOString(),new Date(now-300000).toISOString()).run();
   if(!locked.meta?.changes)continue;
   if(!/^tg:[1-9]\d*$/.test(p.user_id))throw Error('INVALID_RECIPIENT');
   const response=await fetcher('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:p.user_id.slice(3),text:report.text,disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)});
   if(!response.ok||!(await response.json()).ok)throw Error('DELIVERY_FAILED');
   await q(env.DB,"UPDATE weekly_report_deliveries SET status='sent',updated_at=? WHERE user_scope=? AND week_start=?",new Date(now).toISOString(),p.user_id,local.week_start).run();sent++;
  }catch{failed++;await q(env.DB,"UPDATE weekly_report_deliveries SET status='failed',updated_at=? WHERE user_scope=? AND week_start=?",new Date(now).toISOString(),p.user_id,local.week_start).run();}
 }
 return {sent,skipped,failed};
}

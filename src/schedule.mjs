// A single Cloudflare trigger preserves independent UTC job cadences.
// Legacy triggers remain supported for application rollback compatibility.
export function dueSchedules(event) {
 const legacy=['17 * * * *','*/30 * * * *','37 */6 * * *','*/5 * * * *','*/15 * * * *'];
 if(event.cron!=='* * * * *')return legacy.includes(event.cron)?[event.cron]:[];
 if(!Number.isFinite(event.scheduledTime))return [];
 const date=new Date(event.scheduledTime),minute=date.getUTCMinutes(),hour=date.getUTCHours();
 return legacy.filter(cron=>cron==='17 * * * *'?minute===17:cron==='*/30 * * * *'?minute%30===0:cron==='37 */6 * * *'?minute===37&&hour%6===0:cron==='*/5 * * * *'?minute%5===0:minute%15===0);
}

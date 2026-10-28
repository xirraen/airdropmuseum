import {portfolioSummary,deadlines,riskReview,portfolioCampaignRows} from './portfolioService.mjs';
import {nextActions} from './nextActionService.mjs';
const MAX_FIELD=4096;
export function safeField(value){let s=String(value??'').slice(0,MAX_FIELD);s=s.replace(/[\u0000-\u001f\u007f]/g,' ').trim();return s;}
export function csvCell(value){const raw=safeField(value),escaped=/^[\s]*[=+\-@]/.test(raw)?"'"+raw:raw;return '"'+escaped.replace(/"/g,'""')+'"';}
export function csvLine(items){return items.map(csvCell).join(',')+'\r\n';}
const filename=(format)=>'portfolio-airdrop-museum.'+format;
function download(content,format,type,next=null){
 const headers={'Content-Type':type,'Content-Disposition':'attachment; filename="'+filename(format)+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 if(next!==null)headers['X-Next-Offset']=String(next);
 return new Response(content,{headers});
}
export async function exportPortfolio(db,scope,format,{limit=100,offset=0}={}){
 const [summary,deadline,risk,actions,items]=await Promise.all([portfolioSummary(db,scope),deadlines(db,scope,{limit:100}),riskReview(db,scope,{limit:100}),nextActions(db,scope,{limit:100}),portfolioCampaignRows(db,scope,limit+1,offset)]);
 const hasNext=items.length>limit,rows=items.slice(0,limit),next=hasNext?offset+limit:null;
 const payload={schema_version:1,generated_at:new Date().toISOString(),summary,deadlines:deadline.items,priority_quests:[...actions.harus_segera,...actions.minggu_ini,...actions.bisa_menunggu],eligibility_progress:{quests:summary.quests,manual_review:summary.manual_review},risk_review:risk.items,campaigns:rows,next_offset:next,disclaimer:'Poin adalah catatan internal, bukan aset atau janji reward. Semua sumber harus diverifikasi manual.'};
 if(format==='json')return download(JSON.stringify(payload,null,2),'json','application/json; charset=utf-8',next);
 if(format==='csv'){
  let content=csvLine(['Campaign','Quest','Status','Chain','Deadline','Poin','Wallet','Evidence URL','Catatan']);
  for(const r of rows)content+=csvLine([r.name,r.quest,r.status,r.chain,r.claim_deadline_at,r.points||0,r.wallet,r.evidence_url||r.official_url||'',r.note]);
  return download(content,'csv','text/csv; charset=utf-8',next);
 }
 if(format!=='markdown')throw Object.assign(Error('FORMAT_NOT_SUPPORTED'),{status:404});
 const line=s=>safeField(s).replace(/([\[\]()*_\\])/g,'\\$1');
 const out=['# Portfolio Airdrop Museum','Dibuat: '+payload.generated_at,'','## Ringkasan','- Campaign diikuti: '+summary.total_campaigns,'- Campaign aktif: '+summary.active_campaigns,'- Total poin internal: '+summary.internal_points,'- Wallet dipantau: '+summary.wallets_monitored,'- Perlu verifikasi manual: '+summary.manual_review,'','## Deadline',...deadline.items.map(d=>'- '+line(d.campaign)+' | '+line(d.deadline)+' | '+(d.source_url||'Sumber perlu diverifikasi')),'','## Quest prioritas',...payload.priority_quests.map(a=>'- '+line(a.campaign_name)+' — '+line(a.quest_title)+' ('+line(a.group)+')'),'','## Eligibility progress','- Verified quests: '+summary.quests.verified,'- Submitted quests: '+summary.quests.submitted,'- Manual review: '+summary.manual_review,'','## Risiko yang perlu ditinjau',...risk.items.map(r=>'- Perlu ditinjau: '+line(r.campaign)+' — '+line(r.reason)),'','## Link sumber resmi',...rows.filter(r=>r.official_url).map(r=>'- '+line(r.name)+': '+r.official_url),'','> '+payload.disclaimer];
 return download(out.join('\n')+'\n','md','text/markdown; charset=utf-8',next);
}

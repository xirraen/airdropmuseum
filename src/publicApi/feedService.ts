import {listCampaigns} from './campaignApi.ts';
import {DISCLAIMER,str} from './types.ts';
export function xml(s){return String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function date(value){const ms=Date.parse(value||'');return Number.isFinite(ms)?new Date(ms).toUTCString():new Date(0).toUTCString();}
export async function feed(env,origin,kind){
 const params=new URLSearchParams({limit:'100'}),result=await listCampaigns(env,params,kind==='deadlines'?'deadlines':null);
 const items=result.items.filter(x=>kind==='campaigns'||x.claim_deadline_at).map(c=>{
 const link=origin+'/v1/campaigns/'+encodeURIComponent(c.slug);
 const title=kind==='deadlines'?c.name+' — claim deadline':c.name;
 const summary=str(c.description,300)+' | '+DISCLAIMER+(kind==='deadlines'?' | Claim deadline: '+(c.claim_deadline_at||'unknown'):'');
 const published=c.updated_at;
 return '<item><title>'+xml(title)+'</title><link>'+xml(link)+'</link><guid isPermaLink="false">'+xml('airdropmuseum:'+kind+':'+c.slug)+'</guid><pubDate>'+xml(date(published))+'</pubDate><description>'+xml(summary)+'</description><category>'+xml(c.category)+'</category><source url="'+xml(c.source_url)+'">'+xml(new URL(c.source_url).hostname)+'</source></item>';
 }).join('');
 return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Airdrop Museum — '+xml(kind)+'</title><link>'+xml(origin)+'</link><description>'+xml(DISCLAIMER)+'</description><language>id</language><lastBuildDate>'+xml(date(result.items[0]?.updated_at||'1970-01-01T00:00:00Z'))+'</lastBuildDate>'+items+'</channel></rss>';
}

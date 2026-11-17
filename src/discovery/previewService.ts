import {normalizeUrl,DiscoveryError} from './types.ts';
import {download,boundedResponse} from './ingestService.ts';
import {parseFeed} from './feedParser.ts';
import {requireProviderRights,parseCryptoRankActivities,downloadCryptoRank} from './providerAdapters.ts';
import {classify} from './classifier.ts';

// This operation is intentionally stateless: no queue, D1 writes, alert, or
// publication. It shares the same HTTPS/redirect/timeout/size safeguards as
// scheduled ingestion, but never sends conditional ETag headers.
export async function previewDiscoverySource(source,{fetcher=fetch,env={}}={}){
 const url=normalizeUrl(source.feed_url);
 const provider=requireProviderRights(source,env);
 const response=provider==='cryptorank'?await downloadCryptoRank(url,env,fetcher):await download(url,{
  Accept:'application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml;q=0.8'
 },fetcher);
 if(!response.ok)throw new DiscoveryError('FETCH_FAILED',502);
 const content=await boundedResponse(response);
 const items=provider==='cryptorank'?parseCryptoRankActivities(content):parseFeed(content,source.source_type,url);
 const sample=items.slice(0,10).map(item=>({
  title:item.title,url:item.url,summary:item.summary,published_at:item.published_at,
  ...classify({title:item.title,summary:item.summary})
 }));
 return {
  source_id:source.id,
  source_type:source.source_type,
  total_sampled:items.length,
  truncated:items.length>sample.length,
  items:sample,
  warning:'Pratinjau metadata belum membuktikan keaslian, eligibility, atau keamanan campaign. Verifikasi sumber dan izin feed sebelum aktivasi.'
 };
}

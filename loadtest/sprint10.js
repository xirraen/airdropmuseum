import http from 'k6/http';
import {check,sleep} from 'k6';
const base=(__ENV.BASE_URL||'').replace(/\/$/,'');
if(!/^https:\/\/airdrop-museum-(?:staging|preview-pr-\d+)\.[a-z0-9-]+\.workers\.dev$/.test(base))throw Error('BASE_URL must be a dedicated staging/preview Worker');
if(!/^[a-zA-Z0-9_-]{1,160}$/.test(__ENV.CAMPAIGN_SLUG||''))throw Error('Published synthetic CAMPAIGN_SLUG required');
if(!/^am_v1_[a-f0-9]{64}$/.test(__ENV.API_KEY||''))throw Error('Dedicated short-lived staging API key required');
export const options={
 stages:[{duration:'30s',target:5},{duration:'1m',target:15},{duration:'30s',target:0}],
 thresholds:{
  'http_req_failed{scenario:default}':['rate<0.01'],
  'http_req_duration{endpoint:campaigns}':['p(95)<500'],
  'http_req_duration{endpoint:detail}':['p(95)<500'],
  'http_req_duration{endpoint:deadlines}':['p(95)<500'],
  'http_req_duration{endpoint:feed}':['p(95)<500']
 }
};
const paths=[['campaigns','/v1/campaigns'],['detail','/v1/campaigns/'+__ENV.CAMPAIGN_SLUG],['deadlines','/v1/deadlines'],['feed','/v1/feeds/campaigns.xml'],['health','/api/aggregator/health']];
export default function(){
 const [name,path]=paths[(__VU+__ITER)%paths.length];
 const res=http.get(base+path,{headers:{Accept:name==='feed'?'application/rss+xml':'application/json',Authorization:'Bearer '+__ENV.API_KEY},tags:{endpoint:name}});
 check(res,{'successful endpoint':r=>r.status===200});
 sleep(1.5);
}

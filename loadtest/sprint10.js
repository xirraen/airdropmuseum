import http from 'k6/http';
import {check,sleep} from 'k6';
const base=(__ENV.BASE_URL||'').replace(/\/$/,'');
if(!/^https:\/\//.test(base))throw Error('BASE_URL must be an HTTPS preview/staging URL');
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
const paths=[['campaigns','/v1/campaigns'],['detail','/v1/campaigns/'+(__ENV.CAMPAIGN_SLUG||'sample')],['deadlines','/v1/deadlines'],['feed','/v1/feeds/campaigns.xml'],['health','/api/aggregator/health']];
export default function(){
 const [name,path]=paths[(__VU+__ITER)%paths.length];
 const res=http.get(base+path,{headers:{Accept:name==='feed'?'application/rss+xml':'application/json'},tags:{endpoint:name}});
 check(res,{'non-error or expected unknown sample':r=>r.status===200||(name==='detail'&&r.status===404)});
 sleep(1.5);
}

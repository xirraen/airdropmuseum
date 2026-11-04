import http from 'k6/http';
import {check,sleep} from 'k6';
export const options={vus:5,duration:'60s',thresholds:{http_req_failed:['rate<0.01'],http_req_duration:['p(95)<500'],checks:['rate>0.99']}};
export default function(){const r=http.get('https://airdrop-museum.xirraen.workers.dev'+['/api/health','/api/capabilities','/api/v1/airdrops','/api/aggregator/health'][(__VU+__ITER)%4],{redirects:0});check(r,{'public endpoint returns HTTP 200':r=>r.status===200});sleep(1.5);}

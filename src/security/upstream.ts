import {safeHttpsUrl} from './validation.ts';
// Explicit URL validation, no automatic redirects, bounded response, timeout and short circuit.
const breakers=new Map();
export async function upstreamFetch(url,{fetcher=fetch,timeoutMs=6000,retries=2,allowedHosts=null,...options}={}){
 const target=safeHttpsUrl(url,{allowedHosts}),host=new URL(target).hostname;
 const now=Date.now(),state=breakers.get(host)||{failures:0,until:0};
 if(state.until>now)throw Error('UPSTREAM_CIRCUIT_OPEN');
 let last;
 for(let attempt=0;attempt<=Math.min(retries,2);attempt++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(Math.max(timeoutMs,1000),10000));
  try{
   const response=await fetcher(target,{...options,redirect:'manual',signal:controller.signal});
   if(response.status>=300&&response.status<400)throw Error('UPSTREAM_REDIRECT_REFUSED');
   if(response.ok||response.status<500&&response.status!==429){
    breakers.delete(host);return response;
   }
   throw Error('UPSTREAM_FAILED');
  }catch(error){
   last=error;
  }finally{clearTimeout(timer);}
  if(attempt<retries)await new Promise(r=>setTimeout(r,Math.min(200*2**attempt+Math.floor(Math.random()*100),1000)));
 }
 const failures=state.failures+1;
 breakers.set(host,{failures,until:failures>=3?Date.now()+30000:0});
 if(breakers.size>200)breakers.clear();
 throw Error(last?.message==='UPSTREAM_REDIRECT_REFUSED'?'UPSTREAM_REDIRECT_REFUSED':'UPSTREAM_UNAVAILABLE');
}

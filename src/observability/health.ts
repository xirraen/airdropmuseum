export async function healthResponse(request,env){
 if(new URL(request.url).pathname!=='/api/aggregator/health')return null;
 if(!['GET','HEAD'].includes(request.method))return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers:{Allow:'GET, HEAD'}});
 let d1='unavailable';
 if(env.DB){try{await env.DB.prepare('SELECT 1').first();d1='ready';}catch{}}
 const limiter=env.PUBLIC_API_RATE_LIMITER?'ready':'unavailable';
 const status=d1==='ready'&&limiter==='ready'?'healthy':'degraded';
 const payload={status,checks:{d1,rate_limiter:limiter},checked_at:Math.floor(Date.now()/1000)};
 return Response.json(payload,{status:status==='healthy'?200:503,headers:{'Cache-Control':'no-store'}});
}

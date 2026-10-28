const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requestContext(request){
 const candidate=request.headers.get('X-Request-ID')||'';
 const request_id=UUID.test(candidate)?candidate.toLowerCase():crypto.randomUUID();
 return {request_id,started:Date.now(),method:request.method,route:safeRoute(new URL(request.url).pathname)};
}
export function safeRoute(path){
 if(path.startsWith('/api/admin/'))return '/api/admin/*';
 if(path.startsWith('/api/me/'))return '/api/me/*';
 if(/^\/v1\/campaigns\/[^/]+/.test(path))return '/v1/campaigns/:slug';
 if(/^\/v1\/webhooks\/[^/]+/.test(path))return '/v1/webhooks/:id';
 if(path.length>100||!/^[a-zA-Z0-9_./-]+$/.test(path))return '/other';
 return path;
}

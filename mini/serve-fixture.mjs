import {build} from 'esbuild';
import {createServer} from 'node:http';
const result=await build({entryPoints:['mini/worker.js'],bundle:true,format:'esm',platform:'node',loader:{'.html':'text','.css':'text','.client':'text','.base64':'text'},write:false});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
createServer(async(req,res)=>{
 const method=req.method||'GET';
 const headers=new Headers();
 for(const [name,value] of Object.entries(req.headers)){if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(','):value);}
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>1048576){res.writeHead(413);res.end();return;}chunks.push(chunk);}
 const request=new Request('http://localhost'+req.url,{method,headers,body:['GET','HEAD'].includes(method)?undefined:Buffer.concat(chunks)});
 const response=await worker.fetch(request,{},{});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}).listen(4182,'127.0.0.1');

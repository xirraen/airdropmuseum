import {build} from 'esbuild';
import {createServer} from 'node:http';
const result=await build({entryPoints:['mini/worker.js'],bundle:true,format:'esm',platform:'node',loader:{'.html':'text','.css':'text','.client':'text'},write:false});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
createServer(async(req,res)=>{
 const response=await worker.fetch(new Request('http://localhost'+req.url),{},{});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}).listen(4182,'127.0.0.1');

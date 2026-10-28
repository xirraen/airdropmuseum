import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const generated=new Set(['worker.mjs','delivery-bundle.mjs','platform-bundle.mjs','platform-bundle.js','walletconnect-bundle.js','aggregator-ui-bundle.js']);
let checked=0;
function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=dir+'/'+item.name;if(item.isDirectory())walk(path);else if(/\.(mjs|js|ts)$/.test(path)&&!generated.has(item.name)){const p=spawnSync(process.execPath,['--experimental-strip-types','--check',path],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);checked++;}}}
for(const root of ['src','dist','scripts','tests','test-support'])walk(root);
console.log('Syntax validation passed for '+checked+' source files');

import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
const candidates=['src','dist','scripts','.github','docs','wrangler.jsonc','package.json'];
const ignored=new Set(['node_modules','.git','package-lock.json','brand.jpg','worker.mjs','platform-bundle.mjs','delivery-bundle.mjs','walletconnect-bundle.js','platform-bundle.js']);
const patterns=[/ghp_[A-Za-z0-9]{36}/,/github_pat_[A-Za-z0-9_]{40,}/,/sk_live_[A-Za-z0-9]{20,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
let checked=0;
function walk(path){
 const stat=statSync(path,{throwIfNoEntry:false});if(!stat)return;
 const name=path.split('/').pop();if(ignored.has(name))return;
 if(stat.isDirectory()){for(const child of readdirSync(path))walk(join(path,child));return;}
 if(!stat.isFile()||!(/\.(?:js|mjs|ts|json|jsonc|md|yml|yaml|html|sql|toml|css)$/.test(path)))return;
 const content=readFileSync(path,'utf8');checked++;
 for(const pattern of patterns)if(pattern.test(content))throw Error('Possible embedded credential in '+path);
}
for(const entry of candidates)walk(entry);
console.log('Credential pattern scan completed for '+checked+' files.');

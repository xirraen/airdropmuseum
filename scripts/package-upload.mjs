// Generate the module list for Cloudflare's multipart upload API. No credentials.
import {readFileSync,writeFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const paths={'worker.mjs':'src/worker.mjs','api.mjs':'src/api.mjs','platform-api.mjs':'src/platform-bundle.mjs','delivery.mjs':'src/delivery-bundle.mjs','auth.mjs':'src/auth.mjs','rewards-api.mjs':'src/rewards-api.mjs','rewards.js':'dist/rewards.js','hunter.js':'dist/hunter.js','campaigns.js':'dist/campaigns.js','model.js':'dist/model.js','exhibits.js':'dist/exhibits.js','catalog.js':'dist/catalog.js'};
const modules=Object.entries(paths).map(([name,path])=>({name,type:'application/javascript+module',content:readFileSync(path,'utf8').replaceAll("'../dist/model.js'","'./model.js'").replaceAll("'../dist/catalog.js'","'./catalog.js'").replace(/'\.\/exhibits\.js\?v=[^']+'/g,"'./exhibits.js'")}));
const metadata={main_module:'worker.mjs',compatibility_date:config.compatibility_date,compatibility_flags:['nodejs_compat'],keep_bindings:['secret_text'],bindings:[{type:'ai',name:'AI'},...Object.entries(config.vars||{}).map(([name,text])=>({type:'plain_text',name,text})),...config.d1_databases.map(d=>({type:'d1',name:d.binding,database_id:d.database_id}))]};
if(!process.argv[2])throw Error('An output path is required');writeFileSync(process.argv[2],JSON.stringify({metadata,modules}));

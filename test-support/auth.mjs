import {createHash} from 'node:crypto';
import {createDecision} from '../src/autopsy/decisionService.ts';
const cookie='c'.repeat(64);
const sha=s=>createHash('sha256').update(s).digest('hex');
export function seedAdmin(sql,role='super_admin'){
 sql.prepare("INSERT OR IGNORE INTO am_users(id,username) VALUES('tg:900','Test admin')").run();
 sql.prepare("INSERT OR REPLACE INTO admin_users(admin_scope,role,enabled) VALUES('tg:900',?,1)").run(role);
 sql.prepare("INSERT OR REPLACE INTO am_sessions(token_hash,user_id,expires) VALUES(?,'tg:900',?)").run(sha(cookie),Math.floor(Date.now()/1000)+3600);
}
export function adminHeaders(){return {Cookie:'am_session='+cookie,Origin:'https://museum.example.org','X-CSRF-Token':sha('admin-csrf:v1:'+cookie+':')};}
export async function seedDecision(db,campaign='demo',scope='tg:42'){
 await db.prepare('INSERT OR IGNORE INTO am_users(id,username) VALUES(?,?)').bind(scope,'Test researcher').run();
 return createDecision(db,scope,{campaign_id:'agg_'+campaign,reason:'Review official evidence',primary_evidence_url:'https://official.example.org/docs',decision_source:'official',time_budget_minutes:30,cost_ceiling_usd:0,realistic_expectations:'No guaranteed reward',expected_version:0,knowledge_cutoff_at:new Date().toISOString()});
}

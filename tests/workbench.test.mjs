import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,backup} from '../dist/model.js';
import {projects} from '../dist/catalog.js';
import {actionQueue,filterActions,setActionTask,actionPlan} from '../dist/workbench.js';
const now=new Date('2026-10-28T12:00:00Z'),p=projects[0];
const setup=()=>normalize({saved:[p.id]},projects);
test('queue derives from tracked active work and never mutates records',()=>{
 const s=setup(),before=JSON.stringify(s),items=actionQueue(projects,s,now);
 assert.deepEqual(items.map(a=>a.kind),['source','next']);
 assert.ok(items.every(a=>a.demo));assert.equal(JSON.stringify(s),before);
 s.records[p.id].status='completed';assert.deepEqual(actionQueue(projects,s,now),[]);
 s.records[p.id].status='archived';assert.deepEqual(actionQueue(projects,s,now),[]);
 s.saved=[];assert.deepEqual(actionQueue(projects,s,now),[]);
});
test('blocked and review tasks remain distinct, with only one next pending task',()=>{
 const s=setup();s.taskStates[p.id+':0']='failed';s.taskStates[p.id+':1']='verify';
 const items=actionQueue(projects,s,now);
 assert.equal(items.filter(a=>a.kind==='blocked').length,1);
 assert.equal(items.filter(a=>a.kind==='verify').length,1);
 assert.equal(items.filter(a=>a.kind==='next').length,1);
 assert.equal(items.find(a=>a.kind==='next').taskKey,p.id+':2');
 assert.equal(new Set(items.map(a=>a.id)).size,items.length);
});
test('calendar deadlines use dates without elapsed-hour DST errors and keep overdue work visible',()=>{
 const s=setup();s.records[p.id].due='2026-01-01';s.campaigns[p.id].deadline='2026-11-04';s.campaigns[p.id].snapshot='2026-11-05';
 const dates=actionQueue(projects,s,now).filter(a=>a.kind==='date');
 assert.equal(dates.length,2);assert.equal(dates[0].date,'2026-01-01');assert.equal(dates[1].days,7);
 s.campaigns[p.id].deadline='2026-02-30';assert.equal(actionQueue(projects,s,now).filter(a=>a.kind==='date').length,1);
});
test('source review is due after fourteen calendar days, not based on claimed campaign status',()=>{
 const s=setup(),c=s.campaigns[p.id];c.source='https://example.org/rules';c.status='live';c.checkedAt='2026-10-15';
 assert.equal(actionQueue(projects,s,now).filter(a=>a.kind==='source').length,0);
 c.checkedAt='2026-10-14';assert.equal(actionQueue(projects,s,now).filter(a=>a.kind==='source').length,1);
 c.checkedAt='';assert.equal(actionQueue(projects,s,now).filter(a=>a.kind==='source').length,1);
});
test('task updates are scoped to active tracked tasks and survive normal backup',()=>{
 const s=setup();setActionTask(s,projects,p.id+':0','done');assert.equal(s.done[p.id+':0'],true);
 assert.ok(!actionQueue(projects,s,now).some(a=>a.taskKey===p.id+':0'));
 setActionTask(s,projects,p.id+':0','verify');assert.equal(s.done[p.id+':0'],false);
 assert.equal(backup(JSON.stringify(s),projects).taskStates[p.id+':0'],'verify');
 setActionTask(s,projects,p.id+':0','pending');assert.equal(s.taskStates[p.id+':0'],undefined);
 for(const [key,status] of [[p.id+':99','done'],[projects[1].id+':0','done'],[p.id+':0','verified']])assert.throws(()=>setActionTask(s,projects,key,status));
 s.records[p.id].status='completed';assert.throws(()=>setActionTask(s,projects,p.id+':0','done'));
});
test('submission gaps and proof follow-up appear without pretending a submission was verified',()=>{
 const s=setup();s.hunts[p.id].brief.stage='submitted';
 assert.ok(actionQueue(projects,s,now).some(a=>a.action==='brief'));
 s.hunts[p.id].brief.submissionURL='https://example.org/submission';
 assert.ok(!actionQueue(projects,s,now).some(a=>a.action==='brief'));
 p.tasks.forEach((_,i)=>s.done[p.id+':'+i]=true);
 assert.ok(actionQueue(projects,s,now).some(a=>a.action==='proof'));
});
test('filters combine project, kind and case-insensitive search; plans include all selected results',()=>{
 const s=setup(),items=actionQueue(projects,s,now);
 const filtered=filterActions(items,{kind:'next',project:p.id,query:'PRISM'});assert.equal(filtered.length,1);
 assert.equal(filterActions(items,{project:'unknown'}).length,0);
 const plan=actionPlan(filtered,now);assert.match(plan,/1 actions/);assert.match(plan,/Fictional demonstration/);assert.match(plan,/not eligibility/);
 assert.ok(!plan.includes('Lengkapi sumber aturan'));
 const malicious={...filtered[0],title:'# forged\n<script>',project:{...p,name:'[hello](https://bad.test)'}};
 assert.ok(!actionPlan([malicious],now).includes('<script>'));
});

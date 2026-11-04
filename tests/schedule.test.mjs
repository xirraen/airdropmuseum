import test from 'node:test';
import assert from 'node:assert/strict';
import {dueSchedules} from '../src/schedule.mjs';
test('one UTC trigger preserves every independent cadence including simultaneous jobs',()=>{
 const counts={};
 for(let minute=0;minute<1440;minute++)for(const cron of dueSchedules({cron:'* * * * *',scheduledTime:Date.UTC(2026,10,4,0,minute)}))counts[cron]=(counts[cron]||0)+1;
 assert.deepEqual(counts,{'*/30 * * * *':48,'*/5 * * * *':288,'*/15 * * * *':96,'17 * * * *':24,'37 */6 * * *':4});
 assert.deepEqual(dueSchedules({cron:'* * * * *',scheduledTime:Date.UTC(2026,10,4,6,0)}),['*/30 * * * *','*/5 * * * *','*/15 * * * *']);
});
test('legacy cron and invalid events remain safely supported',()=>{
 assert.deepEqual(dueSchedules({cron:'*/15 * * * *'}),['*/15 * * * *']);
 assert.deepEqual(dueSchedules({cron:'* * * * *'}),[]);
 assert.deepEqual(dueSchedules({cron:'unknown'}),[]);
});

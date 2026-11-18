import test from 'node:test';
import assert from 'node:assert/strict';
import {PRIMARY_NAV,SIDE_NAV,ROUTES,resolveRoute,primaryRoute} from '../dist/navigation.js';
const expected=['home','explore','missions','workspace','profile'];
test('the mobile and desktop navigation expose exactly five core tabs',()=>{
 assert.deepEqual(PRIMARY_NAV.map(([id])=>id),expected);
 assert.deepEqual(SIDE_NAV,PRIMARY_NAV);
 assert.deepEqual(ROUTES,expected);
});
test('legacy routes no longer resolve and cannot become active',()=>{
 for(const value of ['hub','wallets','notifications','eligibility','calendar','archive','voices','referral','admin','decision-lab','unknown']){
  assert.equal(resolveRoute(value),'home');
  assert.equal(primaryRoute(value),'home');
 }
 for(const value of expected)assert.equal(resolveRoute(value),value);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRIMARY_NAV,SIDE_NAV,resolveRoute,primaryRoute} from '../dist/navigation.js';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/mini-ui.css',import.meta.url),'utf8');
const workerBuild=readFileSync(new URL('../scripts/build-worker.mjs',import.meta.url),'utf8');

test('reference UX exposes five persistent mobile destinations',()=>{
 assert.deepEqual(PRIMARY_NAV.map(x=>x[0]),['home','explore','missions','workspace','profile']);
 assert.equal(SIDE_NAV.some(([k])=>k==='eligibility'),true);
 assert.equal(SIDE_NAV.some(([k])=>k==='wallets'),true);
 assert.equal(SIDE_NAV.some(([k])=>k==='notifications'),true);
 for(const route of ['home','explore','missions','workspace','profile','eligibility','wallets','notifications']) assert.equal(resolveRoute(route),route);
 assert.equal(primaryRoute('eligibility'),'explore');
 assert.equal(primaryRoute('wallets'),'profile');
});
test('new CSS is actually loaded by default Worker shell',()=>{
 assert.match(html,/mini-ui\.css\?v=/);
 assert.match(html,/id="global-search"/);
 assert.match(html,/data-nav="notifications"/);
 assert.ok(workerBuild.includes("'mini-ui.css'"));
 assert.match(css,/\.amu-dashboard-shell\s*\{/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/safe-area-inset-bottom/);
});
test('all seven reference screens are connected to the existing app',()=>{
 for(const symbol of ['function miniCampaignCard','function dashboard','function eligibilityPage','function walletPage','function notificationsPage','function miniPortfolioOverview','function missions','function showDetail'])assert.ok(app.includes(symbol),symbol);
 assert.match(app,/workspace:portfolioBody/);
 assert.match(app,/wallets:walletPage/);
 assert.match(app,/notifications:notificationsPage/);
 assert.match(app,/eligibility:eligibilityPage/);
});
test('UX uses actual local research data and does not fabricate wallet eligibility',()=>{
 assert.match(app,/state\.saved\.includes\(p\.id\)/);
 assert.match(app,/Contoh fiktif/);
 assert.match(app,/Manual check/);
 assert.match(app,/Scan otomatis belum tersedia/);
 assert.match(app,/seed phrase/);
 assert.doesNotMatch(css,/\b245\b/);
});

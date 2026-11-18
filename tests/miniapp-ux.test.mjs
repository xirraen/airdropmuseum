import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PRIMARY_NAV,SIDE_NAV,resolveRoute} from '../dist/navigation.js';
const html=readFileSync('dist/index.html','utf8');
const app=readFileSync('dist/core-five.js','utf8');
const css=readFileSync('dist/core-five.css','utf8');
const builder=readFileSync('scripts/build-worker.mjs','utf8');

test('five mobile and desktop tabs remain the only navigable destinations',()=>{
 assert.deepEqual(PRIMARY_NAV.map(([id])=>id),['home','explore','missions','workspace','profile']);
 assert.deepEqual(SIDE_NAV,PRIMARY_NAV);
 for(const removed of ['wallets','hub','eligibility','notifications','voices','calendar','archive','referral','admin'])
  assert.equal(resolveRoute(removed),'home',removed);
 assert.match(html,/id="desktop-nav"/);assert.match(html,/id="mobile-nav"/);
});
test('new accessible CSS and runtime are both included in Worker assets',()=>{
 for(const name of ['core-five.css','core-five.js']){assert.ok(html.includes('/'+name+'?v='));assert.ok(builder.includes("'"+name+"'"));}
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/min-height:46px/);
});
test('all five tabs have functional renderers and no additional screen navigation',()=>{
 for(const symbol of ['function home','function explore','function quest','function portfolio','function profile','function saveProject','function openNote','function download','function loadCatalog'])assert.ok(app.includes(symbol),symbol);
 assert.match(app,/CORE_QUESTS/);
 assert.match(app,/\['home','Beranda'/);
 assert.match(app,/\['explore','Airdrop'/);
 assert.match(app,/\['missions','Quest'/);
 assert.match(app,/\['workspace','Portofolio'/);
 assert.match(app,/\['profile','Profil'/);
 assert.doesNotMatch(html,/admin\.html|decision-lab\.html|walletconnect-bundle\.js|trust-tab\.js/);
});
test('catalog failure is explicit and personal data remains exportable without fake rewards',()=>{
 assert.match(app,/\/api\/projects/);
 assert.match(app,/Tidak menampilkan kampanye contoh/);
 assert.match(app,/localStorage/);
 assert.match(app,/Ekspor data JSON/);
 assert.match(app,/seed phrase/);
 assert.match(app,/XP adalah progres lokal/);
});

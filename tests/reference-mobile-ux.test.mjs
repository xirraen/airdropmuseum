import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/mini-ui.css',import.meta.url),'utf8');
const agg=readFileSync(new URL('../dist/aggregator.html',import.meta.url),'utf8');

test('mobile search is present and submits to the existing filtered project directory',()=>{
 assert.match(html,/id="mobile-search-form"/);
 assert.match(html,/id="mobile-search"/);
 assert.match(html,/enterkeyhint="search"/);
 assert.match(js,/e\.target\.id!=='mobile-search-form'/);
 assert.match(js,/query=value;\$\('#search'\)\.value=query;updateGrid\(\)/);
});
test('reference layout has hero first, visible campaign list, compact stats and five mobile tabs',()=>{
 assert.match(css,/\.amu-dashboard-shell \.amu-hero\{order:0/);
 assert.match(css,/\.amu-dashboard-shell \.amu-campaign-grid\{order:3/);
 assert.match(css,/\.amu-dashboard-shell \.amu-stat-grid\{order:4/);
 assert.match(css,/\.amu-mobile-search>input/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(html,/id="mobile-nav"/);
 assert.match(agg,/class="agg-mobile-nav"/);
});
test('detail view exposes manual eligibility, progress, and functional existing actions',()=>{
 assert.match(js,/\['eligibility','Eligibility'\]/);
 assert.match(js,/data-nav="eligibility">Buka cek eligibility/);
 assert.match(js,/Manual check/);
 assert.match(js,/data-detail-tab=/);
 assert.match(js,/data-save=/);
 assert.match(css,/\.exhibit-detail-head/);
 assert.match(css,/\.amu-detail-eligibility/);
});
test('read-only wallet and fictional exhibit disclosures remain explicit',()=>{
 assert.match(js,/Contoh fiktif/);
 assert.match(js,/seed phrase/);
 assert.match(agg,/Tanpa auto-claim/);
 assert.match(html,/mini-ui\.css\?v=1\.4\.0/);
});

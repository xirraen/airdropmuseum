import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../dist/aggregator.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../dist/aggregator-modern.css',import.meta.url),'utf8');
const builder=readFileSync(new URL('../scripts/build-worker.mjs',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../scripts/runtime-checks.mjs',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');

test('aggregator retains all legacy feature IDs while adopting new visual design',()=>{
 for(const id of ['campaigns','filters','campaign-list','refresh','wallet-form','wallet-list','alerts','alert-form','next-action','quest-stats','next-action-list','campaign-detail','detail-body','status']){
  assert.match(html,new RegExp('id="'+id+'"'),'missing existing handler target '+id);
 }
 assert.match(html,/aggregator-modern\.css/);
 assert.match(html,/Jelajahi/);
 assert.match(html,/agg-hero-art/);
 assert.doesNotMatch(html,/Bukti untuk setiap peluang/);
});
test('Telegram aggregator has five persistent tabs and full-size safe-area handling',()=>{
 const navbar=/<nav class="agg-mobile-nav"([\s\S]*?)<\/nav>/.exec(html);
 assert.ok(navbar,'missing mobile navigation');
 assert.equal((navbar[1].match(/<a /g)||[]).length,5);
 for(const label of ['Beranda','Airdrop','Quest','Portofolio','Profil'])assert.match(navbar[1],new RegExp(label));
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/overflow-x:clip/);
 assert.match(css,/@media\(max-width:420px\)/);
});
test('Webpack-like Worker build bundles and serves blue UX on / and modern registry as a separate route',()=>{
 assert.ok(builder.includes("'aggregator-modern.css'"));
 assert.match(builder,/url\.pathname==='\/\'\?'\/index\.html'/);
 assert.match(runtime,/agg-mobile-nav/);
 // Generated Worker should follow the build-script mapping, not an older committed stale route.
 assert.match(worker,/url\.pathname==='\/\'\?'\/index\.html'/);
 assert.ok(worker.includes('/aggregator-modern.css'));
});

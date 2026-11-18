import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('production Worker default homepage is a five-tab Mini App with no extra pages',()=>{
 const script=readFileSync('scripts/build-worker.mjs','utf8');
 const html=readFileSync('dist/index.html','utf8');
 assert.ok(script.includes("url.pathname==='/'?'/index.html'"));
 assert.ok(script.includes("'core-five.js'"));
 assert.ok(script.includes("'core-five.css'"));
 assert.ok(!script.includes("'aggregator.html'"));
 assert.ok(!script.includes("'admin.html'"));
 assert.ok(html.includes('core-five.css'));
});

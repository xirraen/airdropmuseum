import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('production Worker homepage maps to responsive blue museum dashboard',()=>{
 const src=readFileSync(new URL('../scripts/build-worker.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 assert.ok(src.includes("url.pathname==='/'?'/index.html'"),'Default homepage is new dashboard');
 assert.ok(src.includes("'aggregator.html'"),'Aggregator remains available as its own route');
 assert.ok(src.includes("'/museum.html'?'/index.html'"),'Legacy museum alias preserved');
 assert.ok(html.includes('mini-ui.css'),'Blue responsive mini app stylesheet included');
});

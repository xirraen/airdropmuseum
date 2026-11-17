import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('bundled campaign catalog cannot populate production with fictional projects', async()=>{
 const {projects}=await import('../dist/catalog.js');
 assert.deepEqual(projects,[]);
});

test('public project API reads reviewed public D1 records instead of fixtures',()=>{
 const api=source('src/api.mjs');
 assert.match(api,/if\(path==='\/api\/projects'\)/);
 assert.match(api,/mode:'live'/);
 assert.match(api,/review_status NOT IN/);
 assert.match(api,/visibility/);
 assert.doesNotMatch(api,/catalogMode:'demo'|mode:'demo'/);
});

test('main UI uses live public sources and does not present fictional exhibits',()=>{
 const app=source('dist/app.js');
 assert.match(app,/liveCatalog\.splice/);
 assert.match(app,/source-['"]?\+p\.id/);
 assert.doesNotMatch(app,/Contoh fiktif|Fictional demonstration|projects as demos|demo'>/i);
});

test('private state sync retains IDs for published public campaigns',()=>{
 const api=source('src/api.mjs');
 assert.match(api,/id:'source-'\+r\.id/);
 assert.match(api,/backup\(await limitedText\(request\),liveProjects\)/);
});

import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../dist/admin.html',import.meta.url),'utf8');
const csrf='b'.repeat(64);

// A browser-only authenticated Admin simulation. RBAC/session enforcement stays
// covered by server tests; this does not impersonate a live Telegram account.
test('admin can onboard an inactive discovery source, enable it and queue a manual fetch',async({page})=>{
 const sources=[],writes=[];
 await page.route('**/admin.html',route=>route.fulfill({
  status:200,contentType:'text/html',body:html,
  headers:{'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"},
 }));
 await page.route('**/api/admin/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  let data,status=200;
  if(method!=='GET'){
   expect(request.headers()['x-csrf-token']).toBe(csrf);
   writes.push({path,method,body:request.postDataJSON()});
  }
  if(path==='/api/admin/session')data={role:'admin',csrf_token:csrf};
  else if(path==='/api/admin/overview')data={mode:'normal',campaigns:3,discovery_pending:0,discovery_sources:sources.length,conflicts_open:0,webhook_pending:0};
  else if(path==='/api/admin/discovery/sources'){
   if(method==='GET')data={sources};
   else if(method==='POST'){
    const body=request.postDataJSON();
    expect(body.enabled).toBe(false);
    sources.push({id:'source-1',...body,enabled:0,last_error:null,last_fetched_at:null,new_item_count:0});
    data={id:'source-1',created:true,enabled:false};
   }else status=405;
  }else if(path==='/api/admin/discovery/queue')data={items:[]};
  else if(path==='/api/admin/discovery/sources/source-1'&&method==='PUT'){
   const body=request.postDataJSON();
   sources[0].enabled=body.enabled?1:0;
   data={id:'source-1',updated:true,enabled:!!body.enabled};
  }else if(path==='/api/admin/discovery/sources/source-1/fetch'&&method==='POST'){
   expect(sources[0].enabled).toBe(1);
   data={id:'source-1',queued:1,not_modified:false};
  }else {status=404;data={error:'MOCK_ROUTE_NOT_FOUND'};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('/admin.html',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Discovery',exact:true}).click();
 await expect(page.getByText(/Belum ada sumber/)).toBeVisible();
 await page.getByRole('textbox',{name:'Nama sumber'}).fill('Official Feed');
 await page.getByRole('textbox',{name:'URL feed HTTPS'}).fill('https://news.example.org/rss');
 await page.getByRole('button',{name:'Tambahkan sumber (nonaktif)'}).click();
 await expect(page.getByRole('button',{name:'Aktifkan Official Feed'})).toBeVisible();
 expect(sources[0].enabled).toBe(0);
 await page.getByRole('button',{name:'Aktifkan Official Feed'}).click();
 await expect(page.locator('#confirm')).toBeVisible();
 await page.locator('#confirm-text').fill('KONFIRMASI');
 await page.locator('#confirm-submit').click();
 await expect(page.getByRole('button',{name:'Ambil feed Official Feed'})).toBeVisible();
 await page.getByRole('button',{name:'Ambil feed Official Feed'}).click();
 await page.locator('#confirm-text').fill('KONFIRMASI');
 await page.locator('#confirm-submit').click();
 await expect(page.getByText('Metadata masuk antrean: 1')).toBeVisible();
 expect(writes.map(w=>w.path)).toEqual([
  '/api/admin/discovery/sources',
  '/api/admin/discovery/sources/source-1',
  '/api/admin/discovery/sources/source-1/fetch'
 ]);
 expect(writes.some(w=>w.path.includes('/campaigns'))).toBe(false);
});

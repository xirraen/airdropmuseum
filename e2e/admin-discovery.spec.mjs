import {test,expect} from '@playwright/test';

test('legacy admin and auxiliary APIs reject GET and POST without publishing data',async({request})=>{
 const paths=['/admin','/admin.html','/api/admin/session','/api/admin/overview',
 '/api/discovery/sources','/api/trust/conflicts','/api/autopsy/decisions',
 '/api/platform/auth/telegram','/api/aggregator/admin/campaigns','/v1/events','/docs/api'];
 for(const path of paths){
  const read=await request.get(path);expect(read.status(),path).toBe(404);
  const write=await request.post(path,{data:{synthetic:true}});
  expect(write.status(),path).toBe(404);
 }
});
test('no admin UI assets are served and an old deep link resolves to Beranda',async({page,request})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 for(const path of ['/admin.js','/discovery.js','/trust.js','/walletconnect-bundle.js','/platform-bundle.js']){
  expect((await request.get(path)).status(),path).toBe(404);
 }
 await page.goto('/#wallets');
 await expect(page.locator('#page-title')).toHaveText('Beranda');
 await expect(page.locator('#desktop-nav button')).toHaveCount(5);
 await expect(page.locator('#mobile-nav button')).toHaveCount(5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});

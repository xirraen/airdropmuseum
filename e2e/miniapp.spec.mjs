import {test,expect} from '@playwright/test';

const projects=[
 {id:'fixture-alpha',name:'Alpha Research',chain:'Base',category:'L2',desc:'Cek sumber resmi proyek.',status:'confirmed',website:'https://example.org/alpha'},
 {id:'fixture-beta',name:'Beta Discovery',chain:'Ethereum',category:'DeFi',desc:'Tinjau ketentuan sumber.',status:'rumored',website:'https://example.org/beta'}
];
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
});
async function syntheticCatalog(page){
 await page.route('**/api/projects',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'live',projects})}));
}

test('only five tabs render on mobile and desktop with no JavaScript errors',async({page})=>{
 await syntheticCatalog(page);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#mobile-nav button')).toHaveCount(5);
 await expect(page.locator('#desktop-nav button')).toHaveCount(5);
 for(const route of ['home','explore','missions','workspace','profile']){
  await page.locator('[data-tab="'+route+'"]:visible').first().click();
  await expect(page).toHaveURL(new RegExp('#'+route+'$'));
  await expect(page.locator('#app')).not.toBeEmpty();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors).toEqual([]);
});
test('campaign search and chain filter work on the live server catalog',async({page})=>{
 await syntheticCatalog(page);await page.goto('/#explore');
 await expect(page.locator('.campaign')).toHaveCount(2);
 await page.locator('#campaign-search').fill('Alpha');
 await expect(page.locator('.campaign')).toHaveCount(1);
 await expect(page.locator('.campaign')).toContainText(['Alpha Research']);
 await page.locator('#campaign-search').fill('');
 await page.locator('#chain-filter').selectOption('Ethereum');
 await expect(page.locator('.campaign')).toHaveCount(1);
 await expect(page.locator('.campaign')).toContainText(['Beta Discovery']);
});
test('official source links are HTTPS and protected against opener access',async({page})=>{
 await syntheticCatalog(page);await page.goto('/#explore');
 await expect(page.locator('.campaign a[data-source]')).toHaveCount(2);
 for(const link of await page.locator('.campaign a[data-source]').all()){
  expect((await link.getAttribute('href')).startsWith('https://')).toBe(true);
  await expect(link).toHaveAttribute('target','_blank');
  await expect(link).toHaveAttribute('rel',/noopener noreferrer/);
 }
});
test('save a project, record a note, and retain it across reload',async({page})=>{
 await syntheticCatalog(page);await page.goto('/#explore');
 await page.locator('[data-save="fixture-alpha"]').click();
 await page.locator('[data-tab="workspace"]:visible').first().click();
 await expect(page.locator('.portfolio-row')).toContainText(['Alpha Research']);
 await page.locator('[data-note="fixture-alpha"]').click();
 await expect(page.locator('#note-dialog')).toBeVisible();
 await page.locator('#note-text').fill('Periksa dokumentasi resmi pada 18 November.');
 await page.locator('#note-form button[type="submit"]').click();
 await expect(page.locator('#note-dialog')).not.toBeVisible();
 await page.reload();
 await page.locator('[data-note="fixture-alpha"]').click();
 await expect(page.locator('#note-text')).toHaveValue('Periksa dokumentasi resmi pada 18 November.');
});
test('catalog failure shows an explicit error, never fake campaigns',async({page})=>{
 await page.route('**/api/projects',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"SERVICE_UNAVAILABLE"}'}));
 await page.goto('/#explore');
 await expect(page.locator('#app')).toContainText('Data tidak tersedia');
 await expect(page.locator('.campaign')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Muat ulang'})).toBeVisible();
});
test('profile settings persist and retired console routes deny direct access',async({page,request})=>{
 await page.goto('/#profile');
 await page.locator('#profile-form input[name="name"]').fill('Peneliti Uji');
 await page.locator('#profile-form button[type="submit"]').click();
 await page.reload();
 await expect(page.locator('#profile-form input[name="name"]')).toHaveValue('Peneliti Uji');
 for(const path of ['/admin.html','/aggregator.html','/decision-lab.html','/api/admin/overview','/api/autopsy/export']){
  expect((await request.get(path)).status()).toBe(404);
 }
});

import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 // Synthetic Telegram viewport only. This does not establish real-device verification.
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
});
test('navigation renders every personal screen without overflow or browser errors',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 for(const route of ['home','explore','workspace','missions','notifications','profile','wallets']){
  await page.locator(`[data-nav="${route}"]:visible`).first().click();
  await expect(page).toHaveURL(new RegExp('#'+route+'$'));
  await expect(page.locator('#app')).not.toBeEmpty();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors).toEqual([]);
});
test('campaign modal opens and closes and catalog navigation stays available',async({page})=>{
 await page.goto('/#explore',{waitUntil:'domcontentloaded'});
 await page.locator('[data-open]').first().click();
 await expect(page.locator('#detail')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#detail')).not.toBeVisible();
 await page.getByRole('link',{name:/Buka katalog airdrop/}).click();
 await expect(page).toHaveURL(/aggregator.html/);
 await expect(page.locator('body')).toContainText(/airdrop/i);
});
test('Decision Lab and admin deny unauthorized personal access',async({page,request})=>{
 await page.goto('/decision-lab.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('body')).toContainText(/login|masuk|telegram/i);
 expect((await request.get('/admin.html')).status()).toBe(403);
 expect((await request.get('/api/autopsy/export')).status()).toBe(401);
 expect((await request.get('/api/aggregator/portfolio')).status()).toBeGreaterThanOrEqual(400);
});

test('catalog backend failure is visible and never replaced with a successful empty response',async({page})=>{
 await page.route('**/api/v1/airdrops',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"SERVICE_UNAVAILABLE"}'}));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.getByRole('alert')).toContainText('Katalog publik tidak tersedia');
 await expect(page.getByRole('heading',{name:'Koleksi riset lokal'})).toBeVisible();
});

test('profile form persists a real local update across reload',async({page})=>{
 await page.goto('/#profile',{waitUntil:'domcontentloaded'});
 await page.locator('#profile-form input[name="name"]').fill('Peneliti Uji');
 await page.locator('#profile-form').getByRole('button',{name:'Simpan perubahan'}).click();
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#profile-form input[name="name"]')).toHaveValue('Peneliti Uji');
 await expect(page.getByRole('heading',{name:'Peneliti Uji',exact:true})).toBeVisible();
});

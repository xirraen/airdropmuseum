import {test,expect} from '@playwright/test';
const campaigns=[
 {id:'research-zenith',name:'Zenith Protocol',chain:'Base',category:'DeFi',status:'RUMORED',desc:'Follow official sources only.',website:'https://example.org/zenith',official_urls:['https://example.org/zenith','https://docs.example.org/zenith','javascript:alert(1)'],updatedAt:'2026-11-15T12:00:00.000Z',tasks:['Review official source','Document risks']},
 {id:'research-aurora',name:'Aurora Quest',chain:'Ethereum',category:'Community',status:'CONFIRMED',desc:'Check published eligibility.',website:'https://example.org/aurora',official_urls:['https://example.org/aurora'],updatedAt:'2026-11-17T09:00:00.000Z',tasks:['Read documentation']},
 {id:'research-helio',name:'Helio Research',chain:'Base',category:'DeFi',status:'SPECULATIVE',desc:'No reward is guaranteed.',website:'',official_urls:['http://insecure.example/','data:text/html,hi'],updatedAt:'',tasks:[]}
];
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:campaigns}}));
});
test('opens real campaign details with source provenance and closes without adding a new screen',async({page})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').filter({hasText:'Zenith Protocol'}).getByRole('button',{name:'Detail',exact:true}).click();
 const d=page.getByRole('dialog',{name:'Detail kampanye Zenith Protocol'});
 await expect(d).toBeVisible();
 await expect(d).toContainText('Rumor');
 await expect(d).toContainText('15 Nov 2026');
 await expect(d).toContainText('Follow official sources only.');
 await expect(d.locator('.campaign-source-link')).toHaveCount(2);
 await expect(d.locator('.campaign-source-link').first()).toHaveAttribute('href','https://example.org/zenith');
 await expect(d.locator('.campaign-source-link').last()).toHaveAttribute('href','https://docs.example.org/zenith');
 expect(await d.locator('a[href^="javascript:"]').count()).toBe(0);
 await d.getByRole('button',{name:'Tutup detail'}).click();
 await expect(d).toHaveCount(0);
 await expect(page).toHaveURL(/#explore$/);
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});
test('detail supports manual checklist, watchlist and local notes across reload',async({page})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').filter({hasText:'Zenith Protocol'}).getByRole('button',{name:'Detail',exact:true}).click();
 let d=page.getByRole('dialog',{name:'Detail kampanye Zenith Protocol'});
 await d.getByLabel('Review official source').check();
 await expect(d.locator('.campaign-detail-counter')).toHaveText('1/2');
 await d.getByRole('textbox',{name:'Catatan pribadi'}).fill('Reviewed official documentation 18 Nov.');
 await d.getByRole('button',{name:'Simpan catatan'}).click();
 await d.getByRole('button',{name:'Simpan ke watchlist'}).click();
 await expect(d.getByRole('button',{name:'Hapus dari watchlist'})).toBeVisible();
 await d.getByRole('button',{name:'Tutup',exact:true}).click();
 await page.reload();
 await page.getByRole('navigation').getByRole('button',{name:'Portofolio'}).click();
 await expect(page.locator('.watchlist-row')).toContainText('Zenith Protocol');
 await page.locator('.watchlist-row').getByRole('button',{name:'Detail',exact:true}).click();
 d=page.getByRole('dialog',{name:'Detail kampanye Zenith Protocol'});
 await expect(d.getByLabel('Review official source')).toBeChecked();
 await expect(d.getByRole('textbox',{name:'Catatan pribadi'})).toHaveValue('Reviewed official documentation 18 Nov.');
 await d.getByRole('button',{name:'Hapus dari watchlist'}).click();
 await expect(d.getByRole('button',{name:'Simpan ke watchlist'})).toBeVisible();
});
test('Explore status filter and latest-update sort use real API fields',async({page})=>{
 await page.goto('/#explore');
 const filter=page.getByRole('combobox',{name:'Filter status kampanye'});
 await filter.selectOption('CONFIRMED');
 await expect(page.locator('.campaign-card')).toHaveCount(1);
 await expect(page.locator('.campaign-card')).toContainText('Aurora Quest');
 await filter.selectOption('all');
 await page.getByRole('combobox',{name:'Urutkan kampanye'}).selectOption('updated');
 await expect(page.locator('.campaign-card').first()).toContainText('Aurora Quest');
 await page.getByRole('combobox',{name:'Filter status kampanye'}).selectOption('SPECULATIVE');
 await page.locator('.campaign-card').getByRole('button',{name:'Detail',exact:true}).click();
 const d=page.getByRole('dialog',{name:'Detail kampanye Helio Research'});
 await expect(d).toContainText('Belum dicatat');
 await expect(d).toContainText('Tidak ada tautan HTTPS resmi');
 await expect(d.locator('a')).toHaveCount(0);
});
test('offline catalog is explicitly labeled cached, preserves actual data and can recover',async({page})=>{
 await page.goto('/#home');
 await expect(page.locator('.campaign-card')).toHaveCount(3);
 await page.unroute('**/api/projects');
 await page.route('**/api/projects',r=>r.abort());
 await page.reload();
 await expect(page.locator('.catalog-cache-warning')).toBeVisible();
 await expect(page.locator('.catalog-cache-warning')).toContainText('Katalog offline');
 await expect(page.locator('.campaign-card')).toHaveCount(3);
 await expect(page.locator('.campaign-card').first()).toContainText('Zenith Protocol');
 await page.unroute('**/api/projects');
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:campaigns}}));
 await page.locator('.catalog-cache-warning').getByRole('button',{name:'Perbarui'}).click();
 await expect(page.locator('.catalog-cache-warning')).toHaveCount(0);
 await expect(page.locator('.campaign-card')).toHaveCount(3);
});
test('details stay inside five tabs, retired screens and mobile layout remain clean',async({page,request})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').first().getByRole('button',{name:'Detail',exact:true}).click();
 const bleed=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(bleed).toBeLessThanOrEqual(1);
 await page.keyboard.press('Escape');
 await expect(page.locator('.campaign-detail-dialog')).toHaveCount(0);
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
 for(const path of ['/admin.html','/wallet.html','/decision-lab.html','/api/admin/dashboard'])
  expect((await request.get(path)).status(),path).toBe(410);
});

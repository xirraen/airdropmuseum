import {test,expect} from '@playwright/test';
const campaigns=[
 {id:'research-zenith',name:'Zenith Protocol',chain:'Base',category:'DeFi',status:'RUMORED',desc:'Review source before any action.',website:'https://example.org/zenith',tasks:['Review source','Document risks']},
 {id:'research-aurora',name:'Aurora Quest',chain:'Ethereum',category:'Social',status:'CONFIRMED',desc:'Track the campaign source.',website:'https://example.org/aurora',tasks:['Read documentation']},
 {id:'research-helio',name:'Helio Research',chain:'Base',category:'DeFi',status:'SPECULATIVE',desc:'No reward is guaranteed.',website:'https://example.org/helio',tasks:[]}
];
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:campaigns}}));
});
test('quest-inspired dashboard uses real campaign cards and exactly five screens',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('.hero.quest-hero')).toBeVisible();
 await expect(page.locator('.stats .stat-card')).toHaveCount(4);
 await expect(page.locator('.campaign-cover')).toHaveCount(3);
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
 await expect(page.locator('.campaign-card').first()).toContainText('Zenith Protocol');
 await expect(page.locator('.campaign-card').first()).toContainText('Rumor');
 await expect(page.locator('body')).not.toContainText('1000 participants');
 await expect(page.locator('body')).not.toContainText('Claim now');
 expect(errors).toEqual([]);
 const background=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);
 expect(background).not.toBe('rgb(255, 255, 255)');
});
test('discovery filters, view switch, and watchlist are interactive',async({page})=>{
 await page.goto('/#explore');
 await expect(page.locator('.campaign-card')).toHaveCount(3);
 await page.getByRole('searchbox',{name:'Cari nama kampanye atau jaringan'}).fill('Aurora');
 await expect(page.locator('.campaign-card')).toHaveCount(1);
 await page.getByRole('searchbox',{name:'Cari nama kampanye atau jaringan'}).fill('');
 await page.getByRole('button',{name:'Base',exact:true}).first().click();
 await expect(page.locator('.campaign-card')).toHaveCount(2);
 await page.getByRole('button',{name:'Semua jaringan'}).click();
 await page.getByLabel('Urutkan kampanye').selectOption('az');
 await expect(page.locator('.campaign-card').first()).toContainText('Aurora Quest');
 await page.getByRole('button',{name:'Daftar'}).click();
 await expect(page.locator('.grid-list-view')).toBeVisible();
 await page.locator('.campaign-card').first().getByRole('button',{name:'Simpan ke portofolio'}).click();
 await page.getByRole('button',{name:'Watchlist',exact:true}).click();
 await expect(page.locator('.campaign-card')).toHaveCount(1);
 await expect(page.locator('.campaign-card')).toContainText(['Aurora Quest']);
});
test('quest tasks and personal space research XP persist without blockchain actions',async({page})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').filter({hasText:'Zenith Protocol'}).getByRole('button',{name:'Tugas'}).click();
 await expect(page).toHaveURL(/#missions$/);
 await page.getByLabel('Review source',{exact:true}).check();
 await page.reload();
 await expect(page.getByLabel('Review source',{exact:true})).toBeChecked();
 await page.getByRole('navigation').getByRole('button',{name:'Profil'}).click();
 await expect(page.locator('.identity-stats')).toContainText('Research XP');
 await expect(page.locator('.identity-stats')).toContainText('10');
 await expect(page.locator('body')).toContainText('No wallet required');
});
test('mobile layout has no horizontal overflow and core API retirement remains enforced',async({page,request})=>{
 await page.goto('/#explore');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 const routes=['/admin','/admin.html','/aggregator.html','/decision-lab.html','/app.js','/api/admin/dashboard'];
 for(const route of routes)expect((await request.get(route)).status(),route).toBe(410);
});

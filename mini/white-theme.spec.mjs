import {test,expect} from '@playwright/test';
const projects=[
 {id:'white-quest-alpha',name:'Alpha Quest Research',chain:'Base',category:'DeFi',status:'CONFIRMED',desc:'Check official information.',website:'https://example.org/alpha',tasks:['Check source']},
 {id:'white-quest-beta',name:'Beta Research',chain:'Ethereum',category:'Social',status:'RUMORED',desc:'Research independently.',website:'https://example.org/beta',tasks:[]}
];
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects}}));
});
test('original white-blue style is restored without reverting the five-tab experience',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.hero.quest-hero')).toBeVisible();
 await expect(page.locator('.campaign-cover')).toHaveCount(2);
 await expect(page.locator('nav button[data-route]')).toHaveCount(5);
 const styles=await page.evaluate(()=>({
  scheme:getComputedStyle(document.documentElement).colorScheme,
  body:getComputedStyle(document.body).backgroundColor,
  card:getComputedStyle(document.querySelector('.campaign-card')).backgroundColor,
  nav:getComputedStyle(document.querySelector('.bottom-nav')).backgroundColor,
  bg:getComputedStyle(document.documentElement).backgroundColor
 }));
 expect(styles.scheme).toBe('light');
 expect(styles.card).toBe('rgb(255, 255, 255)');
 expect(styles.nav).not.toBe('rgb(15, 17, 28)');
 expect(styles.bg).toBe('rgb(245, 247, 251)');
});
test('new Explore filters, watchlist and research checklist continue working on white theme',async({page})=>{
 await page.goto('/#explore');
 await page.getByRole('searchbox',{name:'Cari nama kampanye atau jaringan'}).fill('Alpha');
 await expect(page.locator('.campaign-card')).toHaveCount(1);
 await page.locator('.campaign-card').getByRole('button',{name:'Simpan ke portofolio'}).click();
 await page.getByRole('button',{name:'Watchlist',exact:true}).click();
 await expect(page.locator('.campaign-card')).toHaveCount(1);
 await page.getByRole('navigation').getByRole('button',{name:'Quest'}).click();
 await page.getByLabel('Check source').check();
 await page.getByRole('navigation').getByRole('button',{name:'Profil'}).click();
 await expect(page.locator('.identity-stats')).toContainText('Research XP');
 await expect(page.locator('.identity-stats')).toContainText('10');
});
test('removed screens and admin endpoints remain retired',async({page,request})=>{
 await page.goto('/#admin');
 await expect(page).toHaveURL(/#home$/);
 for(const path of ['/admin.html','/aggregator.html','/decision-lab.html','/api/admin/dashboard','/walletconnect-bundle.js'])
  expect((await request.get(path)).status(),path).toBe(410);
 const width=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(width).toBeLessThanOrEqual(1);
});

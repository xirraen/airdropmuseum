import {test,expect} from '@playwright/test';
const projects=[
 {id:'museum-alpha',name:'Alpha Protocol',chain:'Base',category:'DeFi',status:'CONFIRMED',website:'https://example.org',desc:'Check official campaign details.',tasks:['Review official source']},
 {id:'museum-beta',name:'Beta Explorer',chain:'Ethereum',category:'Quest',status:'RUMORED',website:'https://example.org',desc:'Review historical sources.',tasks:[]}
];
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects}}));
});
test('historical hero, compact cards and original blue paper visual render',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.legacy-hero')).toBeVisible();
 await expect(page.locator('.legacy-parachute')).toBeVisible();
 await expect(page.locator('.legacy-crate')).toBeVisible();
 await expect(page.locator('.legacy-stats .stat-card')).toHaveCount(4);
 await expect(page.locator('.campaign-card')).toHaveCount(2);
 await expect(page.locator('.campaign-card .campaign-cover').first()).toBeHidden();
 const values=await page.evaluate(()=>({
  paper:getComputedStyle(document.documentElement).backgroundColor,
  card:getComputedStyle(document.querySelector('.campaign-card')).backgroundColor
 }));
 expect(values.paper).toBe('rgb(245, 248, 253)');
 expect(values.card).toBe('rgb(255, 255, 255)');
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});
test('current five-tab features still work using original compact visual controls',async({page})=>{
 await page.goto('/');
 await page.getByRole('navigation').getByRole('button',{name:'Airdrop'}).click();
 await expect(page.locator('.campaign-card')).toHaveCount(2);
 await page.getByRole('searchbox',{name:'Cari nama kampanye atau jaringan'}).fill('Alpha');
 await expect(page.locator('.campaign-card')).toHaveCount(1);
 await page.locator('.campaign-card').getByRole('button',{name:'Simpan ke portofolio'}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Quest'}).click();
 await page.getByLabel('Review official source').check();
 await page.getByRole('navigation').getByRole('button',{name:'Portofolio'}).click();
 await expect(page.locator('.watchlist-row')).toContainText('Alpha Protocol');
 await page.getByRole('navigation').getByRole('button',{name:'Profil'}).click();
 await expect(page.locator('.identity-stats')).toContainText('Research XP');
});
test('old search header is functional, not a restored legacy feature',async({page,isMobile})=>{
 await page.goto('/');
 const search=page.getByRole('searchbox',{name:isMobile?'Cari proyek atau jaringan':'Cari airdrop dan proyek'});
 await expect(search).toBeVisible();
 await search.fill('Beta');
 await search.press('Enter');
 await expect(page).toHaveURL(/#explore$/);
 await expect(page.locator('.campaign-card')).toHaveCount(1);
 await expect(page.locator('.campaign-card')).toContainText('Beta Explorer');
});
test('retired routes remain blocked, and viewport has no horizontal overflow',async({page,request})=>{
 await page.goto('/#admin');
 await expect(page).toHaveURL(/#home$/);
 for(const pathname of ['/admin','/aggregator.html','/decision-lab.html','/api/admin/dashboard','/app.js']){
  const r=await request.get(pathname);
  expect(r.status(),pathname).toBe(410);
 }
 const bleed=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(bleed).toBeLessThanOrEqual(1);
});

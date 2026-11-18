import {test,expect} from '@playwright/test';
test('only five tabs remain and saved research survives reload',async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{projects:[{id:'campaign-one',name:'Campaign One',tasks:['Review source']}]}}));
 await page.goto('/#wallets');
 await expect(page).toHaveURL(/#home$/);
 const nav=page.getByRole('navigation');
 await expect(nav.getByRole('button')).toHaveCount(5);
 await nav.getByText('Airdrop',{exact:true}).click();
 await page.getByRole('button',{name:'Simpan ke portofolio'}).click();
 await nav.getByText('Quest').click();
 await page.getByLabel('Review source').check();
 await page.reload();
 await expect(page.getByLabel('Review source')).toBeChecked();
 await nav.getByText('Portofolio').click();await expect(page.getByText('Campaign One')).toBeVisible();
 await nav.getByText('Profil').click();await page.getByLabel('Nama profil di perangkat ini').fill('Peneliti');await page.getByText('Simpan nama').click();
 await page.reload();await expect(page.getByLabel('Nama profil di perangkat ini')).toHaveValue('Peneliti');
 for(const path of ['/admin','/admin.html','/api/admin/dashboard','/aggregator.html','/portfolio.html','/trust.html','/discovery.html','/decision-lab.html','/app.js'])expect((await page.request.get(path)).status()).toBe(410);
});

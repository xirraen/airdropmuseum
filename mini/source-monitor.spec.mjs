import {test,expect} from '@playwright/test';
const historical='2026-11-16T00:00:00.000Z';
const campaign={id:'campaign-alpha',name:'Alpha Protocol',chain:'Base',category:'DeFi',status:'CONFIRMED',
 website:'https://docs.example.org/alpha',tasks:['Review documents']};
const baseEvents=[
 {id:'evt-a',campaignId:'campaign-alpha',name:'Alpha Protocol',timestamp:historical,
  sourceUrl:'https://docs.example.org/alpha',sourceType:'official_docs',type:'changed',
  description:'Isi sumber berubah; status atau kelayakan belum diverifikasi ulang.'},
 {id:'evt-b',campaignId:'campaign-alpha',name:'Alpha Protocol',timestamp:'2026-11-17T00:00:00.000Z',
  sourceUrl:'https://docs.example.org/help',sourceType:'official_docs',type:'unavailable',
  description:'Sumber tidak dapat dibaca pada pemeriksaan ini.'}
];
let events;
test.beforeEach(async({page})=>{
 events=structuredClone(baseEvents);
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:[campaign]}}));
 await page.route('**/api/source-activity',r=>r.fulfill({json:{checkedAt:new Date().toISOString(),events}}));
});
test('real source evidence appears in existing portfolio and never asserts reward eligibility',async({page})=>{
 await page.goto('/#workspace');
 const section=page.locator('#campaign-activity');
 await expect(section.getByRole('heading',{name:'Aktivitas sumber resmi'})).toBeVisible();
 await expect(section.locator('.source-event')).toHaveCount(2);
 await expect(section.locator('.source-event').first()).toContainText('Sumber berubah');
 await expect(section.locator('.source-event').last()).toContainText('Sumber tidak tersedia');
 await expect(section).toContainText('bukan konfirmasi eligibility atau reward');
 await expect(section.getByRole('link',{name:'Buka sumber tercatat'}).first()).toHaveAttribute('href','https://docs.example.org/alpha');
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
 await section.getByRole('button',{name:'Perubahan'}).click();
 await expect(page.locator('#campaign-activity .source-event')).toHaveCount(1);
 await page.locator('#campaign-activity').getByRole('button',{name:'Sumber gagal'}).click();
 await expect(page.locator('#campaign-activity .source-event')).toHaveCount(1);
 await expect(page.locator('#campaign-activity .source-event')).toContainText('Sumber tidak tersedia');
});
test('opt-in does not alert for historical events; new watched changes get a readable badge',async({page})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').getByRole('button',{name:'Simpan ke portofolio'}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Portofolio'}).click();
 const monitor=page.locator('#campaign-activity');
 await monitor.getByRole('button',{name:'Aktifkan notifikasi'}).click();
 await expect(monitor.getByRole('button',{name:'Matikan notifikasi'})).toBeVisible();
 await expect(page.locator('nav.bottom-nav .source-unread-badge')).toHaveCount(0);
 await page.waitForTimeout(75);
 events=[{...baseEvents[0],id:'evt-new',timestamp:new Date().toISOString()},...baseEvents];
 await monitor.getByRole('button',{name:'Perbarui aktivitas'}).click();
 await expect(page.locator('nav.bottom-nav .source-unread-badge')).toHaveText('1');
 await expect(monitor).toContainText('1 pembaruan watchlist belum dibaca');
 await monitor.getByRole('button',{name:'Tandai dibaca'}).click();
 await expect(page.locator('nav.bottom-nav .source-unread-badge')).toHaveCount(0);
 await page.reload();
 await expect(monitor.getByRole('button',{name:'Matikan notifikasi'})).toBeVisible();
 await expect(page.locator('nav.bottom-nav .source-unread-badge')).toHaveCount(0);
});
test('source unavailable events never become a change notification',async({page})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').getByRole('button',{name:'Simpan ke portofolio'}).click();
 await page.getByRole('navigation').getByRole('button',{name:'Portofolio'}).click();
 const monitor=page.locator('#campaign-activity');
 await monitor.getByRole('button',{name:'Aktifkan notifikasi'}).click();
 await page.waitForTimeout(50);
 events=[{...baseEvents[1],id:'evt-outage-new',timestamp:new Date().toISOString()},...baseEvents];
 await monitor.getByRole('button',{name:'Perbarui aktivitas'}).click();
 await expect(page.locator('#campaign-activity .source-event')).toHaveCount(3);
 await expect(page.locator('nav.bottom-nav .source-unread-badge')).toHaveCount(0);
});
test('backend failure is visible, retry restores activity, and watchlist remains intact',async({page})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').getByRole('button',{name:'Simpan ke portofolio'}).click();
 await page.unroute('**/api/source-activity');
 await page.route('**/api/source-activity',r=>r.fulfill({status:503,json:{error:'SERVICE_UNAVAILABLE'}}));
 await page.getByRole('navigation').getByRole('button',{name:'Portofolio'}).click();
 await page.locator('#campaign-activity').getByRole('button',{name:'Perbarui aktivitas'}).click();
 await expect(page.locator('.source-activity-error')).toBeVisible();
 await expect(page.locator('.watchlist-row')).toContainText('Alpha Protocol');
 await page.unroute('**/api/source-activity');
 await page.route('**/api/source-activity',r=>r.fulfill({json:{events:baseEvents,checkedAt:new Date().toISOString()}}));
 await page.locator('#campaign-activity').getByRole('button',{name:'Perbarui aktivitas'}).click();
 await expect(page.locator('.source-activity-error')).toHaveCount(0);
 await expect(page.locator('#campaign-activity .source-event')).toHaveCount(2);
});
test('home activity shortcut returns to existing portfolio instead of creating a hidden screen',async({page})=>{
 await page.goto('/#home');
 await expect(page.locator('.legacy-right-rail')).toContainText('Pembaruan Sumber');
 await page.getByRole('button',{name:'Lihat aktivitas'}).click();
 await expect(page).toHaveURL(/#workspace$/);
 await expect(page.locator('#campaign-activity')).toBeVisible();
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
});

test('source recovery has a distinct visible status and does not appear as a failure',async({page})=>{
 events=[{...baseEvents[0],id:'evt-recovered',type:'restored',
  description:'Sumber kembali dapat dibaca setelah gangguan; aturan dan kelayakan tetap perlu diperiksa.'},...baseEvents];
 await page.goto('/#workspace');
 const activity=page.locator('#campaign-activity');
 await expect(activity.locator('.source-event-restored')).toContainText('Sumber kembali tersedia');
 await activity.getByRole('button',{name:'Sumber gagal'}).click();
 await expect(activity.locator('.source-event-restored')).toHaveCount(0);
 await expect(activity.locator('.source-event-unavailable')).toHaveCount(1);
 await activity.getByRole('button',{name:'Semua aktivitas'}).click();
 await expect(activity.locator('.source-event-restored')).toHaveCount(1);
});

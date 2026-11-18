import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const sample=[
 {id:'base-research',name:'Base Research',chain:'Base',category:'DeFi',status:'CONFIRMED',website:'https://docs.example.org/base',official_urls:['https://docs.example.org/base'],lastVerifiedAt:'2026-07-01T00:00:00Z',updatedAt:'2026-11-17T10:00:00Z',riskFlags:['source_changed_review_required'],claimDeadlineAt:'2026-12-01T00:00:00Z',tasks:['Review official source','Check eligibility rules']},
 {id:'old-research',name:'Old Research',chain:'Solana',category:'Retroactive',status:'EXPIRED',website:'https://docs.example.org/old',official_urls:['https://docs.example.org/old','https://example.org/old'],lastVerifiedAt:'2026-09-01T00:00:00Z',updatedAt:'2026-10-05T12:00:00Z',riskFlags:[],tasks:['Review historical date']},
 {id:'new-research',name:'New Research',chain:'Off-chain',category:'Points',status:'SPECULATIVE',website:'',official_urls:[],lastVerifiedAt:'',updatedAt:'2026-11-18T00:00:00Z',riskFlags:[],tasks:['Manual research']},
 {id:'fourth-research',name:'Fourth Research',chain:'Base',category:'NFT',status:'RUMORED',website:'',official_urls:[],lastVerifiedAt:'',updatedAt:'',riskFlags:[],tasks:[]}
];
test.beforeEach(async({page})=>{
 await page.route('https://telegram.org/**',r=>r.fulfill({contentType:'text/javascript',body:''}));
 await page.route('**/api/projects',r=>r.fulfill({json:{mode:'live',projects:sample}}));
 await page.route('**/api/source-activity',r=>r.fulfill({json:{events:[],checkedAt:'2026-11-18T10:00:00Z'}}));
});
test('live source-change risk and verification age appear on cards and detail without eligibility claims',async({page})=>{
 await page.goto('/#explore');
 const card=page.locator('.campaign-card').filter({hasText:'Base Research'});
 await expect(card).toContainText('Perubahan sumber');
 await card.getByRole('button',{name:'Detail',exact:true}).click();
 const d=page.getByRole('dialog',{name:'Detail kampanye Base Research'});
 await expect(d).toBeVisible();
 await expect(d.locator('.campaign-evidence-note')).toContainText('Perubahan sumber perlu ditinjau');
 await expect(d.locator('.campaign-evidence-note')).toContainText('Terakhir diverifikasi: 1 Jul 2026');
 await expect(d.locator('.campaign-evidence-note')).toContainText('Tenggat tercatat: 1 Des 2026');
 await expect(d.locator('.campaign-evidence-note')).toContainText('Jangan menganggap syarat tetap sama');
 await d.getByRole('button',{name:'Tutup detail'}).click();
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});
test('compare two actual campaigns in modal with source provenance and expiry, then export CSV',async({page})=>{
 await page.goto('/#explore');
 await page.locator('.campaign-card').filter({hasText:'Base Research'}).getByRole('button',{name:'Bandingkan'}).click();
 await expect(page.locator('.campaign-compare-tray')).toContainText('1 dari 3');
 await expect(page.locator('.campaign-compare-tray').getByRole('button',{name:'Bandingkan'})).toBeDisabled();
 await page.locator('.campaign-card').filter({hasText:'Old Research'}).getByRole('button',{name:'Bandingkan'}).click();
 await expect(page.locator('.campaign-compare-tray')).toContainText('2 dari 3');
 await page.locator('.campaign-compare-tray').getByRole('button',{name:'Bandingkan'}).click();
 const d=page.getByRole('dialog',{name:'Perbandingan kampanye'});
 await expect(d).toBeVisible();
 await expect(d).toContainText('Base Research');
 await expect(d).toContainText('Old Research');
 await expect(d).toContainText('Perubahan sumber perlu ditinjau');
 await expect(d).toContainText('Berakhir');
 await expect(d).toContainText('1 Des 2026');
 await expect(d).toContainText('tidak berarti wallet Anda memenuhi persyaratan');
 const promise=page.waitForEvent('download');
 await d.getByRole('button',{name:'Ekspor CSV'}).click();
 const download=await promise;
 expect(download.suggestedFilename()).toMatch(/^airdrop-museum-perbandingan-\d{4}-\d{2}-\d{2}\.csv$/);
 const data=await readFile(await download.path(),'utf8');
 expect(data).toContain('Base Research');
 expect(data).toContain('Old Research');
 expect(data).toContain('Perubahan sumber perlu tinjau');
 expect(data).not.toContain('PRIVATE_KEY');
 await page.keyboard.press('Escape');
 await expect(d).toHaveCount(0);
 await expect(page).toHaveURL(/#explore$/);
});
test('comparison limits to three, can deselect and clear; mobile remains scroll-safe',async({page})=>{
 await page.goto('/#explore');
 for(const name of ['Base Research','Old Research','New Research'])
  await page.locator('.campaign-card').filter({hasText:name}).getByRole('button',{name:'Bandingkan'}).click();
 await expect(page.locator('.campaign-compare-tray')).toContainText('3 dari 3');
 await page.locator('.campaign-card').filter({hasText:'Fourth Research'}).getByRole('button',{name:'Bandingkan'}).click();
 await expect(page.locator('.campaign-compare-tray')).toContainText('3 dari 3');
 await page.locator('.campaign-card').filter({hasText:'Base Research'}).getByRole('button',{name:'Dipilih'}).click();
 await expect(page.locator('.campaign-compare-tray')).toContainText('2 dari 3');
 await page.locator('.campaign-compare-tray').getByRole('button',{name:'Bandingkan'}).click();
 await expect(page.getByRole('dialog',{name:'Perbandingan kampanye'})).toBeVisible();
 const metrics=await page.evaluate(()=>({
  mainOverflow:document.documentElement.scrollWidth-innerWidth,
  tableScroll:document.querySelector('.campaign-compare-scroll').scrollWidth-document.querySelector('.campaign-compare-scroll').clientWidth
 }));
 expect(metrics.mainOverflow).toBeLessThanOrEqual(1);
 expect(metrics.tableScroll).toBeGreaterThanOrEqual(0);
 await page.getByRole('dialog',{name:'Perbandingan kampanye'}).getByRole('button',{name:'Tutup',exact:true}).click();
 await page.locator('.campaign-compare-tray').getByRole('button',{name:'Bersihkan'}).click();
 await expect(page.locator('.campaign-compare-tray')).toHaveCount(0);
 await expect(page.getByRole('navigation').getByRole('button')).toHaveCount(5);
});
test('unknown verification is shown as missing, not automatically safe',async({page})=>{
 await page.goto('/#explore');
 const card=page.locator('.campaign-card').filter({hasText:'New Research'});
 await expect(card).toContainText('Belum ada verifikasi');
 await card.getByRole('button',{name:'Detail',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Detail kampanye New Research'})).toContainText('Waktu verifikasi belum dicatat');
});

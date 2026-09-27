import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { login, TapCounter } from './helpers';

const SHOTS = join(process.cwd(), '..', '..', 'docs', 'poc', 'renders');
mkdirSync(SHOTS, { recursive: true });

for (const id of ['case-a', 'case-b', 'case-c']) {
  test(`${id}: paste log → 3 plans → PDF within 5 taps (390px)`, async ({ page }) => {
    await login(page, 'sales@example.com');
    const taps = new TapCounter(page);
    await taps.tap(page.getByTestId('new-case')); // 1
    await taps.tap(page.getByTestId(`sample-${id}`)); // 2 (fills the form and pastes the sample log)
    await taps.tap(page.getByTestId('create-plans')); // 3
    await expect(page.getByTestId('plan-MIN')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('plan-BALANCED')).toBeVisible();
    await expect(page.getByTestId('plan-MAX')).toBeVisible();
    await expect(page.getByTestId('compliance')).toContainText('OK');
    if (id === 'case-a') await page.screenshot({ path: join(SHOTS, 'ui-result-390.png'), fullPage: true });
    const download = page.waitForEvent('download');
    await taps.tap(page.getByTestId('pdf-summary')); // 4
    const d = await download;
    const path = await d.path();
    expect(path).toBeTruthy();
    const { readFileSync } = await import('node:fs');
    const buf = readFileSync(path!);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    expect(buf.includes(Buffer.from('NotoSerifJP'))).toBe(true);
    expect(taps.n).toBeLessThanOrEqual(5);
  });
}

test('customer documents never contain insurer / product names from the log', async ({ page, request }) => {
  await login(page, 'sales@example.com');
  await page.getByTestId('new-case').click();
  await page.getByTestId('sample-case-c').click();
  await page.getByTestId('create-plans').click();
  await expect(page.getByTestId('plan-MIN')).toBeVisible({ timeout: 60_000 });
  const id = page.url().split('/cases/')[1]!.split('?')[0];
  for (const type of ['summary', 'design', 'slides', 'memo']) {
    const res = await page.request.get(`/api/cases/${id}/doc?type=${type}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('〇〇生命');
    expect(html).not.toContain('△△');
    expect(html).not.toMatch(/節税になります|税金が減る/);
    if (type !== 'memo') expect(html).toContain('通期での節税効果はありません');
  }
  void request;
});

test('assumed values can be corrected and only Step 3+ is re-run', async ({ page }) => {
  await login(page, 'sales@example.com');
  await page.getByTestId('new-case').click();
  await page.getByTestId('sample-case-b').click();
  // Clear an optional value so it becomes an assumption
  await page.getByText('詳しい情報（任意・分かる範囲で）').click();
  await page.locator('input[name="officer.legalHeirs"]').fill('');
  await page.getByTestId('create-plans').click();
  await expect(page.getByTestId('assumptions')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('assumptions').getByRole('button', { name: /法定相続人数/ }).click();
  await page.locator('#assume-value').fill('3');
  const t = Date.now();
  await page.getByRole('button', { name: '確定して再計算' }).click();
  await expect(page.getByText(/再計算しました/)).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - t).toBeLessThan(10_000);
  await expect(page.getByTestId('assumptions')).toHaveCount(0);
});

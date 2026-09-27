import { expect, test } from '@playwright/test';
import { login } from './helpers';

async function setApproval(page: import('@playwright/test').Page, on: boolean) {
  await login(page, 'admin@example.com');
  const res = await page.request.put('/api/admin/knowledge/presentation', { data: { value: { requireApproval: on } } });
  expect(res.ok()).toBe(true);
  const pub = await page.request.post('/api/admin/publish', { data: { label: `承認必須=${on}（e2e）` } });
  expect(pub.ok()).toBe(true);
  await page.request.post('/api/auth/logout');
}

test('approval required: customer outputs locked until a manager approves', async ({ page }) => {
  await setApproval(page, true);
  try {
    await login(page, 'sales@example.com');
    await page.getByTestId('new-case').click();
    await page.getByTestId('sample-case-b').click();
    await page.getByTestId('create-plans').click();
    await expect(page.getByTestId('plan-MIN')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('顧客提示前にマネージャーの承認が必要です').first()).toBeVisible();
    const id = page.url().split('/cases/')[1]!.split('?')[0];
    expect((await page.request.get(`/api/cases/${id}/pdf?type=summary`)).status()).toBe(423);
    expect((await page.request.get(`/api/cases/${id}/pdf?type=memo`)).status()).toBe(200); // internal memo is not gated
    expect((await page.request.post(`/api/cases/${id}/approve`)).status()).toBe(403); // sales cannot approve
    await page.request.post('/api/auth/logout');

    await login(page, 'manager@example.com');
    await page.goto(`/cases/${id}`);
    await page.getByRole('button', { name: '承認する' }).click();
    await expect(page.getByText(/承認済み/).first()).toBeVisible();
    const pdf = await page.request.get(`/api/cases/${id}/pdf?type=summary`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    await page.request.post('/api/auth/logout');
  } finally {
    await setApproval(page, false);
  }
});

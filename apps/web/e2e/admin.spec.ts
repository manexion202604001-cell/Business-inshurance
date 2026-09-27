import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.use({ viewport: { width: 1280, height: 900 } });

test('admin adds a logic rule, tests it and publishes; new generations use it', async ({ page }) => {
  // Make sure at least one generated case exists
  await login(page, 'sales@example.com');
  await page.getByTestId('new-case').click();
  await page.getByTestId('sample-case-a').click();
  await page.getByTestId('create-plans').click();
  await expect(page.getByTestId('plan-MIN')).toBeVisible({ timeout: 60_000 });
  const caseUrl = page.url().split('?')[0]!;
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await page.waitForURL(/\/login/);

  await login(page, 'admin@example.com');
  await page.goto('/admin/knowledge');
  await page.getByTestId('add-rule').click();
  const id = `R9${Date.now() % 10}`;
  await page.getByTestId('rule-id').fill(id);
  await page.getByTestId('rule-name').fill('大規模企業の就業不能対策');
  await page.getByTestId('rule-condition').fill(JSON.stringify({ '>=': [{ var: 'employeeCount' }, 40] }));
  await page.getByTestId('rule-effect').fill(JSON.stringify({ scores: { THIRD_SECTOR: 2 }, addToMax: ['THIRD_SECTOR'] }));
  await page.getByTestId('rule-rationale').fill('従業員{employeeCount}名の生活を守るため、経営者の就業不能にも備える');
  await page.getByTestId('rule-test').click();
  await expect(page.getByTestId('rule-test-result')).toContainText('該当する');
  await page.getByTestId('save-rules').click();
  await expect(page.getByText('下書きに保存しました')).toBeVisible();
  await page.getByRole('button', { name: '版の公開' }).click();
  await page.getByTestId('publish-label').fill(`${id} 追加（e2e）`);
  await page.getByTestId('publish').click();
  await expect(page.getByText(/を公開しました/)).toBeVisible();

  // Re-generate: the new rule must appear in the plan logic
  await page.goto(caseUrl);
  await page.getByRole('button', { name: '再生成' }).click();
  await expect(page.getByTestId('plan-MAX')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('tab', { name: '計算の内訳' }).click();
  await expect(page.getByText(`${id}`).first()).toBeVisible();

  // Clean up: disable the rule and publish again so other tests are unaffected
  await page.goto('/admin/knowledge');
  await page.getByRole('button', { name: new RegExp(id) }).click();
  await page.getByRole('button', { name: '削除' }).click();
  await page.getByTestId('save-rules').click();
  await expect(page.getByText('下書きに保存しました')).toBeVisible();
  await page.getByRole('button', { name: '版の公開' }).click();
  await page.getByTestId('publish-label').fill(`${id} 削除（e2e 後片付け）`);
  await page.getByTestId('publish').click();
  await expect(page.getByText(/を公開しました/)).toBeVisible();
});

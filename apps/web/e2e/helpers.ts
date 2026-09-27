import { expect, type Page } from '@playwright/test';

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill('password');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page).toHaveURL(/\/cases/);
}

/** Counts user taps (clicks) performed through this helper. */
export class TapCounter {
  n = 0;
  constructor(private page: Page) {}
  async tap(locator: ReturnType<Page['locator']>) {
    this.n++;
    await locator.click();
  }
}

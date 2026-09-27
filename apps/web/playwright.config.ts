import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chromium = process.env.P3_CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => existsSync(p));

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    launchOptions: chromium ? { executablePath: chromium } : {},
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm start', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 120_000 },
});

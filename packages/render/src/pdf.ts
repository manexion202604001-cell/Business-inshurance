import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { fontDir } from './fonts';

/** Fonts are requested from this virtual origin and served from node_modules by request interception. */
export const PDF_FONT_BASE = 'https://p3.local/fonts';

let browserPromise: Promise<Browser> | null = null;

export function chromiumExecutable(): string | undefined {
  const fromEnv = process.env.P3_CHROMIUM_PATH;
  if (fromEnv) return fromEnv;
  const candidates = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
  return candidates.find((c) => existsSync(c));
}

async function browser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = chromiumExecutable();
    browserPromise = chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--font-render-hinting=none'] }).catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close();
  }
}

/** Render HTML to a PDF buffer. `landscape` for the summary one-pager. */
export async function htmlToPdf(html: string, opts: { landscape?: boolean } = {}): Promise<Buffer> {
  const b = await browser();
  const context = await b.newContext();
  const page = await context.newPage();
  try {
    const dir = fontDir();
    await page.route('https://p3.local/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/doc') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      if (url.pathname.startsWith('/fonts/')) {
        const file = url.pathname.slice('/fonts/'.length).replace(/[^a-z0-9._-]/gi, '');
        try {
          return route.fulfill({ status: 200, contentType: 'font/woff2', body: await readFile(join(dir, file)) });
        } catch {
          return route.fulfill({ status: 404, body: '' });
        }
      }
      return route.fulfill({ status: 404, body: '' });
    });
    // Block any other network access from the document.
    await page.route(/^(?!https:\/\/p3\.local\/).*/, (route) => route.abort());
    await page.goto('https://p3.local/doc', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({ format: 'A4', landscape: Boolean(opts.landscape), printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Render HTML to a PNG screenshot (used for visual checks). */
export async function htmlToPng(html: string, viewport: { width: number; height: number }): Promise<Buffer> {
  const b = await browser();
  const context = await b.newContext({ viewport });
  const page = await context.newPage();
  try {
    const dir = fontDir();
    await page.route('https://p3.local/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/doc') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      const file = url.pathname.slice('/fonts/'.length).replace(/[^a-z0-9._-]/gi, '');
      try {
        return route.fulfill({ status: 200, contentType: 'font/woff2', body: await readFile(join(dir, file)) });
      } catch {
        return route.fulfill({ status: 404, body: '' });
      }
    });
    await page.goto('https://p3.local/doc', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.screenshot({ fullPage: true }));
  } finally {
    await context.close();
  }
}

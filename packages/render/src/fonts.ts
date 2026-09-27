import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** Directory containing the bundled Noto Serif JP woff2 files. */
export function fontDir(): string {
  return join(dirname(require.resolve('@fontsource/noto-serif-jp/package.json')), 'files');
}

const cache = new Map<string, string>();

/** @font-face CSS for Noto Serif JP 400/700 (woff2 only), with URLs rewritten to `base`. */
export function fontFaceCss(base: string): string {
  const hit = cache.get(base);
  if (hit) return hit;
  const root = dirname(fontDir());
  const css = ['400', '700']
    .map((w) => readFileSync(join(root, `${w}.css`), 'utf8'))
    .join('\n')
    .replace(/, url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g, '')
    .replace(/url\(\.\/files\//g, `url(${base.replace(/\/$/, '')}/`);
  cache.set(base, css);
  return css;
}

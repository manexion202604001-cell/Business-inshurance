import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PKG = join('node_modules', '@fontsource', 'noto-serif-jp');

/**
 * Directory of the bundled @fontsource/noto-serif-jp package. Resolved from the working directory
 * upwards (works both from scripts and from the bundled Next.js server). Override with P3_FONT_PKG_DIR.
 */
export function fontPkgDir(): string {
  const env = process.env.P3_FONT_PKG_DIR;
  if (env && existsSync(env)) return env;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    for (const cand of [join(dir, PKG), join(dir, 'packages', 'render', PKG), join(dir, 'apps', 'web', PKG)]) {
      if (existsSync(join(cand, '400.css'))) return cand;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('@fontsource/noto-serif-jp not found (set P3_FONT_PKG_DIR)');
}

/** Directory containing the Noto Serif JP woff2 files. */
export function fontDir(): string {
  return join(fontPkgDir(), 'files');
}

const cache = new Map<string, string>();

/** @font-face CSS for Noto Serif JP 400/700 (woff2 only), with URLs rewritten to `base`. */
export function fontFaceCss(base: string): string {
  const hit = cache.get(base);
  if (hit) return hit;
  const root = fontPkgDir();
  const css = ['400', '700']
    .map((w) => readFileSync(join(root, `${w}.css`), 'utf8'))
    .join('\n')
    .replace(/, url\(\.\/files\/[^)]+\.woff\) format\('woff'\)/g, '')
    .replace(/url\(\.\/files\//g, `url(${base.replace(/\/$/, '')}/`);
  cache.set(base, css);
  return css;
}

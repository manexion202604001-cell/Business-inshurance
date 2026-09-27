// Copy the Noto Serif JP woff2 files (400/700) into public/fonts so documents can be previewed in the browser.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('@fontsource/noto-serif-jp/package.json')), 'files');
const dst = join(process.cwd(), 'public', 'fonts', 'noto-serif-jp');
mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (!/-(400|700)-normal\.woff2$/.test(f)) continue;
  if (!existsSync(join(dst, f))) cpSync(join(src, f), join(dst, f));
  n++;
}
console.log(`fonts: ${n} files in public/fonts/noto-serif-jp`);

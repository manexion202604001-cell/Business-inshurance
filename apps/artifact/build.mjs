// Bundles the browser app into one self-contained HTML page (dist/proposal3.html) for a claude.ai Artifact.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Server-only modules are replaced with inert stubs (never called in the browser). */
const stubs = {
  name: 'server-stubs',
  setup(b) {
    b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onResolve({ filter: /^(playwright-core|@anthropic-ai\/sdk.*)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onResolve({ filter: /^\.\/fonts$/ }, (a) => (a.importer.includes(join('render', 'src')) ? { path: 'fonts', namespace: 'stub' } : undefined));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => {
      const fail = `() => { throw new Error('${a.path} is not available in the browser'); }`;
      if (a.path === 'fonts') return { contents: `export const fontFaceCss = () => ''; export const fontDir = () => ''; export const fontPkgDir = () => '';`, loader: 'js' };
      if (a.path === 'playwright-core') return { contents: `export const chromium = { launch: ${fail} };`, loader: 'js' };
      if (a.path === '@anthropic-ai/sdk') return { contents: `export default class Anthropic { constructor() { (${fail})(); } }`, loader: 'js' };
      if (a.path.startsWith('@anthropic-ai/sdk')) return { contents: `export const zodOutputFormat = ${fail};`, loader: 'js' };
      return {
        contents: `export const readFileSync = ${fail}; export const readFile = ${fail}; export const existsSync = () => false; export const join = (...p) => p.join('/'); export const dirname = (p) => p; export const createRequire = () => ${fail}; export default {};`,
        loader: 'js',
      };
    });
  },
};

const r = await build({
  entryPoints: [join(here, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  write: false,
  plugins: [stubs],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  loader: { '.json': 'json' },
  legalComments: 'none',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const shell = readFileSync(join(here, 'src/shell.html'), 'utf8');
const css = readFileSync(join(here, 'src/app.css'), 'utf8');
const html = shell.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist/proposal3.html'), html);
console.log(`dist/proposal3.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);

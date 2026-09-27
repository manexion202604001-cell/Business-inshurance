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
    b.onResolve({ filter: /^playwright-core$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    // The server-side LLM client is stubbed; the app itself (src/) bundles the real SDK for browser calls.
    b.onResolve({ filter: /^@anthropic-ai\/sdk/ }, (a) => (a.importer.includes(join('packages', 'llm')) ? { path: a.path, namespace: 'stub' } : undefined));
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
// 1) claude.ai Artifact: page content only (the viewer adds the document skeleton).
writeFileSync(join(here, 'dist/proposal3.html'), html);
// 2) Standalone public site (GitHub Pages etc.): a complete document.
const head = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="法人保険の商談ログと企業情報から、根拠付きの3パターン提案と顧客提示用資料をその場で作成します。"><meta name="theme-color" content="#1f2d4d"><meta name="robots" content="noindex"><style>html,body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>`;
const site = `${head}${html}</body></html>`;
writeFileSync(join(here, 'dist/index.html'), site);
if (process.argv.includes('--site')) {
  const docs = join(here, '..', '..', 'docs');
  writeFileSync(join(docs, 'index.html'), site);
  writeFileSync(join(docs, '.nojekyll'), '');
  console.log('docs/index.html (GitHub Pages)');
}
console.log(`dist/proposal3.html ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, dist/index.html`);

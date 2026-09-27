/**
 * Render every fixture case to HTML / PDF / PNG under docs/poc/renders/ for visual review.
 *   pnpm render:samples
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSeedKnowledge } from '../packages/knowledge/src';
import { runPipeline, toRenderInput, type CaseForm } from '../packages/pipeline/src';
import { closeBrowser, htmlToPdf, htmlToPng, PDF_FONT_BASE, renderDoc, scanRendered, type DocType } from '../packages/render/src';

const root = join(import.meta.dirname, '..');
const K = loadSeedKnowledge();
const out = join(root, 'docs/poc/renders');
mkdirSync(out, { recursive: true });

async function main() {
  const ids = readdirSync(join(root, 'fixtures/cases')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  for (const id of ids) {
    const form = JSON.parse(readFileSync(join(root, 'fixtures/cases', `${id}.json`), 'utf8')) as CaseForm;
    const r = await runPipeline(form, K, { now: () => new Date('2026-09-27T10:00:00+09:00') });
    const ri = toRenderInput(r, K, { recommendedTier: 'BALANCED', ownerName: '営業 太郎' });
    for (const t of ['summary', 'design', 'memo', 'slides'] as DocType[]) {
      const html = renderDoc(t, ri, { fontBase: PDF_FONT_BASE });
      const scan = scanRendered(t, html, ri);
      if (scan.status === 'blocked') throw new Error(`${id}/${t} blocked: ${scan.issues.map((i) => i.message).join(', ')}`);
      if (t !== 'slides') {
        const pdf = await htmlToPdf(html, { landscape: t === 'summary' });
        writeFileSync(join(out, `${id}-${t}.pdf`), pdf);
      }
      const vp = t === 'summary' ? { width: 1123, height: 794 } : t === 'slides' ? { width: 1280, height: 720 } : { width: 794, height: 1123 };
      writeFileSync(join(out, `${id}-${t}.png`), await htmlToPng(html, vp));
      console.log(`${id} ${t} ok`);
    }
  }
  await closeBrowser();
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exitCode = 1;
});

/**
 * Latency benchmark (Phase 4): runs the pipeline N times per fixture and PDF rendering once per case.
 *   pnpm bench [runs=20]
 * With ANTHROPIC_API_KEY set, Steps 2 and 5 call the API (cost!); otherwise template mode.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSeedKnowledge } from '../packages/knowledge/src';
import { runPipeline, toRenderInput, type CaseForm } from '../packages/pipeline/src';
import { closeBrowser, htmlToPdf, PDF_FONT_BASE, renderDoc } from '../packages/render/src';

const root = join(import.meta.dirname, '..');
const K = loadSeedKnowledge();
const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0;
};

async function main() {
  const runs = Number(process.argv[2] ?? 20);
  const ids = readdirSync(join(root, 'fixtures/cases')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  const total: number[] = [];
  const steps: Record<string, number[]> = {};
  const pdf: number[] = [];
  const tokens = { input: 0, output: 0, cacheRead: 0 };
  let blocked = 0;
  let regenerated = 0;
  let n = 0;
  for (const id of ids) {
    const form = JSON.parse(readFileSync(join(root, 'fixtures/cases', `${id}.json`), 'utf8')) as CaseForm;
    for (let i = 0; i < runs; i++) {
      const r = await runPipeline(form, K);
      n++;
      total.push(r.metrics.totalMs);
      for (const [k, v] of Object.entries(r.metrics.stepMs)) (steps[`Step${k}`] ??= []).push(v ?? 0);
      for (const u of r.metrics.usage) {
        tokens.input += u.inputTokens;
        tokens.output += u.outputTokens;
        tokens.cacheRead += u.cacheReadTokens;
      }
      if (r.compliance.status === 'blocked') blocked++;
      if (r.narrativeMeta.attempts > 1) regenerated++;
      if (i === 0) {
        const t = Date.now();
        await htmlToPdf(renderDoc('summary', toRenderInput(r, K), { fontBase: PDF_FONT_BASE }), { landscape: true });
        pdf.push(Date.now() - t);
      }
    }
  }
  await closeBrowser();
  const row = (name: string, xs: number[]) => `| ${name} | ${pct(xs, 50)} | ${pct(xs, 95)} | ${Math.max(...xs)} |`;
  console.log(`runs: ${n}（${ids.length}ケース × ${runs}回）`);
  console.log('| 区間 | P50 (ms) | P95 (ms) | 最大 (ms) |\n|---|---:|---:|---:|');
  console.log(row('合計（Step1〜7）', total));
  for (const [k, v] of Object.entries(steps)) console.log(row(k, v));
  console.log(row('PDF化（サマリー、Chromium起動済み）', pdf.slice(1).length ? pdf.slice(1) : pdf));
  console.log(`ブロック率: ${((blocked / n) * 100).toFixed(1)}% ／ 再生成率: ${((regenerated / n) * 100).toFixed(1)}% ／ トークン 入力${tokens.input}・出力${tokens.output}・キャッシュ読込${tokens.cacheRead}`);
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exitCode = 1;
});

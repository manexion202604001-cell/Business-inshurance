/**
 * PoC CLI: run Steps 1–7 for a fixture case without the UI.
 *   pnpm poc case-a            (one case)
 *   pnpm poc all               (all fixtures)
 * Writes JSON + Markdown to docs/poc/runs/<caseId>/.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatMan } from '../packages/engine/src';
import { loadSeedKnowledge } from '../packages/knowledge/src';
import { ISSUE_TAG_LABEL } from '../packages/llm/src';
import { runPipeline, type CaseForm, type PipelineResult } from '../packages/pipeline/src';

const root = join(import.meta.dirname, '..');
const K = loadSeedKnowledge();

function loadForm(id: string): CaseForm & { id: string; title: string } {
  return JSON.parse(readFileSync(join(root, 'fixtures/cases', `${id}.json`), 'utf8'));
}

function toMarkdown(title: string, r: PipelineResult): string {
  const cv = r.calc.coverage;
  const lines: string[] = [];
  lines.push(`# ${title}`, '');
  lines.push(`- 生成日時: ${r.generatedAt}`, `- 文章生成: ${r.narrativeMeta.source}（${r.metrics.llmReason}）`, `- 抽出: ${r.extraction.source}`, `- コンプラ判定: **${r.compliance.status}**（masking ${r.compliance.counts.masking} / banned ${r.compliance.counts.banned} / grounding ${r.compliance.counts.grounding} / disclaimer ${r.compliance.counts.disclaimer}）`);
  lines.push(`- 所要時間: 合計 ${r.metrics.totalMs}ms（Step2 ${r.metrics.stepMs[2]}ms / Step5 ${r.metrics.stepMs[5]}ms）`, '');
  lines.push('## 入力マスキング', r.inputMaskHits.length ? r.inputMaskHits.map((h) => `- ${h.kind}: ${h.match}`).join('\n') : '- なし', '');
  lines.push('## 抽出された課題');
  for (const i of r.extraction.issues) lines.push(`- ${ISSUE_TAG_LABEL[i.tag]}：${i.summary}（「${i.evidenceQuote}」）`);
  if (r.extraction.conflicts.length) lines.push('', '### 入力とログの食い違い', ...r.extraction.conflicts.map((c) => `- ${c.field}: 入力 ${c.formValue} / ログ ${c.logValue}`));
  lines.push('', '## 計算結果（万円）', '| 項目 | 値 | 式 |', '|---|---:|---|');
  for (const m of [cv.methodA, cv.methodB, cv.businessFund, cv.deathRetirement, cv.condolence, cv.required, cv.existing, cv.gap, r.calc.retirement.target, r.calc.retirement.inflationAdjusted, r.calc.retirement.deduction, r.calc.retirement.taxable, r.calc.budget.min, r.calc.budget.balanced, r.calc.budget.max]) {
    lines.push(`| ${m.calcId} | ${formatMan(m.value)} | ${m.formula} |`);
  }
  lines.push('', `適用ルール: ${r.planSet.ruleHits.map((h) => h.id).join(', ') || 'なし'}`, '');
  for (const p of r.planSet.plans) {
    const n = r.narrative.plans.find((x) => x.tier === p.tier)!;
    lines.push(`## ${p.title}`, '', `**${n.headline}** — 充足率 ${p.coverageRatioMoney.value}% ／ 保険料目安 ${p.totalPremium ? formatMan(p.totalPremium.value) : '設計書'}`, '');
    for (const c of p.components) lines.push(`- ${c.label}: ${formatMan(c.deathBenefit.value)}（〜${c.termToAge}歳、${c.taxTreatment}）`);
    lines.push('', '### 提案根拠', ...n.whyThisCompany.map((w) => `1. ${w}`), '', '### 注意点', ...n.cautions.map((c) => `- ${c}`), '');
  }
  lines.push('## トークスクリプト', '', r.narrative.talkScript.opening, '', r.narrative.talkScript.problemFraming, '');
  for (const w of r.narrative.talkScript.planWalkthrough) lines.push(`- ${w.script}`);
  lines.push('', r.narrative.talkScript.closingQuestion, '', '### 想定反論', ...r.narrative.talkScript.objectionHandling.map((o) => `- **${o.objection}** → ${o.response}`), '');
  lines.push('## コンプライアンス指摘', r.compliance.issues.length ? r.compliance.issues.map((i) => `- [${i.severity}] ${i.type} @${i.section}: ${i.message}`).join('\n') : '- なし');
  return lines.join('\n') + '\n';
}

async function main() {
  const arg = process.argv[2] ?? 'all';
  const ids = arg === 'all' ? readdirSync(join(root, 'fixtures/cases')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')) : [arg];
  let failed = 0;
  for (const id of ids) {
    const f = loadForm(id);
    const r = await runPipeline(f, K, {
      onProgress: (e) => {
        if (e.status !== 'start') console.log(`  [${id}] Step${e.step} ${e.label} ${e.status}${e.ms != null ? ` ${e.ms}ms` : ''}`);
      },
    });
    const dir = join(root, 'docs/poc/runs', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'result.json'), JSON.stringify(r, null, 2));
    writeFileSync(join(dir, 'result.md'), toMarkdown(f.title, r));
    const llmMs = (r.metrics.stepMs[2] ?? 0) + (r.metrics.stepMs[5] ?? 0);
    console.log(`${id}: compliance=${r.compliance.status} narrative=${r.narrativeMeta.source} step2+5=${llmMs}ms total=${r.metrics.totalMs}ms`);
    if (r.compliance.status === 'blocked') {
      failed++;
      for (const i of r.compliance.issues) console.log(`   - ${i.type} ${i.section}: ${i.message}`);
    }
  }
  const { closeBrowser } = await import('../packages/render/src');
  await closeBrowser();
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadSeedKnowledge } from '../../knowledge/src';
import { closeBrowser, htmlToText, PDF_FONT_BASE, renderDoc } from '../../render/src';
import { llmConfig } from '../../llm/src';
import { runPipeline, toRenderInput, type CaseForm } from '../src';

const K = loadSeedKnowledge();
const OFF = llmConfig({ P3_LLM_MODE: 'off' } as NodeJS.ProcessEnv);
const fixture = (id: string): CaseForm => JSON.parse(readFileSync(join(__dirname, '../../../fixtures/cases', `${id}.json`), 'utf8'));

afterAll(() => closeBrowser());

async function customerText(form: CaseForm) {
  const r = await runPipeline(form, K, { llm: OFF });
  const ri = toRenderInput(r, K);
  const texts = (['summary', 'design', 'slides'] as const).map((t) => htmlToText(renderDoc(t, ri, { fontBase: PDF_FONT_BASE })));
  return { r, text: texts.join('\n') };
}

describe('red team: brand names in the log', () => {
  it('masks insurer, product, fund names and document ids before anything else', async () => {
    const f = fixture('case-a');
    f.rawLog += '\n社長：実はアクサ生命のユニット・リンクと、ソニー生命のバリアブルライフも検討してる。ＺＵＲＩＣＨの人からも Form No. ZL-123 の資料をもらった。ファンドはピクテ・ジャパンのやつ。連絡は 03-1234-5678 まで。';
    const { r, text } = await customerText(f);
    expect(r.inputMaskHits.map((h) => h.kind)).toEqual(expect.arrayContaining(['insurer', 'product', 'fund', 'docId']));
    expect(r.normalizedLog).not.toMatch(/アクサ|ユニット・リンク|ソニー|バリアブルライフ|ZURICH|ピクテ|ZL-123/i);
    expect(text).not.toMatch(/アクサ|ユニット・リンク|ソニー|バリアブル|ZURICH|ピクテ|ZL-123/i);
    expect(r.compliance.status).not.toBe('blocked');
  });
});

describe('red team: strong tax-saving requests', () => {
  it('never turns the request into a tax-saving appeal', async () => {
    const f = fixture('case-b');
    f.rawLog += '\n社長：とにかく節税になるやつがいい。利益の圧縮がしたいんだよ。税金が減るなら何でもいい。全額損金のやつで。';
    const { r, text } = await customerText(f);
    expect(r.extraction.signals.taxSavingRequested).toBe(true);
    expect(text).not.toMatch(/節税になり|利益の圧縮|税金が減る/);
    expect(text).toContain('通期での節税効果はありません');
    expect(r.narrative.talkScript.objectionHandling.some((o) => o.response.includes('通期での節税効果はありません'))).toBe(true);
    expect(r.compliance.counts.banned).toBe(0);
  });
});

describe('red team: extreme numbers', () => {
  const cases: [string, (f: CaseForm) => void][] = [
    ['no loans', (f) => Object.assign(f.company, { loanTotal: 0, loanShortTerm: 0, loanMonthlyRepay: 0 })],
    ['loss-making', (f) => Object.assign(f.company, { ordinaryProfit: -3000 })],
    ['one employee', (f) => Object.assign(f.company, { employeeCount: 1, monthlyLabor: 40, monthlyFixed: 10 })],
    ['75-year-old CEO past retirement', (f) => Object.assign(f.officer, { age: 75, plannedRetireAge: 70 })],
    ['tiny company, everything optional missing', (f) => {
      f.company = { name: '個人商店', industry: 'retail', revenue: 1200, loanTotal: 0, employeeCount: 1 } as CaseForm['company'];
      f.officer = { role: '社長', age: 40, sex: 'F', monthlyPay: 30, tenureYears: 2 } as CaseForm['officer'];
      f.existingPolicies = [];
      f.rawLog = '';
    }],
    ['huge company', (f) => Object.assign(f.company, { revenue: 5_000_000, loanTotal: 2_000_000, monthlyLabor: 100_000, monthlyFixed: 50_000, loanMonthlyRepay: 20_000, loanShortTerm: 300_000, employeeCount: 3000, ordinaryProfit: 400_000 })],
  ];
  for (const [name, mutate] of cases) {
    it(`${name}: 3 plans, no NaN, no blocked output`, async () => {
      const f = fixture('case-a');
      mutate(f);
      const { r, text } = await customerText(f);
      expect(r.planSet.plans).toHaveLength(3);
      expect(JSON.stringify(r.calc)).not.toMatch(/NaN|Infinity|null,"unit"/);
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
      expect(r.compliance.status).not.toBe('blocked');
      for (const p of r.planSet.plans) for (const c of p.components) expect(c.deathBenefit.value).toBeGreaterThan(0);
    });
  }
});

describe('log conflicts and supplementation', () => {
  it('reports conflicts between the form and the log (case C revenue 40億 vs 4億)', async () => {
    const r = await runPipeline(fixture('case-c'), K, { llm: OFF });
    expect(r.extraction.conflicts.map((c) => c.field)).toContain('revenue');
    expect(r.calc.coverage.required.value).toBe(33320);
  });
  it('fills empty optional fields from the log and marks them as assumptions', async () => {
    const f = fixture('case-b');
    f.company.monthlyLabor = null;
    f.company.loanMonthlyRepay = null;
    f.officer.plannedRetireAge = null;
    const r = await runPipeline(f, K, { llm: OFF });
    expect(r.supplemented.map((s) => s.field).sort()).toEqual(['loanMonthlyRepay', 'monthlyLabor', 'plannedRetireAge']);
    expect(r.calc.coverage.methodB.value).toBe(12160);
    expect(r.calc.assumptions.map((a) => a.field)).toEqual(expect.arrayContaining(['monthlyLabor', 'plannedRetireAge']));
  });
  it('partial re-run from step 3 reuses the extraction', async () => {
    const f = fixture('case-b');
    const first = await runPipeline(f, K, { llm: OFF });
    f.officer.legalHeirs = 4;
    const again = await runPipeline(f, K, { llm: OFF, reuse: { normalizedLog: first.normalizedLog, inputMaskHits: first.inputMaskHits, extraction: first.extraction } });
    expect(again.calc.coverage.inheritanceExempt.value).toBe(2000);
    expect(again.extraction).toEqual(first.extraction);
  });
});

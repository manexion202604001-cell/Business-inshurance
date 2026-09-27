import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runEngine, type CaseInput } from '../../engine/src';
import { loadSeedKnowledge, toEngineKnowledge } from '../../knowledge/src';
import {
  extract,
  extractWithRules,
  generateNarrative,
  groundingPool,
  llmConfig,
  narrativeIssues,
  setClientForTests,
  templateNarrative,
  validateQuotes,
  type Narrative,
  type NarrativeContext,
} from '../src';

const K = loadSeedKnowledge();
const ON = llmConfig({ P3_LLM_MODE: 'on' } as NodeJS.ProcessEnv);

function ctxFor(id: string): NarrativeContext {
  const f = JSON.parse(readFileSync(join(__dirname, '../../../fixtures/cases', `${id}.json`), 'utf8'));
  const extraction = extractWithRules(f.rawLog, f);
  const input: CaseInput = { company: f.company, officer: f.officer, existingPolicies: f.existingPolicies, signals: { issueTags: extraction.issues.map((i) => i.tag) } };
  const out = runEngine(input, toEngineKnowledge(K));
  return { company: f.company, officer: f.officer, existingPolicies: f.existingPolicies, industryLabel: '製造業', calc: out.calc, planSet: out.planSet, extraction, knowledge: K };
}

/** Fake Anthropic client returning the queued outputs in order. */
function fakeClient(outputs: unknown[]) {
  const calls: { user: string }[] = [];
  const client = {
    messages: {
      parse: async (req: { messages: { content: string }[] }) => {
        calls.push({ user: req.messages[0]!.content });
        const next = outputs.shift();
        if (next instanceof Error) throw next;
        return { stop_reason: 'end_turn', parsed_output: next, usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 800, cache_creation_input_tokens: 0 } };
      },
    },
  };
  setClientForTests(client as unknown as Anthropic);
  return calls;
}

afterEach(() => setClientForTests(null));

describe('template narrative (Phase 1 evaluation baseline)', () => {
  for (const id of ['case-a', 'case-b', 'case-c']) {
    it(`${id}: no grounding / masking / banned violations and fact→criteria→calc→conclusion order`, () => {
      const ctx = ctxFor(id);
      const n = templateNarrative(ctx);
      expect(narrativeIssues(n, ctx, groundingPool(ctx))).toEqual([]);
      for (const p of n.plans) {
        expect(p.whyThisCompany).toHaveLength(4);
        expect(p.whyThisCompanyRefs).toHaveLength(4);
        expect(p.whyThisCompany[0]).toMatch(/^御社/);
        expect(p.whyThisCompany[1]).toMatch(/目安|積み上げ/);
        expect(p.whyThisCompany[2]).toMatch(/^その結果/);
        expect(p.headline.length).toBeLessThanOrEqual(30);
      }
    });
  }
});

describe('LLM narrative with validation and fallback', () => {
  it('accepts a clean LLM output', async () => {
    const ctx = ctxFor('case-a');
    const good = templateNarrative(ctx);
    good.onePaper.lead = `${good.onePaper.lead}御社の状況に合わせて整理しました。`;
    const calls = fakeClient([good]);
    const r = await generateNarrative(ctx, ON);
    expect(r.source).toBe('llm');
    expect(r.attempts).toBe(1);
    expect(calls[0]!.user).toContain('<CALC_RESULT>');
    expect(r.usage[0]!.cacheReadTokens).toBe(800);
  });

  it('regenerates with feedback when a number is fabricated, then accepts the fix', async () => {
    const ctx = ctxFor('case-a');
    const bad: Narrative = templateNarrative(ctx);
    bad.plans[0]!.whyThisCompany[3] = '保険料は年間約321万円で、20年後には約2億円が戻ってきます。';
    const good = templateNarrative(ctx);
    const calls = fakeClient([bad, good]);
    const r = await generateNarrative(ctx, ON);
    expect(r.source).toBe('llm');
    expect(r.attempts).toBe(2);
    expect(calls[1]!.user).toContain('<FEEDBACK>');
    expect(calls[1]!.user).toContain('321万円');
  });

  it('after 2 failed regenerations, patches only the offending fields with the template', async () => {
    const ctx = ctxFor('case-c');
    const mk = () => {
      const n = templateNarrative(ctx);
      n.plans[1]!.headline = '節税しながら確実に退職金を準備';
      n.onePaper.lead = '〇〇生命の商品なら他社より有利です。';
      n.plans[2]!.fitFor = '独自の表現で書き直した向いている経営者の説明です。';
      return n;
    };
    fakeClient([mk(), mk(), mk()]);
    const r = await generateNarrative(ctx, ON);
    expect(r.attempts).toBe(3);
    expect(r.source).toBe('mixed');
    expect(r.patched).toEqual(expect.arrayContaining(['plans.BALANCED.headline', 'onePaper.lead']));
    expect(r.narrative.plans[1]!.headline).not.toContain('節税');
    expect(r.narrative.onePaper.lead).not.toContain('生命');
    expect(r.narrative.plans[2]!.fitFor).toBe('独自の表現で書き直した向いている経営者の説明です。');
    expect(narrativeIssues(r.narrative, ctx, groundingPool(ctx)).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('falls back to the template when the API fails', async () => {
    const ctx = ctxFor('case-b');
    fakeClient([new Error('overloaded')]);
    const r = await generateNarrative(ctx, ON);
    expect(r.source).toBe('template');
    expect(r.error).toContain('overloaded');
  });

  it('adds missing mandatory disclaimers to cautions in code', async () => {
    const ctx = ctxFor('case-a');
    const n = templateNarrative(ctx);
    for (const p of n.plans) p.cautions = [];
    fakeClient([n]);
    const r = await generateNarrative(ctx, ON);
    const bal = r.narrative.plans.find((p) => p.tier === 'BALANCED')!;
    expect(bal.cautions).toContain('早期に解約した場合、解約返戻金は払込保険料を大きく下回ります');
  });

  it('rejects references to unknown calcIds', async () => {
    const ctx = ctxFor('case-a');
    const n = templateNarrative(ctx);
    n.plans[0]!.whyThisCompanyRefs[0] = ['calc.made.up'];
    const issues = narrativeIssues(n, ctx, groundingPool(ctx));
    expect(issues.some((i) => i.type === 'schema' && i.message.includes('calc.made.up'))).toBe(true);
  });
});

describe('extraction', () => {
  it('drops hallucinated evidence quotes', () => {
    const f = JSON.parse(readFileSync(join(__dirname, '../../../fixtures/cases/case-c.json'), 'utf8'));
    const ex = extractWithRules(f.rawLog, f);
    ex.issues.push({ tag: 'other', summary: 'x', evidenceQuote: 'ログに存在しない発言', confidence: 0.9 });
    const v = validateQuotes(ex, f.rawLog);
    expect(v.droppedQuotes).toBe(1);
  });
  it('uses the LLM result and recomputes conflicts in code', async () => {
    const f = JSON.parse(readFileSync(join(__dirname, '../../../fixtures/cases/case-c.json'), 'utf8'));
    const rules = extractWithRules(f.rawLog, f);
    fakeClient([{ ...rules, companyFacts: { ...rules.companyFacts, revenue: 400000 }, conflicts: [], signals: { ...rules.signals, employeeRetirementPrepared: null } }]);
    const r = await extract(f.rawLog, f, K, ON);
    expect(r.extraction.source).toBe('llm');
    expect(r.extraction.conflicts.map((c) => c.field)).toContain('revenue');
    expect(r.extraction.signals.employeeRetirementPrepared).toBe(true); // merged from rules
  });
  it('falls back to rules on API error', async () => {
    const f = JSON.parse(readFileSync(join(__dirname, '../../../fixtures/cases/case-a.json'), 'utf8'));
    fakeClient([new Error('timeout')]);
    const r = await extract(f.rawLog, f, K, ON);
    expect(r.extraction.source).toBe('rules');
    expect(r.error).toBe('timeout');
  });
  it('rule extraction finds the case facts', () => {
    const f = JSON.parse(readFileSync(join(__dirname, '../../../fixtures/cases/case-b.json'), 'utf8'));
    const ex = extractWithRules(f.rawLog, { company: {}, officer: {}, existingPolicies: [] });
    expect(ex.companyFacts).toMatchObject({ revenue: 20000, ordinaryProfit: 2500, loanTotal: 3000, loanShortTerm: 1000, loanMonthlyRepay: 80, monthlyLabor: 600, monthlyFixed: 250, employeeCount: 18, plannedRetireAge: 60 });
  });
});

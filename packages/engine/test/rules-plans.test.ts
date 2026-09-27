import { describe, expect, it } from 'vitest';
import { loadSeedKnowledge, toEngineKnowledge } from '../../knowledge/src';
import { evalLogic, interpolate, runEngine } from '../src';
import { loadFixture, toInput } from './helpers';

const K = toEngineKnowledge(loadSeedKnowledge());

describe('evalLogic', () => {
  it('supports comparisons, and/or/not, in, var defaults', () => {
    const d = { a: 5, b: null, tags: ['x'], nested: { v: 2 } };
    expect(evalLogic({ '>=': [{ var: 'a' }, 5] }, d)).toBe(true);
    expect(evalLogic({ '<': [{ var: 'b' }, 1] }, d)).toBe(false);
    expect(evalLogic({ and: [true, { '!': false }] }, d)).toBe(true);
    expect(evalLogic({ or: [false, 0, 'y'] }, d)).toBe('y');
    expect(evalLogic({ in: ['x', { var: 'tags' }] }, d)).toBe(true);
    expect(evalLogic({ in: ['bc', 'abc'] }, d)).toBe(true);
    expect(evalLogic({ var: ['missing', 7] }, d)).toBe(7);
    expect(evalLogic({ var: 'nested.v' }, d)).toBe(2);
    expect(evalLogic({ '+': [1, 2, 3] }, d)).toBe(6);
    expect(evalLogic({ '/': [1, 0] }, d)).toBe(null);
    expect(evalLogic({ if: [false, 'a', true, 'b', 'c'] }, d)).toBe('b');
    expect(evalLogic({ max: [1, 4, 2] }, d)).toBe(4);
    expect(() => evalLogic({ foo: [1] }, d)).toThrow();
  });
  it('interpolates facts', () => {
    expect(interpolate('残り{years}年 {missing}', { years: 10 })).toBe('残り10年 —');
  });
});

const hitsOf = (id: string, signals = {}) => runEngine(toInput(loadFixture(id), signals), K).evaluation.hits.map((h) => h.id);

describe('logic rules (§13 expected rules)', () => {
  it('case A: R01, R03, R05', () => {
    expect(hitsOf('case-a')).toEqual(['R01', 'R03', 'R05']);
  });
  it('case B: R03, R05', () => {
    expect(hitsOf('case-b')).toEqual(['R03', 'R05']);
  });
  it('case C: R01, R02, R04, R06, R08 (with succession topic and employee plan in place)', () => {
    expect(hitsOf('case-c', { issueTags: ['successor'], employeeRetirementPrepared: true })).toEqual(['R01', 'R02', 'R04', 'R06', 'R08']);
  });
  it('R07 fires on deficit and penalizes high asset-recognition categories', () => {
    const out = runEngine(toInput(loadFixture('case-b'), { deficitMentioned: true }), K);
    expect(out.evaluation.hits.map((h) => h.id)).toContain('R07');
    expect(out.evaluation.scores.TERM_LEVEL_LONG).toBeLessThan(out.evaluation.scores.VARIABLE_TERM!);
  });
  it('R08 produces a memo point', () => {
    const out = runEngine(toInput(loadFixture('case-c'), { issueTags: ['successor'] }), K);
    expect(out.planSet.memoPoints[0]).toContain('75歳');
    expect(out.planSet.memoPoints[0]).toContain('70歳');
  });
  it('rule errors are collected, not thrown', () => {
    const out = runEngine(toInput(loadFixture('case-a')), { ...K, rules: [...K.rules, { id: 'RX', name: 'bad', enabled: true, condition: { nope: [1] }, effect: {}, rationale: '' }] });
    expect(out.evaluation.errors).toHaveLength(1);
  });
  it('disabled rules are skipped', () => {
    const out = runEngine(toInput(loadFixture('case-a')), { ...K, rules: K.rules.map((r) => ({ ...r, enabled: r.id !== 'R01' })) });
    expect(out.evaluation.hits.map((h) => h.id)).not.toContain('R01');
  });
});

describe('plan composition', () => {
  for (const id of ['case-a', 'case-b', 'case-c']) {
    it(`${id}: three tiers with consistent structure`, () => {
      const out = runEngine(toInput(loadFixture(id), id === 'case-c' ? { issueTags: ['successor'], employeeRetirementPrepared: true } : {}), K);
      const [min, bal, max] = out.planSet.plans;
      expect(out.planSet.plans.map((p) => p.tier)).toEqual(['MIN', 'BALANCED', 'MAX']);
      for (const p of out.planSet.plans) {
        expect(p.components.length).toBeGreaterThan(0);
        for (const c of p.components) {
          expect(c.deathBenefit.value).toBeGreaterThan(0);
          expect(c.label).toMatch(/[ABC]プラン$/);
          if (c.premiumEstimate !== 'DESIGN_SHEET_REQUIRED') {
            expect(c.premiumEstimate.low.value).toBeLessThanOrEqual(c.premiumEstimate.high.value);
          }
        }
        if (p.totalPremium && !p.reducedForBudget && p.budgetCap.value > 0) {
          const officerPremium = p.components.reduce((s, c) => s + (c.premiumEstimate === 'DESIGN_SHEET_REQUIRED' ? 0 : c.premiumEstimate.mid.value), 0);
          expect(officerPremium).toBeLessThanOrEqual(p.budgetCap.value + 1);
        }
      }
      expect(min!.coverageRatio).toBeLessThanOrEqual(max!.coverageRatio + 1e-9);
      expect(max!.components.length).toBeGreaterThanOrEqual(bal!.components.length);
    });
  }
  it('case A MIN plan prioritises the loan within the MIN budget', () => {
    const out = runEngine(toInput(loadFixture('case-a')), K);
    const min = out.planSet.plans[0]!;
    expect(min.components[0]!.role).toBe('protection');
    expect(min.components[0]!.deathBenefit.value).toBeLessThanOrEqual(30000);
    expect(min.title).toContain('借入金');
  });
  it('case A MAX plan includes the welfare plan (R05)', () => {
    const out = runEngine(toInput(loadFixture('case-a')), K);
    expect(out.planSet.plans[2]!.components.map((c) => c.categoryCode)).toContain('ENDOWMENT_HALF');
  });
  it('case C MAX plan includes third sector (R04) and whole life (R06) when the budget allows', () => {
    const f = loadFixture('case-c');
    const rich = { ...f, company: { ...f.company, ordinaryProfit: 20000 } };
    const out = runEngine(toInput(rich, { issueTags: ['successor'], employeeRetirementPrepared: true }), K);
    const codes = out.planSet.plans[2]!.components.map((c) => c.categoryCode);
    expect(out.planSet.plans[2]!.reducedForBudget).toBe(false);
    expect(codes).toContain('THIRD_SECTOR');
    expect(codes).toContain('WHOLE_LIFE');
    expect(codes).not.toContain('ENDOWMENT_HALF');
  });
  it('case C MAX plan keeps the higher-priority add-on under a tight budget', () => {
    const out = runEngine(toInput(loadFixture('case-c'), { issueTags: ['successor'], employeeRetirementPrepared: true }), K);
    const max = out.planSet.plans[2]!;
    expect(max.reducedForBudget).toBe(true);
    expect(max.components.map((c) => c.categoryCode)).toContain('THIRD_SECTOR');
    expect(max.totalPremium!.value).toBeLessThanOrEqual(max.budgetCap.value);
    expect(max.notes.join()).toContain('参考保険料');
  });
  it('without reference rates, premiums require a design sheet', () => {
    const out = runEngine(toInput(loadFixture('case-b')), { ...K, rates: [] });
    for (const p of out.planSet.plans) {
      for (const c of p.components) expect(c.premiumEstimate).toBe('DESIGN_SHEET_REQUIRED');
      expect(p.totalPremium).toBeNull();
    }
  });
  it('when the gap is zero the MIN plan starts retirement funding', () => {
    const f = loadFixture('case-b');
    const out = runEngine(toInput({ ...f, existingPolicies: [{ category: 'TERM_LOW_CV', deathBenefit: 50000 }] }), K);
    expect(out.planSet.plans[0]!.components[0]!.role).toBe('retirement');
  });
  it('handles zero loans and missing profit (extreme inputs)', () => {
    const f = loadFixture('case-b');
    const out = runEngine(toInput({ ...f, company: { ...f.company, loanTotal: 0, loanShortTerm: 0, loanMonthlyRepay: 0, ordinaryProfit: -500, employeeCount: 1 }, officer: { ...f.officer, age: 75, plannedRetireAge: 75 } }), K);
    expect(out.planSet.plans).toHaveLength(3);
    expect(out.calc.budget.assumed).toBe(true);
    expect(out.planSet.plans[0]!.title).toContain('運転資金');
  });
});

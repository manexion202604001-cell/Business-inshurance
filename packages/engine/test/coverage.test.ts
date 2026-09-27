import { describe, expect, it } from 'vitest';
import { calculate, coverageMethodA, coverageMethodB, deathRetirement, DEFAULT_SETTINGS as S, formatMan } from '../src';
import { loadFixture, toInput } from './helpers';

describe('reference examples (§7.3)', () => {
  it('method B example from the brochure: (500+200)×12 + 50×12 + 3,000 = 12,000', () => {
    expect(coverageMethodB(500, 200, 50, 3000, S).total.value).toBe(12000);
  });
  it('death retirement example: 190 × 12 × 2.4 = 5,472', () => {
    expect(deathRetirement(190, 12, 2.4).value).toBe(5472);
  });
  it('method A gross-up uses the effective tax rate', () => {
    const a = coverageMethodA(30000, 2500, S);
    expect(a.loan.value).toBe(30000);
    expect(a.rebuild.value).toBe(15000);
    expect(a.taxReserve.value).toBe(22751);
    expect(a.total.value).toBe(67751);
  });
});

describe('case A (manufacturing, large loan)', () => {
  const calc = calculate(toInput(loadFixture('case-a')), S);
  it('coverage', () => {
    expect(calc.coverage.methodA.value).toBe(67751);
    expect(calc.coverage.methodB.value).toBe(49400);
    expect(calc.coverage.deathRetirement.value).toBe(9000);
    expect(calc.coverage.condolence.value).toBe(900);
    expect(calc.coverage.condolenceOnDuty.value).toBe(5400);
    expect(calc.coverage.inheritanceExempt.value).toBe(1500);
    expect(calc.coverage.adopted).toBe('B');
    expect(calc.coverage.required.value).toBe(59300);
    expect(calc.coverage.existing.value).toBe(10000);
    expect(calc.coverage.gap.value).toBe(49300);
  });
  it('retirement', () => {
    expect(calc.retirement.target.value).toBe(13500);
    expect(calc.retirement.inflationAdjusted.value).toBe(16456);
    expect(calc.retirement.deduction.value).toBe(1500);
    expect(calc.retirement.taxable.value).toBe(6000);
  });
  it('has no assumptions when all inputs are given', () => {
    expect(calc.assumptions).toEqual([]);
  });
});

describe('case B (IT, young CEO)', () => {
  const calc = calculate(toInput(loadFixture('case-b')), S);
  it('coverage', () => {
    expect(calc.coverage.methodAParts.taxReserve.value).toBe(3337);
    expect(calc.coverage.methodA.value).toBe(9937);
    expect(calc.coverage.methodB.value).toBe(12160);
    expect(calc.coverage.deathRetirement.value).toBe(1800);
    expect(calc.coverage.condolence.value).toBe(600);
    expect(calc.coverage.required.value).toBe(14560);
    expect(calc.coverage.gap.value).toBe(14560);
  });
  it('retirement', () => {
    expect(calc.retirement.totalTenure.value).toBe(21);
    expect(calc.retirement.target.value).toBe(6300);
    expect(calc.retirement.deduction.value).toBe(870);
    expect(calc.retirement.taxable.value).toBe(2715);
    expect(calc.retirement.inflationAdjusted.value).toBe(8479);
  });
});

describe('case C (construction, older CEO)', () => {
  const calc = calculate(toInput(loadFixture('case-c')), S);
  it('coverage', () => {
    expect(calc.coverage.methodAParts.taxReserve.value).toBe(9707);
    expect(calc.coverage.methodA.value).toBe(28907);
    expect(calc.coverage.methodB.value).toBe(23600);
    expect(calc.coverage.deathRetirement.value).toBe(9000);
    expect(calc.coverage.condolence.value).toBe(720);
    expect(calc.coverage.required.value).toBe(33320);
    expect(calc.coverage.gap.value).toBe(18320);
  });
  it('retirement', () => {
    expect(calc.retirement.target.value).toBe(10800);
    expect(calc.retirement.deduction.value).toBe(1500);
    expect(calc.retirement.taxable.value).toBe(4650);
    expect(calc.retirement.inflationAdjusted.value).toBe(11924);
  });
});

describe('method switch and assumptions', () => {
  it('uses method A when configured', () => {
    const calc = calculate(toInput(loadFixture('case-a')), { ...S, adoptedMethod: 'A' });
    expect(calc.coverage.required.value).toBe(67751 + 9000 + 900);
  });
  it('uses on-duty condolence when signalled', () => {
    const calc = calculate(toInput(loadFixture('case-a'), { onDutyDeath: true }), S);
    expect(calc.coverage.condolence.value).toBe(5400);
  });
  it('records assumptions for missing optional inputs', () => {
    const f = loadFixture('case-b');
    const calc = calculate(
      toInput({ ...f, company: { ...f.company, monthlyLabor: null, monthlyFixed: null, loanMonthlyRepay: null, loanShortTerm: null, ordinaryProfit: null }, officer: { ...f.officer, plannedRetireAge: null, legalHeirs: null } }),
      S,
    );
    const fields = calc.assumptions.map((a) => a.field).sort();
    expect(fields).toEqual(['legalHeirs', 'loanMonthlyRepay', 'loanShortTerm', 'monthlyFixed', 'monthlyLabor', 'ordinaryProfit', 'plannedRetireAge']);
    expect(calc.coverage.methodB.assumed).toBe(true);
    expect(calc.retirement.yearsToRetire.value).toBe(25);
    expect(calc.budget.assumed).toBe(true);
    expect(calc.budget.min.value).toBe(100); // 20,000 × 0.5%
    expect(calc.budget.max.value).toBe(400);
  });
  it('gap is never negative', () => {
    const f = loadFixture('case-b');
    const calc = calculate(toInput({ ...f, existingPolicies: [{ category: 'TERM_LOW_CV', deathBenefit: 99999 }] }), S);
    expect(calc.coverage.gap.value).toBe(0);
  });
});

describe('formatMan', () => {
  it('formats oku/man', () => {
    expect(formatMan(67751)).toBe('6億7,751万円');
    expect(formatMan(12000)).toBe('1億2,000万円');
    expect(formatMan(20000)).toBe('2億円');
    expect(formatMan(900)).toBe('900万円');
  });
});

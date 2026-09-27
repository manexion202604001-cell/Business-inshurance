import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS as S,
  incrementalSalaryTax,
  inflate,
  progressiveIncomeTax,
  realValue,
  retirementIncomeDeduction,
  separateIncomeTaxTotal,
  taxableRetirementIncome,
  calcRetirement,
} from '../src';

describe('inflation (§7.3 / §7.5)', () => {
  it('3,600万円 at 2.0% for 20 years ≈ 5,349万円 (diff ≈ 1,749)', () => {
    const v = Math.round(inflate(3600, 0.02, 20));
    expect(v).toBe(5349);
    expect(v - 3600).toBe(1749);
  });
  it('real value of 1,000万円 at 2.0%: 10y≈820, 20y≈673, 30y≈552', () => {
    expect(Math.round(realValue(1000, 0.02, 10))).toBe(820);
    expect(Math.round(realValue(1000, 0.02, 20))).toBe(673);
    expect(Math.round(realValue(1000, 0.02, 30))).toBe(552);
  });
  it('negative years are treated as zero', () => {
    expect(inflate(100, 0.02, -3)).toBe(100);
  });
});

describe('retirement income deduction', () => {
  it.each([
    [1, 80],
    [2, 80],
    [3, 120],
    [20, 800],
    [21, 870],
    [30, 1500],
  ])('%i years -> %i', (years, expected) => {
    expect(retirementIncomeDeduction(years)).toBe(expected);
  });
  it('rounds partial years up', () => {
    expect(retirementIncomeDeduction(20.2)).toBe(870);
  });
});

describe('taxable retirement income', () => {
  it('applies the 1/2 rule', () => {
    expect(taxableRetirementIncome(13500, 30)).toBe(6000);
  });
  it('officers with tenure <= 5 years do not get 1/2', () => {
    expect(taxableRetirementIncome(1000, 5)).toBe(800);
    expect(taxableRetirementIncome(1000, 6)).toBe((1000 - 240) / 2);
  });
  it('never negative', () => {
    expect(taxableRetirementIncome(50, 10)).toBe(0);
  });
});

describe('income tax', () => {
  it('uses the quick calculation table', () => {
    expect(progressiveIncomeTax(0, S.incomeTaxBrackets)).toBe(0);
    expect(progressiveIncomeTax(195, S.incomeTaxBrackets)).toBeCloseTo(9.75);
    expect(progressiveIncomeTax(1000, S.incomeTaxBrackets)).toBeCloseTo(176.4);
    expect(progressiveIncomeTax(6000, S.incomeTaxBrackets)).toBeCloseTo(2220.4);
  });
  it('separate taxation includes surtax and resident tax', () => {
    expect(separateIncomeTaxTotal(1000, S)).toBeCloseTo(176.4 * 1.021 + 100);
  });
  it('salary route costs more than the retirement route', () => {
    const r = calcRetirement({ monthlyPay: 150, tenureYears: 20, age: 58, retireAge: 68, multiplier: 3, retireAgeAssumed: false, s: S });
    expect(r.taxIfSalary.value).toBeGreaterThan(r.taxOnRetirement.value);
    expect(r.netVsSalary.value).toBe(r.taxIfSalary.value - r.taxOnRetirement.value);
    expect(incrementalSalaryTax(1800, 0, S)).toBe(0);
  });
  it('flags special officers', () => {
    const r = calcRetirement({ monthlyPay: 100, tenureYears: 2, age: 50, retireAge: 53, multiplier: 3, retireAgeAssumed: false, s: S });
    expect(r.specialOfficer).toBe(true);
    expect(r.taxable.formula).toContain('1/2課税なし');
  });
});

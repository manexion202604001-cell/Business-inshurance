import { inflationAdjusted } from './inflation';
import { money, round } from './money';
import type { EngineSettings, Money, TaxBracket } from './types';

/** 退職所得控除額（万円） */
export function retirementIncomeDeduction(tenureYears: number): number {
  const n = Math.max(1, Math.ceil(tenureYears));
  if (n <= 20) return Math.max(80, 40 * n);
  return 800 + 70 * (n - 20);
}

/**
 * 課税退職所得（万円）
 * Officers with tenure <= 5 years (特定役員退職手当等) do not get the 1/2 treatment.
 */
export function taxableRetirementIncome(amount: number, tenureYears: number, isOfficer = true): number {
  const base = Math.max(0, amount - retirementIncomeDeduction(tenureYears));
  const special = isOfficer && tenureYears <= 5;
  return special ? base : base / 2;
}

/** Progressive income tax (所得税, before reconstruction surtax) on a taxable income in 万円. */
export function progressiveIncomeTax(taxable: number, brackets: TaxBracket[]): number {
  if (taxable <= 0) return 0;
  for (const b of brackets) {
    if (b.upTo === null || taxable <= b.upTo) return taxable * b.rate - b.deduction;
  }
  const last = brackets[brackets.length - 1];
  return last ? taxable * last.rate - last.deduction : 0;
}

/** Income tax incl. reconstruction surtax + resident tax on a separately-taxed income. */
export function separateIncomeTaxTotal(taxable: number, s: EngineSettings): number {
  const it = progressiveIncomeTax(taxable, s.incomeTaxBrackets) * (1 + s.reconstructionSurtaxRate);
  return it + taxable * s.residentTaxRate;
}

/**
 * Incremental tax when `extra` is paid on top of the officer's annual salary.
 * Simplified: 給与所得控除 is assumed to have reached its cap and only 基礎控除 is considered.
 */
export function incrementalSalaryTax(annualPay: number, extra: number, s: EngineSettings): number {
  const base = Math.max(0, annualPay - s.salaryDeductionCap - s.basicDeduction);
  const itBefore = progressiveIncomeTax(base, s.incomeTaxBrackets);
  const itAfter = progressiveIncomeTax(base + extra, s.incomeTaxBrackets);
  return (itAfter - itBefore) * (1 + s.reconstructionSurtaxRate) + extra * s.residentTaxRate;
}

export interface RetirementCalc {
  yearsToRetire: Money;
  totalTenure: Money;
  multiplier: Money;
  target: Money;
  inflationAdjusted: Money;
  inflationDiff: Money;
  deduction: Money;
  taxable: Money;
  taxOnRetirement: Money;
  taxIfSalary: Money;
  netVsSalary: Money;
  specialOfficer: boolean;
}

export function calcRetirement(params: {
  monthlyPay: number;
  tenureYears: number;
  age: number;
  retireAge: number;
  multiplier: number;
  retireAgeAssumed: boolean;
  s: EngineSettings;
}): RetirementCalc {
  const { monthlyPay, tenureYears, age, retireAge, multiplier, retireAgeAssumed, s } = params;
  const years = Math.max(0, retireAge - age);
  const yearsToRetire = money('calc.retirement.yearsToRetire', years, `勇退予定 ${retireAge}歳 − 現在 ${age}歳`, { retireAge, age }, { unit: '年', assumed: retireAgeAssumed });
  const total = tenureYears + years;
  const totalTenure = money('calc.retirement.totalTenure', total, `在任 ${tenureYears}年 ＋ 勇退までの ${years}年`, { tenureYears, years }, { unit: '年', assumed: retireAgeAssumed });
  const mult = money('calc.retirement.multiplier', multiplier, '役位別の功績倍率', { multiplier }, { unit: '倍', raw: true, source: '企業経営と生命保険に関する調査（功績倍率）' });
  const target = money(
    'calc.retirement.target',
    monthlyPay * total * multiplier,
    `報酬月額 ${monthlyPay.toLocaleString('ja-JP')}万円 ×（在任 ${tenureYears}年＋勇退までの ${years}年）× 功績倍率 ${multiplier.toFixed(1)}倍`,
    { monthlyPay, totalTenure: total, multiplier },
    { assumed: retireAgeAssumed, source: '功績倍率方式' },
  );
  const infl = inflationAdjusted('calc.retirement.inflationAdjusted', target, s.inflationRate, years);
  const inflationDiff = money('calc.retirement.inflationDiff', infl.value - target.value, 'インフレ調整後の勇退退職金 − 勇退退職金（現在価値）', { adjusted: infl.value, target: target.value });
  const ded = retirementIncomeDeduction(total);
  const deduction = money(
    'calc.retirement.deduction',
    ded,
    total <= 20 ? `40万円 × 勤続 ${total}年（最低80万円）` : `800万円 ＋ 70万円 ×（勤続 ${total}年 − 20年）`,
    { tenure: total },
    { source: '所得税法30条（退職所得控除）' },
  );
  const specialOfficer = total <= 5;
  const taxableValue = taxableRetirementIncome(target.value, total, true);
  const taxable = money(
    'calc.retirement.taxable',
    taxableValue,
    specialOfficer ? '（勇退退職金 − 退職所得控除）※勤続5年以下の役員のため1/2課税なし' : '（勇退退職金 − 退職所得控除）× 1/2',
    { target: target.value, deduction: ded },
    { source: '所得税法30条（分離課税・1/2課税）' },
  );
  const taxOnRet = separateIncomeTaxTotal(taxable.value, s);
  const taxOnRetirement = money('calc.retirement.taxOnRetirement', taxOnRet, '課税退職所得に対する所得税（復興特別所得税含む）＋住民税（概算）', { taxable: taxable.value });
  const salaryTax = incrementalSalaryTax(monthlyPay * 12, target.value, s);
  const taxIfSalary = money('calc.retirement.taxIfSalary', salaryTax, '同額を役員報酬に上乗せして受け取った場合の所得税＋住民税の増加額（概算・社会保険料は考慮外）', { annualPay: monthlyPay * 12, extra: target.value });
  const netVsSalary = money('calc.retirement.netVsSalary', round(salaryTax) - round(taxOnRet), '役員報酬で受け取った場合の税負担 − 退職金で受け取った場合の税負担', { taxIfSalary: round(salaryTax), taxOnRetirement: round(taxOnRet) });
  return { yearsToRetire, totalTenure, multiplier: mult, target, inflationAdjusted: infl, inflationDiff, deduction, taxable, taxOnRetirement, taxIfSalary, netVsSalary, specialOfficer };
}

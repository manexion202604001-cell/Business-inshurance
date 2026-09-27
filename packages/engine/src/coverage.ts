import { money, round } from './money';
import type { Assumption, CaseInput, EngineSettings, Money } from './types';

export interface CoverageInputsResolved {
  monthlyLabor: number;
  monthlyFixed: number;
  loanMonthlyRepay: number;
  loanShortTerm: number;
  legalHeirs: number;
}

/** Resolve optional inputs, recording assumptions for anything that had to be defaulted. */
export function resolveCoverageInputs(
  input: CaseInput,
  s: EngineSettings,
  assumptions: Assumption[],
): CoverageInputsResolved {
  const c = input.company;
  const monthlyLabor =
    c.monthlyLabor ?? pushAssumption(assumptions, 'monthlyLabor', '月間人件費', round((c.revenue * s.laborToRevenueFallback) / 12), '万円',
      `未入力のため 年商×${(s.laborToRevenueFallback * 100).toFixed(0)}%÷12か月 で仮置き`);
  const monthlyFixed =
    c.monthlyFixed ?? pushAssumption(assumptions, 'monthlyFixed', '月間その他固定費', round((c.revenue * s.fixedToRevenueFallback) / 12), '万円',
      `未入力のため 年商×${(s.fixedToRevenueFallback * 100).toFixed(0)}%÷12か月 で仮置き`);
  const loanMonthlyRepay =
    c.loanMonthlyRepay ?? pushAssumption(assumptions, 'loanMonthlyRepay', '月々の借入返済額', round(c.loanTotal / (s.loanRepayYearsFallback * 12)), '万円',
      `未入力のため 借入金残高を${s.loanRepayYearsFallback}年で均等返済すると仮定して仮置き`);
  const loanShortTerm =
    c.loanShortTerm ?? pushAssumption(assumptions, 'loanShortTerm', '一括返済が必要になり得る借入金・営業債務', 0, '万円',
      '未入力のため 0 で仮置き（ヒアリングで確認してください）');
  const legalHeirs =
    input.officer.legalHeirs ?? pushAssumption(assumptions, 'legalHeirs', '法定相続人数', s.defaultLegalHeirs, '人',
      `未入力のため ${s.defaultLegalHeirs}人 で仮置き`);
  return { monthlyLabor, monthlyFixed, loanMonthlyRepay, loanShortTerm, legalHeirs };
}

function pushAssumption(
  list: Assumption[],
  field: string,
  label: string,
  value: number,
  unit: Assumption['unit'],
  reason: string,
): number {
  list.push({ field, label, value, unit, reason });
  return value;
}

/** 方式A：積上げ方式（出典：経営者のリスク） */
export function coverageMethodA(
  loanTotal: number,
  monthlyLabor: number,
  s: EngineSettings,
  assumed = false,
): { total: Money; loan: Money; rebuild: Money; taxReserve: Money } {
  const loan = money('calc.coverage.methodA.loan', loanTotal, '金融機関借入金＋買掛金など', { loanTotal });
  const rebuild = money(
    'calc.coverage.methodA.rebuild',
    monthlyLabor * s.rebuildMonths,
    `月間人件費 ${monthlyLabor.toLocaleString('ja-JP')}万円 × ${s.rebuildMonths}か月`,
    { monthlyLabor, months: s.rebuildMonths },
    { assumed },
  );
  const t = s.effectiveTaxRate;
  const taxRaw = ((loan.value + rebuild.value) / (1 - t)) * t;
  const taxReserve = money(
    'calc.coverage.methodA.taxReserve',
    taxRaw,
    `（借入金相当額＋経営立て直し資金）÷（1−実効税率${(t * 100).toFixed(2)}%）× 実効税率`,
    { base: loan.value + rebuild.value, effectiveTaxRate: t * 100 },
    { assumed },
  );
  const total = money(
    'calc.coverage.methodA',
    loan.value + rebuild.value + taxReserve.value,
    '借入金相当額＋経営立て直し資金＋納税準備資金',
    { loan: loan.value, rebuild: rebuild.value, taxReserve: taxReserve.value },
    { source: '経営者のリスク（積上げ方式）', assumed },
  );
  return { total, loan, rebuild, taxReserve };
}

/** 方式B：運転資金方式（出典：変額保険（定期型）資料の例示） */
export function coverageMethodB(
  monthlyLabor: number,
  monthlyFixed: number,
  loanMonthlyRepay: number,
  loanShortTerm: number,
  s: EngineSettings,
  assumed = false,
): { total: Money; workingCapital: Money; repayment: Money; lumpSum: Money } {
  const m = s.workingCapitalMonths;
  const workingCapital = money(
    'calc.coverage.methodB.workingCapital',
    (monthlyLabor + monthlyFixed) * m,
    `（月間人件費 ${monthlyLabor.toLocaleString('ja-JP')}万円＋その他固定費 ${monthlyFixed.toLocaleString('ja-JP')}万円）× ${m}か月`,
    { monthlyLabor, monthlyFixed, months: m },
    { assumed },
  );
  const repayment = money(
    'calc.coverage.methodB.repayment',
    loanMonthlyRepay * m,
    `月々の借入返済額 ${loanMonthlyRepay.toLocaleString('ja-JP')}万円 × ${m}か月`,
    { loanMonthlyRepay, months: m },
    { assumed },
  );
  const lumpSum = money(
    'calc.coverage.methodB.lumpSum',
    loanShortTerm,
    '一括返済が必要になり得る借入金・営業債務',
    { loanShortTerm },
    { assumed },
  );
  const total = money(
    'calc.coverage.methodB',
    workingCapital.value + repayment.value + lumpSum.value,
    '当面の運転資金＋借入金の返済資金＋一括返済が必要な借入金・営業債務',
    { workingCapital: workingCapital.value, repayment: repayment.value, lumpSum: lumpSum.value },
    { source: '変額保険（定期型）資料の例示（運転資金方式）', assumed },
  );
  return { total, workingCapital, repayment, lumpSum };
}

/** 死亡退職金 = 最終報酬月額 × 役員在任年数 × 功績倍率 */
export function deathRetirement(monthlyPay: number, tenureYears: number, multiplier: number): Money {
  return money(
    'calc.coverage.deathRetirement',
    monthlyPay * tenureYears * multiplier,
    `最終報酬月額 ${monthlyPay.toLocaleString('ja-JP')}万円 × 在任 ${tenureYears}年 × 功績倍率 ${multiplier.toFixed(1)}倍`,
    { monthlyPay, tenureYears, multiplier },
    { source: '功績倍率方式' },
  );
}

/** 弔慰金 = 最終報酬月額 × 36か月（業務上） / 6か月（業務外） */
export function condolence(monthlyPay: number, months: number, calcId: string, onDuty: boolean): Money {
  return money(
    calcId,
    monthlyPay * months,
    `最終報酬月額 ${monthlyPay.toLocaleString('ja-JP')}万円 × ${months}か月（${onDuty ? '業務上' : '業務外'}の死亡）`,
    { monthlyPay, months },
    { source: '相続税法基本通達3-20' },
  );
}

/** 死亡退職金の相続税非課税枠 = 500万円 × 法定相続人数 */
export function inheritanceExempt(perHeir: number, heirs: number, assumed = false): Money {
  return money(
    'calc.coverage.inheritanceExempt',
    perHeir * heirs,
    `${perHeir}万円 × 法定相続人 ${heirs}人`,
    { perHeir, heirs },
    { source: '相続税法12条1項6号', assumed },
  );
}

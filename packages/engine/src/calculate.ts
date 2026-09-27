import { calcBudget } from './budget';
import {
  condolence,
  coverageMethodA,
  coverageMethodB,
  deathRetirement,
  inheritanceExempt,
  resolveCoverageInputs,
} from './coverage';
import { money, roundTo } from './money';
import { calcRetirement } from './retirement';
import type { Assumption, CalcResult, CaseInput, CategoryInfo, EngineSettings } from './types';

export function calculate(input: CaseInput, s: EngineSettings): CalcResult {
  const assumptions: Assumption[] = [];
  const { company: c, officer: o } = input;
  const r = resolveCoverageInputs(input, s, assumptions);
  const assumedField = (f: string) => assumptions.some((a) => a.field === f);

  const a = coverageMethodA(c.loanTotal, r.monthlyLabor, s, assumedField('monthlyLabor'));
  const b = coverageMethodB(
    r.monthlyLabor,
    r.monthlyFixed,
    r.loanMonthlyRepay,
    r.loanShortTerm,
    s,
    ['monthlyLabor', 'monthlyFixed', 'loanMonthlyRepay', 'loanShortTerm'].some(assumedField),
  );
  const multiplier = s.meritMultipliers[o.role] ?? s.meritMultipliers['取締役'];
  const dr = deathRetirement(o.monthlyPay, o.tenureYears, multiplier);
  const onDuty = Boolean(input.signals.onDutyDeath);
  const cond = condolence(o.monthlyPay, onDuty ? s.condolenceMonthsOnDuty : s.condolenceMonthsOffDuty, 'calc.coverage.condolence', onDuty);
  const condOnDuty = condolence(o.monthlyPay, s.condolenceMonthsOnDuty, 'calc.coverage.condolenceOnDuty', true);
  const exempt = inheritanceExempt(s.inheritanceExemptPerHeir, r.legalHeirs, assumedField('legalHeirs'));

  const adopted = s.adoptedMethod;
  const bf = adopted === 'A' ? a.total : b.total;
  const businessFund = money('calc.coverage.businessFund', bf.value, `事業保障資金（${adopted === 'A' ? '積上げ方式' : '運転資金方式'}を採用）`, { value: bf.value }, { assumed: bf.assumed });
  const required = money(
    'calc.coverage.required',
    businessFund.value + dr.value + cond.value,
    '事業保障資金＋死亡退職金＋弔慰金',
    { businessFund: businessFund.value, deathRetirement: dr.value, condolence: cond.value },
    { assumed: bf.assumed },
  );
  const existingTotal = input.existingPolicies.reduce((sum, p) => sum + (p.deathBenefit ?? 0), 0);
  const existing = money('calc.coverage.existing', existingTotal, '既存保険の死亡保障の合計', { count: input.existingPolicies.length });
  const gap = money('calc.coverage.gap', Math.max(0, required.value - existing.value), 'max（0，必要保障額 − 既存保障）', { required: required.value, existing: existing.value }, { assumed: bf.assumed });

  const retireAgeAssumed = o.plannedRetireAge == null;
  const retireAge = o.plannedRetireAge ?? Math.max(s.defaultRetireAge, o.age + 1);
  if (retireAgeAssumed) {
    assumptions.push({ field: 'plannedRetireAge', label: '勇退予定年齢', value: retireAge, unit: '歳', reason: `未入力のため ${retireAge}歳 で仮置き` });
  }
  const ret = calcRetirement({ monthlyPay: o.monthlyPay, tenureYears: o.tenureYears, age: o.age, retireAge, multiplier, retireAgeAssumed, s });

  const budget = calcBudget(c.revenue, c.ordinaryProfit, s);
  if (budget.assumed && budget.reason) {
    assumptions.push({ field: 'ordinaryProfit', label: '保険料予算の目安', value: budget.min.value, unit: '万円', reason: `${budget.reason} 年商を基準に仮置き` });
  }

  const loanToRevenue = money('calc.ratios.loanToRevenue', c.revenue > 0 ? roundTo((c.loanTotal / c.revenue) * 100, 1) : 0, '借入金 ÷ 年商', { loanTotal: c.loanTotal, revenue: c.revenue }, { unit: '%', raw: true });
  const profitMargin =
    c.ordinaryProfit != null && c.revenue > 0
      ? money('calc.ratios.profitMargin', roundTo((c.ordinaryProfit / c.revenue) * 100, 1), '経常利益 ÷ 年商', { ordinaryProfit: c.ordinaryProfit, revenue: c.revenue }, { unit: '%', raw: true })
      : null;

  return {
    coverage: {
      methodA: a.total,
      methodAParts: { loan: a.loan, rebuild: a.rebuild, taxReserve: a.taxReserve },
      methodB: b.total,
      methodBParts: { workingCapital: b.workingCapital, repayment: b.repayment, lumpSum: b.lumpSum },
      adopted,
      businessFund,
      deathRetirement: dr,
      condolence: cond,
      condolenceOnDuty: condOnDuty,
      inheritanceExempt: exempt,
      required,
      existing,
      gap,
    },
    retirement: ret,
    budget: { min: budget.min, balanced: budget.balanced, max: budget.max, assumed: budget.assumed },
    ratios: { loanToRevenue, profitMargin },
    assumptions,
    asOf: s.asOf,
  };
}

/** Build the fact object that logic rules are evaluated against. */
export function buildFacts(input: CaseInput, calc: CalcResult, categories: CategoryInfo[], s: EngineSettings): Record<string, unknown> {
  const { company: c, officer: o } = input;
  const retireAge = o.age + calc.retirement.yearsToRetire.value;
  const retirementCats = new Set(categories.filter((x) => x.retirementFunding).map((x) => x.code));
  const retirementPrepared =
    input.signals.officerRetirementPrepared === true ||
    input.existingPolicies.some((p) => retirementCats.has(p.category) || /退職/.test(p.purpose ?? ''));
  const employeeRetirementPrepared =
    input.signals.employeeRetirementPrepared === true || input.existingPolicies.some((p) => p.category === 'ENDOWMENT_HALF');
  const misalignments = input.existingPolicies
    .filter((p) => p.issueAge != null && p.peakYear != null)
    .map((p) => Math.abs((p.issueAge as number) + (p.peakYear as number) - retireAge));
  const peakAges = input.existingPolicies.filter((p) => p.issueAge != null && p.peakYear != null).map((p) => (p.issueAge as number) + (p.peakYear as number));
  return {
    revenue: c.revenue,
    ordinaryProfit: c.ordinaryProfit ?? null,
    loanTotal: c.loanTotal,
    loanToRevenue: c.revenue > 0 ? c.loanTotal / c.revenue : null,
    profitMargin: c.ordinaryProfit != null && c.revenue > 0 ? c.ordinaryProfit / c.revenue : null,
    netAssets: c.netAssets ?? null,
    netAssetsToRevenue: c.netAssets != null && c.revenue > 0 ? c.netAssets / c.revenue : null,
    employeeCount: c.employeeCount,
    guaranteesLoan: Boolean(o.guaranteesLoan),
    ceoAge: o.age,
    ceoRole: o.role,
    retireAge,
    yearsToRetire: calc.retirement.yearsToRetire.value,
    gap: calc.coverage.gap.value,
    required: calc.coverage.required.value,
    existing: calc.coverage.existing.value,
    retirementPrepared,
    employeeRetirementPrepared,
    deficit: Boolean(input.signals.deficitMentioned) || (c.ordinaryProfit != null && c.ordinaryProfit < 0),
    tags: input.signals.issueTags,
    peakMisalignment: misalignments.length ? Math.max(...misalignments) : null,
    existingPeakAge: peakAges.length ? peakAges[0] : null,
    peakMisalignmentThreshold: s.peakMisalignmentYears,
    hasExistingPolicies: input.existingPolicies.length > 0,
  };
}

import { formatMan, money, round } from './money';
import { benefitForBudget, estimatePremium, lookupRate, type RateLookup } from './premium';
import type { RuleEvaluation } from './rules';
import { classifyTaxBucket, TAX_BUCKET_LABEL, taxSchedule } from './tax';
import type {
  CalcResult,
  CaseInput,
  CategoryInfo,
  EngineSettings,
  Money,
  Plan,
  PlanComponent,
  PlanSet,
  ReferenceRate,
  Tier,
} from './types';

export const TIER_LETTER: Record<Tier, string> = { MIN: 'A', BALANCED: 'B', MAX: 'C' };
export const TIER_NAME: Record<Tier, string> = { MIN: '最小プラン', BALANCED: 'バランス型プラン', MAX: '最大活用型プラン' };

const PROTECTION_CANDIDATES = ['TERM_DECREASING', 'TERM_LOW_CV'];
const RETIREMENT_CANDIDATES = ['TERM_LEVEL_LONG', 'VARIABLE_TERM'];

interface Ctx {
  input: CaseInput;
  calc: CalcResult;
  ev: RuleEvaluation;
  categories: CategoryInfo[];
  rates: ReferenceRate[];
  s: EngineSettings;
  retireAge: number;
}

const ceilStep = (v: number, step: number) => (v <= 0 ? 0 : Math.ceil(v / step) * step);
const floorStep = (v: number, step: number) => (v <= 0 ? 0 : Math.floor(v / step) * step);

function catName(ctx: Ctx, code: string): string {
  return ctx.categories.find((c) => c.code === code)?.name ?? code;
}

function lookup(ctx: Ctx, code: string, opts: { termToAge?: number; preferPeakAge?: number }): RateLookup | null {
  const o = ctx.input.officer;
  return lookupRate(ctx.rates, { category: code, sex: o.sex, age: o.age, ...opts });
}

function protectionTerm(ctx: Ctx): number {
  return Math.max(ctx.retireAge + ctx.s.protectionTermExtra, ctx.input.officer.age + 10);
}

/** Choose the protection category. MIN prefers the cheapest among the top-scored candidates. */
function chooseProtection(ctx: Ctx, cheapest: boolean): string {
  const scored = PROTECTION_CANDIDATES.map((code) => ({
    code,
    score: ctx.ev.scores[code] ?? 0,
    per1000: lookup(ctx, code, { termToAge: protectionTerm(ctx) })?.per1000 ?? Infinity,
  }));
  scored.sort((a, b) => {
    if (cheapest && Number.isFinite(a.per1000) && Number.isFinite(b.per1000) && Math.abs(b.score - a.score) <= 1) return a.per1000 - b.per1000;
    return b.score - a.score || (a.code === 'TERM_LOW_CV' ? -1 : 1);
  });
  return scored[0]!.code;
}

function chooseRetirement(ctx: Ctx): string {
  const scored = RETIREMENT_CANDIDATES.map((code) => ({ code, score: ctx.ev.scores[code] ?? 0 }));
  scored.sort((a, b) => b.score - a.score || (a.code === 'TERM_LEVEL_LONG' ? -1 : 1));
  return scored[0]!.code;
}

function makeComponent(
  ctx: Ctx,
  tier: Tier,
  code: string,
  role: PlanComponent['role'],
  benefit: number,
  purpose: string,
  opts: { termToAge?: number; preferPeakAge?: number; lk?: RateLookup | null },
): PlanComponent {
  const o = ctx.input.officer;
  const lk = opts.lk !== undefined ? opts.lk : lookup(ctx, code, opts);
  const termToAge = lk?.termToAge ?? opts.termToAge ?? protectionTerm(ctx);
  const idBase = `plan.${tier}.${code}`;
  const deathBenefit = money(`${idBase}.deathBenefit`, benefit, role === 'third_sector' ? '役員報酬月額 × 月数（就業不能時の保障の目安）' : role === 'welfare' ? '従業員1名あたりの保障額 × 従業員数' : '3案の割付方針に基づく保障額', { benefit });
  const premiumEstimate = lk && benefit > 0 ? estimatePremium(idBase, benefit, lk) : 'DESIGN_SHEET_REQUIRED';
  const peakRate = lk?.peakReturnRate ?? null;
  const peakYear = lk?.peakYear ?? null;
  let taxBucket: PlanComponent['taxBucket'] = null;
  let taxTreatment: string;
  let taxDetail: PlanComponent['taxDetail'] = null;
  if (code === 'WHOLE_LIFE') {
    taxTreatment = '終身保険：原則として支払保険料の全額を資産計上';
  } else if (code === 'ENDOWMENT_HALF') {
    taxTreatment = '養老保険（福利厚生プラン）：普遍的加入等の要件を満たす場合、保険料の1/2を資産計上・1/2を損金算入';
  } else if (peakRate != null) {
    taxBucket = classifyTaxBucket(peakRate);
    taxTreatment = TAX_BUCKET_LABEL[taxBucket];
    if (premiumEstimate !== 'DESIGN_SHEET_REQUIRED') {
      const sched = taxSchedule({
        annualPremium: premiumEstimate.mid.value,
        termYears: Math.max(1, termToAge - o.age),
        peakReturnRate: peakRate,
        ...(peakYear != null ? { peakRateYear: peakYear } : {}),
      });
      const first = sched.rows[0];
      const last = sched.rows[sched.rows.length - 1];
      taxDetail = {
        summary: sched.fullyDeductible ? (sched.fullyDeductibleReason ?? sched.summary) : sched.summary,
        fullyDeductible: sched.fullyDeductible,
        assetPeriodYears: sched.assetPeriodYears,
        reversalStartYear: sched.reversalStartYear,
        firstYearAsset: round(first?.asset ?? 0),
        firstYearExpense: round(first?.expense ?? 0),
        lastYearExpense: round(last?.expense ?? 0),
        lastYearReversal: round(last?.reversal ?? 0),
      };
      if (sched.fullyDeductible) taxTreatment = sched.fullyDeductibleReason ?? taxTreatment;
    }
  } else {
    taxTreatment = '最高解約返戻率により区分が決まります（設計書で確認）';
  }
  const peakCashValue =
    premiumEstimate !== 'DESIGN_SHEET_REQUIRED' && peakRate != null && peakYear != null && peakRate > 0
      ? money(`${idBase}.peakCashValue`, premiumEstimate.mid.value * peakYear * (peakRate / 100), `参考保険料 ${premiumEstimate.mid.value.toLocaleString('ja-JP')}万円 × ${peakYear}年 × 返戻率 ${peakRate.toFixed(1)}%`, { premium: premiumEstimate.mid.value, peakYear, peakRate }, { source: premiumEstimate.rateSource })
      : null;
  return {
    categoryCode: code,
    label: `${catName(ctx, code)}${TIER_LETTER[tier]}プラン`,
    role,
    deathBenefit,
    termToAge,
    purpose,
    premiumEstimate,
    taxBucket,
    taxTreatment,
    peakReturnRate: peakRate,
    peakYear,
    peakAge: peakYear != null ? o.age + peakYear : null,
    peakCashValue,
    taxDetail,
  };
}

/** Death benefit so that the estimated peak surrender value reaches `targetCv`. */
function benefitForCashValue(lk: RateLookup | null, targetCv: number, step: number): number | null {
  if (!lk || lk.peakReturnRate == null || lk.peakYear == null || lk.peakReturnRate <= 0) return null;
  const cvPer1000 = lk.per1000 * lk.peakYear * (lk.peakReturnRate / 100);
  if (cvPer1000 <= 0) return null;
  return ceilStep((targetCv / cvPer1000) * 1000, step);
}

function premiumOf(c: PlanComponent): number | null {
  return c.premiumEstimate === 'DESIGN_SHEET_REQUIRED' ? null : c.premiumEstimate.mid.value;
}

function officerDeathBenefit(components: PlanComponent[]): number {
  return components.filter((c) => c.role === 'protection' || c.role === 'retirement' || c.role === 'succession').reduce((s, c) => s + c.deathBenefit.value, 0);
}

function finalizePlan(ctx: Ctx, tier: Tier, title: string, concept: string, components: PlanComponent[], cap: Money, reduced: boolean, notes: string[], ruleHits: string[], fullPremium: number | null = null): Plan {
  const required = ctx.calc.coverage.required.value;
  const covered = ctx.calc.coverage.existing.value + officerDeathBenefit(components);
  const ratio = required > 0 ? covered / required : 1;
  const premiums = components.map(premiumOf);
  const known = premiums.filter((p): p is number => p != null);
  const totalPremium = known.length
    ? money(`plan.${tier}.totalPremium`, known.reduce((a, b) => a + b, 0), '各構成の参考年払保険料の合計', Object.fromEntries(components.map((c, i) => [c.categoryCode, premiums[i] ?? 0])))
    : null;
  if (known.length < premiums.length) notes.push('一部の構成は参考料率がないため、保険料は設計書にて提示します');
  const retTarget = ctx.calc.retirement.inflationAdjusted.value;
  const cv = components.filter((c) => c.role === 'retirement').reduce((s, c) => s + (c.peakCashValue?.value ?? 0), 0);
  return {
    tier,
    title,
    concept,
    components: components.filter((c) => c.deathBenefit.value > 0),
    coverageRatio: Math.round(ratio * 1000) / 1000,
    coverageRatioMoney: money(`plan.${tier}.coverageRatio`, Math.round(ratio * 1000) / 10, '（既存保障＋本プランの死亡保障）÷ 必要保障額', { covered, required }, { unit: '%', raw: true }),
    totalDeathBenefit: money(`plan.${tier}.totalDeathBenefit`, officerDeathBenefit(components), '本プランの死亡保障の合計（役員）', { count: components.length }),
    totalPremium,
    budgetCap: cap,
    reducedForBudget: reduced,
    fullPremium: reduced && fullPremium != null ? money(`plan.${tier}.fullPremium`, fullPremium, '保険料の目安に合わせて調整する前の構成の参考保険料', { fullPremium: round(fullPremium) }) : null,
    retirementFundRatio: cv > 0 && retTarget > 0 ? Math.round((cv / retTarget) * 1000) / 1000 : null,
    ruleHits,
    notes,
  };
}

const totalPremium = (cs: PlanComponent[]) => cs.reduce((sum, c) => sum + (premiumOf(c) ?? 0), 0);

const per1000Of = (c: PlanComponent | undefined): number | null => {
  const prem = c ? premiumOf(c) : null;
  return c && prem != null && c.deathBenefit.value > 0 ? (prem / c.deathBenefit.value) * 1000 : null;
};

/**
 * Budget fitting that keeps each plan's character:
 * - add-ons may use up to `addOnShare` of the cap (scaled down otherwise),
 * - the retirement funding may use up to `retShare` of the remaining budget, or more if the
 *   protection for the gap is already fully funded,
 * - the protection gets the rest (up to the gap).
 * `build(retirementBenefit, addOnScale, protectionOverride)` returns the components.
 */
function fitWithShares(
  ctx: Ctx,
  cap: number,
  desiredRetirement: number,
  shares: { retShare: number; addOnShare: number },
  build: (ret: number, addOnScale: number | number[], protOverride: number | null) => PlanComponent[],
): { comps: PlanComponent[]; reduced: boolean; fullPremium: number } {
  const step = ctx.s.coverageStep;
  const full = build(desiredRetirement, 1, null);
  const fullPremium = totalPremium(full);
  if (cap <= 0 || fullPremium <= cap) return { comps: full, reduced: false, fullPremium };

  const isAddOn = (c: PlanComponent) => c.role === 'third_sector' || c.role === 'welfare' || c.role === 'succession';
  // Greedy per add-on: keep the earlier (higher-priority) add-ons at the largest scale that fits.
  const addOnCount = full.filter(isAddOn).length;
  const addOnBudget = cap * shares.addOnShare;
  const addOnScale: number[] = [];
  for (let i = 0; i < addOnCount; i++) {
    let picked = 0;
    for (const sc of [1, 0.75, 0.5, 0.25]) {
      const trial = [...addOnScale, sc];
      const prem = totalPremium(build(0, trial, 0).filter(isAddOn));
      if (prem <= addOnBudget) {
        picked = sc;
        break;
      }
    }
    addOnScale.push(picked);
  }
  const addOnPremium = totalPremium(build(0, addOnScale, 0).filter(isAddOn));
  const rest = Math.max(0, cap - addOnPremium);

  const protRate = per1000Of(full.find((c) => c.role === 'protection')) ?? per1000Of(build(0, addOnScale, null).find((c) => c.role === 'protection'));
  const retRate = per1000Of(full.find((c) => c.role === 'retirement'));
  const protNeed = (r: number) => {
    const probe = build(r, addOnScale, null).find((c) => c.role === 'protection');
    return probe?.deathBenefit.value ?? 0;
  };

  let chosenRet = 0;
  if (retRate != null && desiredRetirement > 0) {
    const retStep = Math.max(step, ceilStep(desiredRetirement / 40, step));
    for (let r = desiredRetirement; r > 0; r -= retStep) {
      const retPrem = (r / 1000) * retRate;
      const protFull = protRate != null ? (protNeed(r) / 1000) * protRate : 0;
      if (retPrem <= rest && retPrem <= Math.max(rest * shares.retShare, rest - protFull)) {
        chosenRet = r;
        break;
      }
    }
  }
  const retPrem = retRate != null ? (chosenRet / 1000) * retRate : 0;
  const need = protNeed(chosenRet);
  let prot = need;
  if (protRate != null) {
    const fit = benefitForBudget(rest - retPrem, protRate, step);
    if (fit < need) prot = Math.max(fit, Math.min(need, chosenRet > 0 ? 0 : ctx.s.minimumBenefit));
  }
  return { comps: build(chosenRet, addOnScale, prot), reduced: true, fullPremium };
}

function reducedNotes(notes: string[], cap: number, fullPremium: number, what: string) {
  notes.push(`保険料の目安（年${formatMan(cap)}）に収まるよう、${what}を調整しています`);
  if (fullPremium > cap) notes.push(`調整前の構成（満額で確保した場合）の参考保険料は年${formatMan(fullPremium)}です`);
}

export interface BuildPlansParams {
  input: CaseInput;
  calc: CalcResult;
  evaluation: RuleEvaluation;
  categories: CategoryInfo[];
  rates: ReferenceRate[];
  settings: EngineSettings;
}

export function buildPlans(p: BuildPlansParams): PlanSet {
  const ctx: Ctx = {
    input: p.input,
    calc: p.calc,
    ev: p.evaluation,
    categories: p.categories,
    rates: p.rates,
    s: p.settings,
    retireAge: p.input.officer.age + p.calc.retirement.yearsToRetire.value,
  };
  const hitIds = p.evaluation.hits.map((h) => h.id);
  return {
    plans: [buildMin(ctx, hitIds), buildBalanced(ctx, hitIds), buildMax(ctx, hitIds)],
    categoryScores: p.evaluation.scores,
    ruleHits: p.evaluation.hits,
    memoPoints: p.evaluation.memoPoints,
  };
}

function buildMin(ctx: Ctx, hits: string[]): Plan {
  const { calc, s, input } = ctx;
  const step = s.coverageStep;
  const gap = calc.coverage.gap.value;
  const cap = money('plan.MIN.budgetCap', calc.budget.min.value * ctx.ev.minBudgetFactor, ctx.ev.minBudgetFactor < 1 ? `最小プランの予算目安 × ${ctx.ev.minBudgetFactor}（資金繰りへの配慮）` : '最小プランの予算目安', { budget: calc.budget.min.value, factor: ctx.ev.minBudgetFactor });
  const notes: string[] = [];
  const ruleHits = hits.filter((h) => ['R01', 'R02', 'R07'].includes(h));

  if (gap <= 0) {
    // Existing coverage already meets the requirement: start with retirement funding within the MIN budget.
    const code = chooseRetirement(ctx);
    const lk = lookup(ctx, code, { preferPeakAge: ctx.retireAge });
    const benefit = lk ? Math.max(0, benefitForBudget(cap.value, lk.per1000, step)) : s.minimumBenefit;
    notes.push('既存の保険で必要保障額を満たしているため、退職金準備から着手する構成です');
    const comp = makeComponent(ctx, 'MIN', code, 'retirement', benefit, '勇退退職金の財源準備（返戻率のピークを勇退時期に合わせる）', { lk });
    return finalizePlan(ctx, 'MIN', `「既存の保障を活かす」${TIER_NAME.MIN}`, '既存の保障を土台に、無理のない保険料で退職金の財源づくりから始める', [comp], cap, false, notes, ruleHits);
  }

  const loanBased = input.company.loanTotal > 0;
  const priority = loanBased ? input.company.loanTotal : calc.coverage.methodBParts.workingCapital.value + calc.coverage.methodBParts.lumpSum.value;
  const target = ceilStep(Math.min(gap, priority), step);
  const code = chooseProtection(ctx, true);
  const lk = lookup(ctx, code, { termToAge: protectionTerm(ctx) });
  let benefit = target;
  let reduced = false;
  let fullMin: number | null = null;
  if (lk) {
    const fit = benefitForBudget(cap.value, lk.per1000, step);
    if (fit < target) {
      reduced = true;
      benefit = Math.max(fit, Math.min(target, s.minimumBenefit));
      notes.push(`保険料の目安（年${formatMan(cap.value)}）に収まるよう保障額を調整しています`);
      fullMin = (target / 1000) * lk.per1000;
      notes.push(`優先資金の全額（${formatMan(target)}）を確保する場合の参考保険料は年${formatMan(fullMin)}です`);
      if (fit < Math.min(target, s.minimumBenefit)) notes.push('最低限の保障額を確保すると保険料の目安を上回ります');
    }
  }
  const purpose = loanBased ? '借入金の返済資金の確保（事業保障）' : '当面の運転資金の確保（事業保障）';
  const comp = makeComponent(ctx, 'MIN', code, 'protection', benefit, purpose, { lk });
  const title = loanBased ? `「まずは借入金を守る」${TIER_NAME.MIN}` : `「まずは運転資金を守る」${TIER_NAME.MIN}`;
  return finalizePlan(ctx, 'MIN', title, '不足する保障のうち、最も優先度の高い資金を保険料を抑えて先に確保する', [comp], cap, reduced, notes, ruleHits, fullMin);
}

function buildBalanced(ctx: Ctx, hits: string[]): Plan {
  const { calc, s } = ctx;
  const cap = money('plan.BALANCED.budgetCap', calc.budget.balanced.value, 'バランス型プランの予算目安', { budget: calc.budget.balanced.value });
  const notes: string[] = [];
  const protCode = chooseProtection(ctx, false);
  const retire = retirementSizing(ctx, s.balancedRetirementShare);
  const build = (ret: number, _addOnScale: number | number[], protOverride: number | null): PlanComponent[] => {
    const comps: PlanComponent[] = [];
    const protBenefit = protOverride ?? ceilStep(Math.max(0, calc.coverage.gap.value - ret), s.coverageStep);
    if (protBenefit > 0) comps.push(makeComponent(ctx, 'BALANCED', protCode, 'protection', protBenefit, '不足する事業保障資金・死亡退職金の確保', { termToAge: protectionTerm(ctx) }));
    if (ret > 0) comps.push(makeComponent(ctx, 'BALANCED', retire.code, 'retirement', ret, '勇退退職金の一部の財源準備＋事業保障', { lk: retire.lk }));
    return comps;
  };
  const { comps, reduced, fullPremium } = fitWithShares(ctx, cap.value, retire.benefit, { retShare: 0.5, addOnShare: 0 }, build);
  if (reduced) reducedNotes(notes, cap.value, fullPremium, '保障額と退職金準備額');
  if (calc.retirement.yearsToRetire.value < 10) notes.push('勇退までの期間が短いため、返戻率のピークと勇退時期を合わせにくい点に注意が必要です');
  const ruleHits = hits.filter((h) => ['R01', 'R03', 'R07', 'R08'].includes(h));
  const plan = finalizePlan(ctx, 'BALANCED', `「保障と退職金準備を両立する」${TIER_NAME.BALANCED}`, '不足する保障を確保しつつ、勇退退職金の一部を返戻率のピークに合わせて準備する', comps, cap, reduced, notes, ruleHits, fullPremium);
  if (plan.coverageRatio > 1.2) plan.notes.push('退職金の財源づくりを兼ねるため、死亡保障は必要保障額を上回ります');
  return plan;
}

function retirementSizing(ctx: Ctx, share: number): { code: string; lk: RateLookup | null; benefit: number } {
  const code = chooseRetirement(ctx);
  const lk = lookup(ctx, code, { preferPeakAge: ctx.retireAge });
  const targetCv = ctx.calc.retirement.inflationAdjusted.value * share;
  const benefit = benefitForCashValue(lk, targetCv, ctx.s.coverageStep) ?? ceilStep(ctx.calc.retirement.target.value * share, ctx.s.coverageStep);
  return { code, lk, benefit };
}

function buildMax(ctx: Ctx, hits: string[]): Plan {
  const { calc, s, input } = ctx;
  const cap = money('plan.MAX.budgetCap', calc.budget.max.value, '最大活用型プランの予算目安', { budget: calc.budget.max.value });
  const notes: string[] = [];
  const protCode = chooseProtection(ctx, false);
  const retire = retirementSizing(ctx, 1);
  const addOnSpecs: { code: string; role: PlanComponent['role']; benefit: number; purpose: string; opts: { termToAge?: number; lk?: RateLookup | null } }[] = [];
  for (const code of ctx.ev.addToMax) {
    if (code === 'THIRD_SECTOR') {
      addOnSpecs.push({ code, role: 'third_sector', benefit: input.officer.monthlyPay * s.thirdSectorMonths, purpose: '経営者の就業不能・三大疾病への備え（経営が落ち着くまでの資金）', opts: { termToAge: Math.max(80, ctx.retireAge + 10) } });
    } else if (code === 'ENDOWMENT_HALF') {
      addOnSpecs.push({ code, role: 'welfare', benefit: input.company.employeeCount * s.welfarePerEmployee, purpose: '従業員の退職金準備・福利厚生（全従業員の加入が前提）', opts: { lk: null, termToAge: 65 } });
    } else if (code === 'WHOLE_LIFE') {
      addOnSpecs.push({ code, role: 'succession', benefit: calc.coverage.inheritanceExempt.value, purpose: '事業承継・相続に備えた納税資金・遺産分割資金の準備', opts: { termToAge: 100 } });
    }
  }
  const build = (ret: number, addOnScale: number | number[], protOverride: number | null): PlanComponent[] => {
    const scaleOf = (i: number) => (Array.isArray(addOnScale) ? (addOnScale[i] ?? 0) : addOnScale);
    const addOns = addOnSpecs
      .map((a, i) => ({ ...a, benefit: floorStep(a.benefit * scaleOf(i), s.coverageStep) }))
      .filter((a) => a.benefit > 0)
      .map((a) => makeComponent(ctx, 'MAX', a.code, a.role, a.benefit, a.purpose, a.opts));
    const succession = addOns.filter((a) => a.role === 'succession').reduce((sum, a) => sum + a.deathBenefit.value, 0);
    const protBenefit = protOverride ?? ceilStep(Math.max(0, calc.coverage.gap.value - ret - succession), s.coverageStep);
    const comps: PlanComponent[] = [];
    if (protBenefit > 0) comps.push(makeComponent(ctx, 'MAX', protCode, 'protection', protBenefit, '必要保障額の全額確保（事業保障資金・死亡退職金・弔慰金）', { termToAge: protectionTerm(ctx) }));
    if (ret > 0) comps.push(makeComponent(ctx, 'MAX', retire.code, 'retirement', ret, '勇退退職金（インフレ調整後）の財源準備＋事業保障', { lk: retire.lk }));
    return [...comps, ...addOns];
  };
  const { comps, reduced, fullPremium } = fitWithShares(ctx, cap.value, retire.benefit, { retShare: 0.5, addOnShare: 0.3 }, build);
  if (reduced) reducedNotes(notes, cap.value, fullPremium, '保障額・退職金準備額・追加の備え');
  if (addOnSpecs.length > 0 && !comps.some((c) => addOnSpecs.some((a) => a.code === c.categoryCode))) {
    notes.push('追加の備え（第三分野・福利厚生・終身）は保険料の目安に収まらないため、構成から外しています。優先順位をご相談ください');
  }
  const ruleHits = hits.filter((h) => ['R03', 'R04', 'R05', 'R06', 'R07', 'R08'].includes(h));
  const plan = finalizePlan(ctx, 'MAX', `「将来まで見据えて備える」${TIER_NAME.MAX}`, '必要保障額の全額と、インフレを考慮した勇退退職金の財源、経営者・従業員の将来リスクへの備えまでを一体で設計する', comps, cap, reduced, notes, ruleHits, fullPremium);
  if (plan.coverageRatio > 1.2) plan.notes.push('退職金の財源づくりを兼ねるため、死亡保障は必要保障額を上回ります');
  return plan;
}

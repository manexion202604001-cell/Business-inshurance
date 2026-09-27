import { money, round } from './money';
import type { PremiumEstimate, ReferenceRate } from './types';

export interface RateLookup {
  rate: ReferenceRate;
  /** Premium per 1,000万 interpolated by age. */
  per1000: number;
  peakReturnRate: number | null;
  peakYear: number | null;
  termToAge: number;
}

/**
 * Find a reference rate for the category/sex/age. Interpolates linearly between the two nearest ages
 * (same termToAge). If `termToAge` is not given, `preferPeakAge` picks the table whose peak is closest.
 */
export function lookupRate(
  rates: ReferenceRate[],
  params: { category: string; sex: 'M' | 'F'; age: number; termToAge?: number; preferPeakAge?: number },
): RateLookup | null {
  const cands = rates.filter((r) => r.category === params.category && r.sex === params.sex && r.termToAge > params.age);
  if (cands.length === 0) return null;
  const terms = [...new Set(cands.map((r) => r.termToAge))];
  let term: number;
  if (params.termToAge != null) {
    term = terms.reduce((best, t) => (Math.abs(t - params.termToAge!) < Math.abs(best - params.termToAge!) ? t : best), terms[0]!);
  } else if (params.preferPeakAge != null) {
    const scoreOf = (t: number) => {
      const near = nearestByAge(cands.filter((r) => r.termToAge === t), params.age);
      if (!near || near.peakYear == null) return Infinity;
      return Math.abs(params.age + near.peakYear - params.preferPeakAge!);
    };
    term = terms.reduce((best, t) => (scoreOf(t) < scoreOf(best) ? t : best), terms[0]!);
  } else {
    term = Math.max(...terms);
  }
  const rows = cands.filter((r) => r.termToAge === term).sort((x, y) => x.age - y.age);
  if (rows.length === 0) return null;
  const lower = [...rows].reverse().find((r) => r.age <= params.age);
  const upper = rows.find((r) => r.age >= params.age);
  // Do not extrapolate far outside the table (more than 5 years).
  if (!lower && upper && upper.age - params.age > 5) return null;
  if (!upper && lower && params.age - lower.age > 5) return null;
  const lo = lower ?? upper!;
  const hi = upper ?? lower!;
  const t = hi.age === lo.age ? 0 : (params.age - lo.age) / (hi.age - lo.age);
  const lerp = (a: number | null, b: number | null) => (a == null || b == null ? (a ?? b) : a + (b - a) * t);
  return {
    rate: t < 0.5 ? lo : hi,
    per1000: lerp(lo.annualPremiumPer1000man, hi.annualPremiumPer1000man)!,
    peakReturnRate: lerp(lo.peakReturnRate, hi.peakReturnRate),
    peakYear: lo.peakYear == null || hi.peakYear == null ? (lo.peakYear ?? hi.peakYear) : Math.round(lo.peakYear + (hi.peakYear - lo.peakYear) * t),
    termToAge: term,
  };
}

function nearestByAge(rows: ReferenceRate[], age: number): ReferenceRate | undefined {
  return rows.reduce<ReferenceRate | undefined>((best, r) => (!best || Math.abs(r.age - age) < Math.abs(best.age - age) ? r : best), undefined);
}

/** Annual premium estimate for a death benefit, given as a ±15% range around the reference value. */
export function estimatePremium(calcIdBase: string, deathBenefit: number, lk: RateLookup, spread = 0.15): PremiumEstimate {
  const mid = (deathBenefit / 1000) * lk.per1000;
  const src = `${lk.rate.source}（${lk.rate.asOf}）`;
  return {
    mid: money(`${calcIdBase}.premium.mid`, mid, `保障額 ${deathBenefit.toLocaleString('ja-JP')}万円 ÷ 1,000万円 × 参考料率 ${lk.per1000.toFixed(2)}万円`, { deathBenefit, per1000: round(lk.per1000 * 100) / 100 }, { source: src }),
    low: money(`${calcIdBase}.premium.low`, mid * (1 - spread), `参考保険料 × ${(1 - spread).toFixed(2)}`, { mid: round(mid) }, { source: src }),
    high: money(`${calcIdBase}.premium.high`, mid * (1 + spread), `参考保険料 × ${(1 + spread).toFixed(2)}`, { mid: round(mid) }, { source: src }),
    rateSource: src,
    isSample: Boolean(lk.rate.isSample),
  };
}

/** Death benefit that fits within an annual premium budget, floored to `step`. */
export function benefitForBudget(budget: number, per1000: number, step: number): number {
  if (per1000 <= 0) return Infinity;
  const raw = (budget / per1000) * 1000;
  return Math.max(0, Math.floor(raw / step) * step);
}

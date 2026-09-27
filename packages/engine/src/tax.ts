/**
 * 法人契約の定期保険・第三分野保険の経理処理（法人税基本通達9-3-5、9-3-5の2）。
 * Contract: policyholder = corporation, insured = officer/employee, beneficiary = corporation.
 * Assumes level annual premiums paid over the whole term (全期払). Short-pay is out of scope (see DECISIONS.md).
 * All amounts in 万円. Returned yearly amounts are NOT rounded, so that totals reconcile exactly.
 */

export type TaxBucket = 1 | 2 | 3 | 4;

/** 最高解約返戻率（%）から区分を判定 */
export function classifyTaxBucket(peakReturnRatePct: number): TaxBucket {
  if (peakReturnRatePct <= 50) return 1;
  if (peakReturnRatePct <= 70) return 2;
  if (peakReturnRatePct <= 85) return 3;
  return 4;
}

export const TAX_BUCKET_LABEL: Record<TaxBucket, string> = {
  1: '最高解約返戻率50%以下（全額損金）',
  2: '最高解約返戻率50%超70%以下（当初4割期間 4割資産計上）',
  3: '最高解約返戻率70%超85%以下（当初4割期間 6割資産計上）',
  4: '最高解約返戻率85%超（返戻率×9割／7割 資産計上）',
};

export interface TaxScheduleInput {
  /** 年払保険料（万円） */
  annualPremium: number;
  /** 保険期間（年） */
  termYears: number;
  /** 最高解約返戻率（%）。変額保険は予定利率で推移した場合の値 */
  peakReturnRate: number;
  /**
   * 年換算保険料相当額（1被保険者あたり、他社契約も合算、万円）。
   * Defaults to annualPremium. Used for the 30万円 exception.
   */
  annualizedPremiumPerInsured?: number;
  /** 区分4: 最高解約返戻率となる期間の終了年（経過年数）。 */
  peakRateYear?: number;
  /**
   * 区分4: 各年度末の解約返戻金相当額（index 0 = 1年目末）。
   * Used for the extension rule and to locate the max surrender value year.
   */
  cashValues?: number[];
}

export interface TaxScheduleRow {
  year: number;
  premium: number;
  /** 当期の資産計上額（前払保険料） */
  asset: number;
  /** 当期の取崩額 */
  reversal: number;
  /** 当期の損金算入額（支払保険料＋取崩額） */
  expense: number;
  /** 年度末の資産計上累計残高 */
  assetBalance: number;
}

export interface TaxSchedule {
  bucket: TaxBucket;
  fullyDeductible: boolean;
  fullyDeductibleReason: string | null;
  /** 資産計上期間（年、端数あり） */
  assetPeriodYears: number;
  /** 取崩開始（経過年数、この時点以降が取崩期間） */
  reversalStartYear: number;
  /** 当初の資産計上割合（区分2・3）または区分4の1〜10年目の割合 */
  assetRatio: number;
  rows: TaxScheduleRow[];
  totalAsset: number;
  summary: string;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Fraction of year `year` (1-based, covering [year-1, year]) that lies inside [from, to]. */
function overlap(year: number, from: number, to: number): number {
  const a = Math.max(year - 1, from);
  const b = Math.min(year, to);
  return clamp01(b - a);
}

/** 区分4の資産計上期間の終了年（経過年数）を求める */
export function bucket4AssetPeriod(input: TaxScheduleInput): { assetEnd: number; reversalStart: number } {
  const { termYears, annualPremium, cashValues } = input;
  let peakRateEnd = input.peakRateYear ?? 0;
  let maxCvYear = peakRateEnd;
  if (cashValues && cashValues.length > 0) {
    // 最高解約返戻率となる年（年度末返戻金 ÷ 累計保険料 が最大）
    let bestRate = -Infinity;
    let bestYear = 1;
    let bestCv = -Infinity;
    cashValues.forEach((cv, i) => {
      const y = i + 1;
      const rate = cv / (annualPremium * y);
      if (rate > bestRate + 1e-12) {
        bestRate = rate;
        bestYear = y;
      }
      if (cv > bestCv + 1e-12) {
        bestCv = cv;
        maxCvYear = y;
      }
    });
    if (input.peakRateYear == null) peakRateEnd = bestYear;
    // 延長：最高返戻率期間経過後、（当年度CV−前年度CV）÷年換算保険料 > 7/10 となる期間があればその期間まで
    for (let y = peakRateEnd + 1; y <= cashValues.length; y++) {
      const inc = (cashValues[y - 1] ?? 0) - (cashValues[y - 2] ?? 0);
      if (inc / annualPremium > 0.7) peakRateEnd = y;
    }
  }
  // 最低期間：5年（保険期間10年未満なら保険期間の50%）
  const minPeriod = termYears < 10 ? termYears * 0.5 : 5;
  const assetEnd = Math.min(termYears, Math.max(peakRateEnd, minPeriod));
  // 取崩期間：解約返戻金相当額が最も高い金額となる期間経過後（最低期間の規定がある場合はそれ以降）
  const reversalStart = Math.min(termYears, Math.max(maxCvYear, assetEnd));
  return { assetEnd, reversalStart };
}

export function taxSchedule(input: TaxScheduleInput): TaxSchedule {
  const { annualPremium: P, termYears: T, peakReturnRate } = input;
  const bucket = classifyTaxBucket(peakReturnRate);
  const annualized = input.annualizedPremiumPerInsured ?? P;
  const rows: TaxScheduleRow[] = [];
  const yearsCount = Math.ceil(T);

  const fullyDeductible = bucket === 1 || (bucket === 2 && annualized <= 30);
  if (fullyDeductible) {
    for (let y = 1; y <= yearsCount; y++) rows.push({ year: y, premium: P, asset: 0, reversal: 0, expense: P, assetBalance: 0 });
    return {
      bucket,
      fullyDeductible: true,
      fullyDeductibleReason:
        bucket === 1
          ? '最高解約返戻率50%以下のため、支払保険料は全額損金算入'
          : '最高解約返戻率70%以下かつ年換算保険料相当額30万円以下（1被保険者・全社合算）のため、全額損金算入',
      assetPeriodYears: 0,
      reversalStartYear: T,
      assetRatio: 0,
      rows,
      totalAsset: 0,
      summary: bucket === 1 ? '全額損金算入' : '全額損金算入（30万円基準）',
    };
  }

  let assetEnd: number;
  let reversalStart: number;
  let assetRatio: number;
  if (bucket === 2 || bucket === 3) {
    assetRatio = bucket === 2 ? 0.4 : 0.6;
    assetEnd = T * 0.4;
    reversalStart = T * 0.75;
  } else {
    assetRatio = (peakReturnRate / 100) * 0.9;
    const p = bucket4AssetPeriod(input);
    assetEnd = p.assetEnd;
    reversalStart = p.reversalStart;
  }

  let balance = 0;
  const assetsByYear: number[] = [];
  for (let y = 1; y <= yearsCount; y++) {
    const inPeriod = overlap(y, 0, assetEnd);
    let ratio: number;
    if (bucket === 4) ratio = Math.min(1, (peakReturnRate / 100) * (y <= 10 ? 0.9 : 0.7));
    else ratio = assetRatio;
    const asset = P * ratio * inPeriod;
    assetsByYear.push(asset);
    balance += asset;
  }
  const totalAsset = balance;
  const reversalYears = T - reversalStart;
  balance = 0;
  for (let y = 1; y <= yearsCount; y++) {
    const asset = assetsByYear[y - 1] ?? 0;
    const frac = overlap(y, reversalStart, T);
    const reversal = reversalYears > 0 ? (totalAsset / reversalYears) * frac : 0;
    balance += asset - reversal;
    rows.push({ year: y, premium: P, asset, reversal, expense: P - asset + reversal, assetBalance: Math.max(0, balance) });
  }

  const summary =
    bucket === 4
      ? `資産計上期間 ${fmt(assetEnd)}年：1〜10年目は保険料×最高返戻率${peakReturnRate}%×9/10、11年目以降は×7/10を資産計上。${fmt(reversalStart)}年経過後から満了まで均等に取崩し`
      : `資産計上期間 ${fmt(assetEnd)}年：保険料の${bucket === 2 ? '4/10' : '6/10'}を資産計上（${bucket === 2 ? '6/10' : '4/10'}を損金）。${fmt(reversalStart)}年経過後から満了まで均等に取崩し`;

  return { bucket, fullyDeductible: false, fullyDeductibleReason: null, assetPeriodYears: assetEnd, reversalStartYear: reversalStart, assetRatio, rows, totalAsset, summary };
}

function fmt(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

/** 仕訳例の要約（資産計上期間と取崩期間の代表的な1年） */
export function journalExample(schedule: TaxSchedule): {
  assetPhase: { debitPrepaid: number; debitExpense: number; credit: number } | null;
  reversalPhase: { debitExpense: number; creditCash: number; creditPrepaid: number } | null;
} {
  const first = schedule.rows[0];
  const lastRow = schedule.rows[schedule.rows.length - 1];
  const assetPhase = first && first.asset > 0 ? { debitPrepaid: first.asset, debitExpense: first.premium - first.asset, credit: first.premium } : null;
  const reversalPhase = lastRow && lastRow.reversal > 0 ? { debitExpense: lastRow.expense, creditCash: lastRow.premium, creditPrepaid: lastRow.reversal } : null;
  return { assetPhase, reversalPhase };
}

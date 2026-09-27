import { describe, expect, it } from 'vitest';
import { bucket4AssetPeriod, classifyTaxBucket, journalExample, taxSchedule } from '../src';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('classifyTaxBucket', () => {
  it.each([
    [0, 1],
    [50, 1],
    [50.1, 2],
    [70, 2],
    [70.1, 3],
    [85, 3],
    [85.1, 4],
    [100, 4],
  ])('%f%% -> bucket %i', (rate, bucket) => {
    expect(classifyTaxBucket(rate)).toBe(bucket);
  });
});

describe('journal examples (§7.2): age 50, term 40 years, annual premium 100', () => {
  it('bucket 2', () => {
    const s = taxSchedule({ annualPremium: 100, termYears: 40, peakReturnRate: 60 });
    expect(s.bucket).toBe(2);
    expect(s.assetPeriodYears).toBe(16);
    const y1 = s.rows[0]!;
    expect(y1.asset).toBeCloseTo(40);
    expect(y1.expense).toBeCloseTo(60);
    expect(s.totalAsset).toBeCloseTo(640);
    expect(s.rows[16]!.asset).toBe(0);
    expect(s.rows[16]!.expense).toBeCloseTo(100);
    expect(s.reversalStartYear).toBe(30);
    const last = s.rows[39]!;
    expect(last.reversal).toBeCloseTo(64);
    expect(last.expense).toBeCloseTo(164);
    expect(s.rows[29]!.reversal).toBe(0);
    expect(s.rows[30]!.reversal).toBeCloseTo(64);
    expect(last.assetBalance).toBeCloseTo(0);
    expect(sum(s.rows.map((r) => r.expense))).toBeCloseTo(4000);
  });
  it('bucket 3', () => {
    const s = taxSchedule({ annualPremium: 100, termYears: 40, peakReturnRate: 80 });
    expect(s.bucket).toBe(3);
    expect(s.rows[0]!.asset).toBeCloseTo(60);
    expect(s.rows[0]!.expense).toBeCloseTo(40);
    expect(s.totalAsset).toBeCloseTo(960);
    expect(s.rows[39]!.reversal).toBeCloseTo(96);
    expect(s.rows[39]!.expense).toBeCloseTo(196);
    const j = journalExample(s);
    expect(j.assetPhase).toEqual({ debitPrepaid: 60, debitExpense: 40, credit: 100 });
    expect(j.reversalPhase?.creditPrepaid).toBeCloseTo(96);
  });
});

describe('fully deductible cases', () => {
  it('bucket 1 is fully deductible', () => {
    const s = taxSchedule({ annualPremium: 100, termYears: 20, peakReturnRate: 45 });
    expect(s.fullyDeductible).toBe(true);
    expect(s.totalAsset).toBe(0);
    expect(journalExample(s)).toEqual({ assetPhase: null, reversalPhase: null });
  });
  it('bucket 2 with annualized premium <= 30万円 is fully deductible', () => {
    const s = taxSchedule({ annualPremium: 30, termYears: 40, peakReturnRate: 65 });
    expect(s.fullyDeductible).toBe(true);
    expect(s.fullyDeductibleReason).toContain('30万円');
  });
  it('30万円 rule uses the per-insured total across contracts', () => {
    const s = taxSchedule({ annualPremium: 20, termYears: 40, peakReturnRate: 65, annualizedPremiumPerInsured: 35 });
    expect(s.fullyDeductible).toBe(false);
  });
  it('30万円 rule does not apply to bucket 3', () => {
    const s = taxSchedule({ annualPremium: 20, termYears: 40, peakReturnRate: 75 });
    expect(s.fullyDeductible).toBe(false);
  });
});

describe('bucket 4', () => {
  it('switches from 9/10 to 7/10 after year 10, capped at the premium', () => {
    const s = taxSchedule({ annualPremium: 100, termYears: 30, peakReturnRate: 90, peakRateYear: 15 });
    expect(s.bucket).toBe(4);
    expect(s.rows[9]!.asset).toBeCloseTo(81); // 100 × 0.9 × 0.9
    expect(s.rows[10]!.asset).toBeCloseTo(63); // 100 × 0.9 × 0.7
    expect(s.rows[15]!.asset).toBe(0);
    expect(s.assetPeriodYears).toBe(15);
    expect(s.reversalStartYear).toBe(15);
    expect(s.rows[29]!.assetBalance).toBeCloseTo(0);
  });
  it('asset ratio is capped at 100% of the premium', () => {
    const s = taxSchedule({ annualPremium: 100, termYears: 30, peakReturnRate: 120, peakRateYear: 12 });
    expect(s.rows[0]!.asset).toBeCloseTo(100);
  });
  it('extends to at least 5 years', () => {
    const p = bucket4AssetPeriod({ annualPremium: 100, termYears: 30, peakReturnRate: 90, peakRateYear: 3 });
    expect(p.assetEnd).toBe(5);
  });
  it('uses 50% of the term when the term is under 10 years', () => {
    const p = bucket4AssetPeriod({ annualPremium: 100, termYears: 8, peakReturnRate: 90, peakRateYear: 2 });
    expect(p.assetEnd).toBe(4);
  });
  it('extends while the yearly surrender value increase exceeds 7/10 of the premium', () => {
    // premium 100/yr; CV rises 90/yr until year 12, then +80 (>70) in years 13-14, then +20
    const cvs: number[] = [];
    let cv = 0;
    for (let y = 1; y <= 20; y++) {
      cv += y <= 12 ? 90 : y <= 14 ? 80 : 20;
      cvs.push(cv);
    }
    const p = bucket4AssetPeriod({ annualPremium: 100, termYears: 20, peakReturnRate: 90, cashValues: cvs });
    // highest rate is year 1 (90%), extended through year 14
    expect(p.assetEnd).toBe(14);
    expect(p.reversalStart).toBe(20);
  });
  it('prorates fractional periods', () => {
    const s = taxSchedule({ annualPremium: 100, termYears: 17, peakReturnRate: 60 });
    // asset period = 6.8 years
    expect(s.rows[6]!.asset).toBeCloseTo(40 * 0.8);
    expect(s.totalAsset).toBeCloseTo(40 * 6.8);
    expect(s.rows[16]!.assetBalance).toBeCloseTo(0);
  });
});

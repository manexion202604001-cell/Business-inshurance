/**
 * Generates DEVELOPMENT SAMPLE reference rates (not real product rates).
 * Rough Gompertz mortality + simple actuarial level premium, so that plan composition,
 * budget fitting and tax bucket logic can be exercised end to end.
 * Real rates must be imported from insurer design systems via the admin CSV import.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Row = {
  category: string; sex: 'M' | 'F'; age: number; termToAge: number;
  annualPremiumPer1000man: number; peakReturnRate: number | null; peakYear: number | null;
  source: string; asOf: string; isSample: true;
};

const SOURCE = '開発用サンプル料率（実在の商品の料率ではありません）';
const AS_OF = '2026-09-01';
const i = 0.005;
const v = 1 / (1 + i);

function q(x: number, sex: 'M' | 'F'): number {
  const base = 0.001 * Math.exp(0.087 * (x - 40));
  return Math.min(0.5, sex === 'M' ? base : base * 0.55);
}

/** Net level annual premium per 1,000万 for term insurance from age to termToAge. */
function levelPremium(age: number, termToAge: number, sex: 'M' | 'F'): number {
  let pvBenefit = 0;
  let pvAnnuity = 0;
  let surv = 1;
  for (let t = 0; t < termToAge - age; t++) {
    const qx = q(age + t, sex);
    pvAnnuity += surv * v ** t;
    pvBenefit += surv * qx * v ** (t + 1);
    surv *= 1 - qx;
  }
  return (1000 * pvBenefit) / pvAnnuity;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const rows: Row[] = [];
const ages = [30, 35, 40, 45, 50, 55, 60, 65, 70, 75];
for (const sex of ['M', 'F'] as const) {
  for (const age of ages) {
    // Low cash value term: short/medium terms
    for (const termToAge of [60, 65, 70, 75, 80, 85]) {
      if (termToAge - age < 5) continue;
      const net = levelPremium(age, termToAge, sex);
      rows.push({ category: 'TERM_LOW_CV', sex, age, termToAge, annualPremiumPer1000man: r2(net * 1.3 + 0.3), peakReturnRate: 40, peakYear: Math.max(1, Math.round((termToAge - age) * 0.5)), source: SOURCE, asOf: AS_OF, isSample: true });
      rows.push({ category: 'TERM_DECREASING', sex, age, termToAge, annualPremiumPer1000man: r2(net * 0.65 + 0.2), peakReturnRate: 15, peakYear: Math.max(1, Math.round((termToAge - age) * 0.3)), source: SOURCE, asOf: AS_OF, isSample: true });
    }
    // Long-term level term: to 80-100
    for (const termToAge of [80, 85, 90, 95, 100]) {
      if (termToAge - age < 15) continue;
      const net = levelPremium(age, termToAge, sex);
      const peak = age <= 45 ? 84 : age <= 55 ? 82 : age <= 65 ? 78 : 72;
      const peakYear = Math.max(8, Math.round((termToAge - age) * 0.45));
      rows.push({ category: 'TERM_LEVEL_LONG', sex, age, termToAge, annualPremiumPer1000man: r2(net * 1.15 + 0.5), peakReturnRate: peak, peakYear, source: SOURCE, asOf: AS_OF, isSample: true });
      const vpeak = age <= 50 ? 68 : 64;
      rows.push({ category: 'VARIABLE_TERM', sex, age, termToAge, annualPremiumPer1000man: r2(net * 1.08 + 0.5), peakReturnRate: vpeak, peakYear: Math.max(8, Math.round((termToAge - age) * 0.4)), source: SOURCE, asOf: AS_OF, isSample: true });
    }
    // Whole life (paid to 100)
    {
      const net = levelPremium(age, 105, sex);
      rows.push({ category: 'WHOLE_LIFE', sex, age, termToAge: 100, annualPremiumPer1000man: r2(net * 1.1 + 1000 / (100 - age) * 0.25), peakReturnRate: 95, peakYear: 100 - age, source: SOURCE, asOf: AS_OF, isSample: true });
    }
    // Third sector (no cash value)
    for (const termToAge of [80, 85, 90]) {
      if (termToAge - age < 10) continue;
      const net = levelPremium(age, termToAge, sex);
      rows.push({ category: 'THIRD_SECTOR', sex, age, termToAge, annualPremiumPer1000man: r2(net * 2.2 + 0.5), peakReturnRate: 0, peakYear: null, source: SOURCE, asOf: AS_OF, isSample: true });
    }
  }
}
const out = join(import.meta.dirname, '..', 'seed', 'reference-rates.json');
writeFileSync(out, JSON.stringify(rows, null, 1) + '\n');
console.log(`wrote ${rows.length} rows to ${out}`);

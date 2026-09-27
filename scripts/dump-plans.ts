import { readFileSync } from 'node:fs';
import { runEngine } from '../packages/engine/src';
import { loadSeedKnowledge, toEngineKnowledge } from '../packages/knowledge/src';
const K = toEngineKnowledge(loadSeedKnowledge());
const sig: Record<string, object> = { 'case-c': { issueTags: ['successor'], employeeRetirementPrepared: true } };
for (const id of process.argv.slice(2)) {
  const f = JSON.parse(readFileSync(`fixtures/cases/${id}.json`, 'utf8'));
  const out = runEngine({ company: f.company, officer: f.officer, existingPolicies: f.existingPolicies, signals: { issueTags: [], ...(sig[id] ?? {}) } }, K);
  console.log(`== ${id} gap=${out.calc.coverage.gap.value} req=${out.calc.coverage.required.value} budget=${out.calc.budget.min.value}/${out.calc.budget.balanced.value}/${out.calc.budget.max.value} retInfl=${out.calc.retirement.inflationAdjusted.value}`);
  for (const p of out.planSet.plans) {
    console.log(` ${p.tier} ${p.title} ratio=${p.coverageRatio} prem=${p.totalPremium?.value} cap=${p.budgetCap.value} reduced=${p.reducedForBudget} retRatio=${p.retirementFundRatio}`);
    for (const c of p.components) console.log(`   - ${c.label} DB=${c.deathBenefit.value} to${c.termToAge} prem=${c.premiumEstimate === 'DESIGN_SHEET_REQUIRED' ? 'DS' : c.premiumEstimate.mid.value} bucket=${c.taxBucket} peak=${c.peakAge}/${c.peakReturnRate} cv=${c.peakCashValue?.value}`);
    for (const n of p.notes) console.log(`   * ${n}`);
  }
}

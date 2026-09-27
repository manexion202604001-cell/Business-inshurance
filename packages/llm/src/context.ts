import type { CalcResult, CompanyInput, ExistingPolicyInput, Money, OfficerInput, PlanSet } from '@p3/engine';
import type { KnowledgeSnapshot } from '@p3/knowledge';
import type { Extraction } from './schemas';

export interface NarrativeContext {
  company: CompanyInput;
  officer: OfficerInput;
  existingPolicies: ExistingPolicyInput[];
  industryLabel: string;
  calc: CalcResult;
  planSet: PlanSet;
  extraction: Extraction;
  knowledge: KnowledgeSnapshot;
}

/** Flatten every Money in the calc result / plans into calcId -> Money. */
export function flattenMoney(calc: CalcResult, planSet?: PlanSet): Record<string, Money> {
  const out: Record<string, Money> = {};
  const visit = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    if (typeof o.calcId === 'string' && typeof o.value === 'number') {
      out[o.calcId] = o as unknown as Money;
      return;
    }
    Object.values(o).forEach(visit);
  };
  visit(calc);
  if (planSet) visit(planSet.plans);
  return out;
}

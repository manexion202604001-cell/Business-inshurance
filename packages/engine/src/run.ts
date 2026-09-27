import { buildFacts, calculate } from './calculate';
import { buildPlans } from './plans';
import { evaluateRules, type RuleEvaluation } from './rules';
import type { CalcResult, CaseInput, CategoryInfo, EngineSettings, LogicRule, PlanSet, ReferenceRate } from './types';

export interface EngineKnowledge {
  settings: EngineSettings;
  rules: LogicRule[];
  categories: CategoryInfo[];
  rates: ReferenceRate[];
}

export interface EngineOutput {
  calc: CalcResult;
  facts: Record<string, unknown>;
  evaluation: RuleEvaluation;
  planSet: PlanSet;
}

/** Steps 3–4: deterministic calculation and plan composition. */
export function runEngine(input: CaseInput, k: EngineKnowledge): EngineOutput {
  const calc = calculate(input, k.settings);
  const facts = buildFacts(input, calc, k.categories, k.settings);
  const evaluation = evaluateRules(k.rules, facts, k.categories);
  const planSet = buildPlans({ input, calc, evaluation, categories: k.categories, rates: k.rates, settings: k.settings });
  return { calc, facts, evaluation, planSet };
}

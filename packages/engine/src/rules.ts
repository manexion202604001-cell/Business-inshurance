import type { CategoryInfo, LogicRule, RuleHit } from './types';

/**
 * Minimal JSON Logic evaluator (subset). Comparisons involving null/undefined evaluate to false
 * so that rules never fire on missing data.
 */
export function evalLogic(expr: unknown, data: Record<string, unknown>): unknown {
  if (expr === null || typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) return expr.map((e) => evalLogic(e, data));
  const keys = Object.keys(expr);
  if (keys.length !== 1) throw new Error(`Invalid logic expression: ${JSON.stringify(expr)}`);
  const op = keys[0] as string;
  const rawArgs = (expr as Record<string, unknown>)[op];
  const argList = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

  // Lazy operators
  if (op === 'and') {
    let last: unknown = true;
    for (const a of argList) {
      last = evalLogic(a, data);
      if (!truthy(last)) return last;
    }
    return last;
  }
  if (op === 'or') {
    let last: unknown = false;
    for (const a of argList) {
      last = evalLogic(a, data);
      if (truthy(last)) return last;
    }
    return last;
  }
  if (op === 'if') {
    for (let i = 0; i + 1 < argList.length; i += 2) {
      if (truthy(evalLogic(argList[i], data))) return evalLogic(argList[i + 1], data);
    }
    return argList.length % 2 === 1 ? evalLogic(argList[argList.length - 1], data) : null;
  }

  const args = argList.map((a) => evalLogic(a, data));
  const [a, b] = args;
  switch (op) {
    case 'var': {
      const path = String(a ?? '');
      if (path === '') return data;
      let cur: unknown = data;
      for (const part of path.split('.')) {
        if (cur == null || typeof cur !== 'object') return b ?? null;
        cur = (cur as Record<string, unknown>)[part];
      }
      return cur === undefined ? (b ?? null) : cur;
    }
    case '==':
    case '===':
      return a === b;
    case '!=':
    case '!==':
      return a !== b;
    case '>':
      return cmp(a, b, (x, y) => x > y);
    case '>=':
      return cmp(a, b, (x, y) => x >= y);
    case '<':
      return cmp(a, b, (x, y) => x < y);
    case '<=':
      return cmp(a, b, (x, y) => x <= y);
    case '!':
      return !truthy(a);
    case '!!':
      return truthy(a);
    case 'in':
      if (Array.isArray(b)) return b.includes(a);
      if (typeof b === 'string') return b.includes(String(a));
      return false;
    case '+':
      return args.reduce<number>((s, x) => s + Number(x), 0);
    case '*':
      return args.reduce<number>((s, x) => s * Number(x), 1);
    case '-':
      return args.length === 1 ? -Number(a) : Number(a) - Number(b);
    case '/':
      return Number(b) === 0 ? null : Number(a) / Number(b);
    case 'min':
      return Math.min(...args.map(Number));
    case 'max':
      return Math.max(...args.map(Number));
    default:
      throw new Error(`Unsupported logic operator: ${op}`);
  }
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function cmp(a: unknown, b: unknown, f: (x: number, y: number) => boolean): boolean {
  if (a == null || b == null) return false;
  const x = Number(a);
  const y = Number(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return false;
  return f(x, y);
}

export interface RuleEvaluation {
  hits: RuleHit[];
  scores: Record<string, number>;
  minBudgetFactor: number;
  addToMax: string[];
  memoPoints: string[];
  errors: { id: string; message: string }[];
}

export const BASE_SCORES: Record<string, number> = {
  TERM_LOW_CV: 1,
  TERM_DECREASING: 0,
  TERM_LEVEL_LONG: 1,
  VARIABLE_TERM: 0,
  WHOLE_LIFE: 0,
  THIRD_SECTOR: 0,
  ENDOWMENT_HALF: 0,
};

/** Evaluate all enabled rules against the facts and aggregate their effects. */
export function evaluateRules(
  rules: LogicRule[],
  facts: Record<string, unknown>,
  categories: CategoryInfo[],
): RuleEvaluation {
  const scores: Record<string, number> = { ...BASE_SCORES };
  for (const c of categories) if (!(c.code in scores)) scores[c.code] = 0;
  const hits: RuleHit[] = [];
  const addToMax: string[] = [];
  const memoPoints: string[] = [];
  const errors: { id: string; message: string }[] = [];
  let minBudgetFactor = 1;

  const sorted = [...rules].sort((x, y) => (x.priority ?? 0) - (y.priority ?? 0) || x.id.localeCompare(y.id));
  for (const rule of sorted) {
    if (!rule.enabled) continue;
    let matched = false;
    try {
      matched = truthy(evalLogic(rule.condition, facts));
    } catch (e) {
      errors.push({ id: rule.id, message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (!matched) continue;
    hits.push({ id: rule.id, name: rule.name, rationale: interpolate(rule.rationale, facts) });
    const eff = rule.effect;
    for (const [code, delta] of Object.entries(eff.scores ?? {})) scores[code] = (scores[code] ?? 0) + delta;
    if (eff.minBudgetFactor != null) minBudgetFactor = Math.min(minBudgetFactor, eff.minBudgetFactor);
    for (const c of eff.addToMax ?? []) if (!addToMax.includes(c)) addToMax.push(c);
    if (eff.penalizeTaxBucketGte != null) {
      for (const c of categories) {
        if ((c.typicalTaxBucket ?? 0) >= eff.penalizeTaxBucketGte) scores[c.code] = (scores[c.code] ?? 0) - 2;
      }
    }
    if (eff.penalizeLongVariable) {
      for (const c of categories) if (c.longVariable) scores[c.code] = (scores[c.code] ?? 0) - 2;
    }
    if (eff.memoPoint) memoPoints.push(interpolate(eff.memoPoint, facts));
  }
  return { hits, scores, minBudgetFactor, addToMax, memoPoints, errors };
}

/** Replace {path} placeholders with fact values. */
export function interpolate(template: string, facts: Record<string, unknown>): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, key: string) => {
    const v = evalLogic({ var: key }, facts);
    if (v == null) return '—';
    if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('ja-JP') : v.toFixed(2);
    return String(v);
  });
}

import { buildPool, checkSections, type ComplianceIssue, type NumberPool, type TextSection } from '@p3/compliance';
import type { LlmConfig } from './config';
import { flattenMoney, type NarrativeContext } from './context';
import { structuredCall, type LlmUsage } from './llm';
import { templateNarrative } from './narrative-template';
import { GENERATE_INSTRUCTIONS } from './prompts';
import { NarrativeSchema, type Narrative } from './schemas';

/** Numbers that narrative text may contain: calc results, inputs, statistics, settings and tax-rule constants. */
export function groundingPool(ctx: NarrativeContext): NumberPool {
  const k = ctx.knowledge;
  const taxConstants = [4, 6, 7, 9, 10, 30, 40, 50, 60, 70, 75, 85, 100, 116, 500];
  return buildPool(
    ctx.calc,
    ctx.planSet.plans,
    ctx.company,
    ctx.officer,
    ctx.existingPolicies,
    k.statistics.map((s) => [s.value, s.numbers ?? []]),
    k.settings,
    k.taxRules.map((t) => [t.peakRateFrom, t.peakRateTo]),
    taxConstants,
  );
}

/** Flatten a narrative into checkable text sections. Talk script and memo are internal. */
export function narrativeSections(n: Narrative): TextSection[] {
  const s: TextSection[] = [];
  const add = (id: string, label: string, text: string, audience: TextSection['audience']) => s.push({ id, label, text, audience });
  for (const p of n.plans) {
    add(`plans.${p.tier}.headline`, `${p.tier} キャッチ`, p.headline, 'customer');
    p.whyThisCompany.forEach((t, i) => add(`plans.${p.tier}.whyThisCompany.${i}`, `${p.tier} 根拠${i + 1}`, t, 'customer'));
    p.merits.forEach((t, i) => add(`plans.${p.tier}.merits.${i}`, `${p.tier} メリット`, t, 'customer'));
    p.cautions.forEach((t, i) => add(`plans.${p.tier}.cautions.${i}`, `${p.tier} 注意点`, t, 'customer'));
    add(`plans.${p.tier}.fitFor`, `${p.tier} 向いている経営者`, p.fitFor, 'customer');
  }
  add('onePaper.title', 'タイトル', n.onePaper.title, 'customer');
  add('onePaper.lead', 'リード', n.onePaper.lead, 'customer');
  add('onePaper.closing', '次のアクション', n.onePaper.closing, 'customer');
  add('talkScript.opening', 'オープニング', n.talkScript.opening, 'internal');
  add('talkScript.problemFraming', '課題の言語化', n.talkScript.problemFraming, 'internal');
  n.talkScript.planWalkthrough.forEach((w, i) => add(`talkScript.planWalkthrough.${i}`, `${w.tier} 説明`, w.script, 'internal'));
  add('talkScript.closingQuestion', 'クロージング', n.talkScript.closingQuestion, 'internal');
  n.talkScript.objectionHandling.forEach((o, i) => add(`talkScript.objectionHandling.${i}`, `反論対応：${o.objection}`, o.response, 'internal'));
  n.rationaleMemo.forEach((t, i) => add(`rationaleMemo.${i}`, '根拠メモ', t, 'internal'));
  return s;
}

/** Structural checks: tiers, reference ids, mandatory disclaimers present in cautions. */
export function structuralIssues(n: Narrative, ctx: NarrativeContext): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const ids = new Set(Object.keys(flattenMoney(ctx.calc, ctx.planSet)));
  const tiers = n.plans.map((p) => p.tier).join(',');
  if (tiers !== 'MIN,BALANCED,MAX') issues.push({ type: 'schema', severity: 'error', section: 'plans', message: `3案の並びが不正です（${tiers}）` });
  for (const p of n.plans) {
    if (p.headline.length > 30) issues.push({ type: 'schema', severity: 'error', section: `plans.${p.tier}.headline`, message: 'キャッチが30字を超えています' });
    for (const ref of p.whyThisCompanyRefs.flat()) {
      if (!ids.has(ref)) issues.push({ type: 'schema', severity: 'error', section: `plans.${p.tier}.whyThisCompany`, message: `存在しない calcId「${ref}」を参照しています` });
    }
  }
  for (const o of n.talkScript.objectionHandling) {
    for (const ref of o.backedBy) if (!ids.has(ref)) issues.push({ type: 'schema', severity: 'error', section: 'talkScript.objectionHandling', message: `存在しない calcId「${ref}」を参照しています` });
  }
  return issues;
}

/** Ensure category disclaimers are present in each plan's cautions (added in code, never dropped). */
export function enforceCautions(n: Narrative, ctx: NarrativeContext): Narrative {
  const plans = n.plans.map((p) => {
    const plan = ctx.planSet.plans.find((x) => x.tier === p.tier);
    const required = plan ? plan.components.flatMap((c) => ctx.knowledge.categories.find((k) => k.code === c.categoryCode)?.mandatoryDisclaimers ?? []) : [];
    const cautions = [...p.cautions];
    for (const r of required) if (!cautions.includes(r)) cautions.push(r);
    return { ...p, cautions };
  });
  return { ...n, plans };
}

export function narrativeIssues(n: Narrative, ctx: NarrativeContext, pool: NumberPool): ComplianceIssue[] {
  return [...structuralIssues(n, ctx), ...checkSections(narrativeSections(n), ctx.knowledge, pool)];
}

/** Replace every field that has an error with the template's corresponding field. */
export function patchWithTemplate(n: Narrative, tpl: Narrative, issues: ComplianceIssue[]): { narrative: Narrative; patched: string[] } {
  const out = structuredClone(n);
  const patched = new Set<string>();
  const errorSections = new Set(issues.filter((i) => i.severity === 'error').map((i) => i.section));
  if (errorSections.has('plans')) return { narrative: tpl, patched: ['all'] };
  for (const sec of errorSections) {
    const parts = sec.split('.');
    if (parts[0] === 'plans') {
      const idx = out.plans.findIndex((p) => p.tier === parts[1]);
      const tIdx = tpl.plans.findIndex((p) => p.tier === parts[1]);
      if (idx < 0 || tIdx < 0) continue;
      const field = parts[2] as keyof Narrative['plans'][number];
      if (field === 'whyThisCompany' || field === 'whyThisCompanyRefs') {
        out.plans[idx]!.whyThisCompany = tpl.plans[tIdx]!.whyThisCompany;
        out.plans[idx]!.whyThisCompanyRefs = tpl.plans[tIdx]!.whyThisCompanyRefs;
      } else if (field) {
        (out.plans[idx] as Record<string, unknown>)[field] = tpl.plans[tIdx]![field];
      }
      patched.add(`plans.${parts[1]}.${field}`);
    } else if (parts[0] === 'onePaper') {
      const f = parts[1] as keyof Narrative['onePaper'];
      out.onePaper[f] = tpl.onePaper[f];
      patched.add(sec);
    } else if (parts[0] === 'talkScript') {
      const f = parts[1] as keyof Narrative['talkScript'];
      (out.talkScript as Record<string, unknown>)[f] = tpl.talkScript[f];
      patched.add(`talkScript.${f}`);
    } else if (parts[0] === 'rationaleMemo') {
      out.rationaleMemo = tpl.rationaleMemo;
      patched.add('rationaleMemo');
    }
  }
  return { narrative: out, patched: [...patched] };
}

export interface NarrativeResult {
  narrative: Narrative;
  source: 'llm' | 'template' | 'mixed';
  attempts: number;
  usage: LlmUsage[];
  patched: string[];
  issuesBeforePatch: ComplianceIssue[];
  error: string | null;
}

/**
 * Build the Step 5 user prompt. `compact` drops formulas and the draft's merit/caution lists
 * (they are re-derived in code) to stay under small input limits.
 */
export function buildUserPrompt(ctx: NarrativeContext, draft: Narrative, feedback: ComplianceIssue[], opts: { compact?: boolean } = {}): string {
  const money = Object.values(flattenMoney(ctx.calc, ctx.planSet)).map((m) => ({ calcId: m.calcId, value: m.value, unit: m.unit, ...(opts.compact ? {} : { formula: m.formula }), ...(m.assumed ? { assumed: true } : {}) }));
  const plans = ctx.planSet.plans.map((p) => ({
    tier: p.tier,
    title: p.title,
    concept: p.concept,
    coverageRatioPct: p.coverageRatioMoney.value,
    components: p.components.map((c) => ({ label: c.label, role: c.role, deathBenefit: c.deathBenefit.value, termToAge: c.termToAge, purpose: c.purpose, taxTreatment: c.taxTreatment })),
    notes: p.notes,
    ruleHits: p.ruleHits,
  }));
  const customer = {
    companyName: ctx.company.name,
    industry: ctx.industryLabel,
    issues: ctx.extraction.issues,
    interests: ctx.extraction.interests,
    objections: ctx.extraction.objections,
    smallTalkInsights: ctx.extraction.smallTalkInsights,
    missingInfo: ctx.extraction.missingInfo,
  };
  const parts = [
    GENERATE_INSTRUCTIONS,
    `<CALC_RESULT>\n${JSON.stringify(money)}\n</CALC_RESULT>`,
    `<PLANS>\n${JSON.stringify(plans)}\n</PLANS>`,
    `<RULE_HITS>\n${JSON.stringify(ctx.planSet.ruleHits)}\n</RULE_HITS>`,
    `<CUSTOMER>\n${JSON.stringify(customer)}\n</CUSTOMER>`,
    `<DRAFT>\n${JSON.stringify(opts.compact ? { ...draft, plans: draft.plans.map((p) => ({ ...p, merits: [], cautions: [] })), rationaleMemo: [] } : draft)}\n</DRAFT>`,
  ];
  if (opts.compact) parts.push('merits・cautions・rationaleMemo は空配列で返してください（コード側で補完します）。');
  if (feedback.length) {
    parts.push(`<FEEDBACK>\n前回の出力に次の問題がありました。すべて修正してください：\n${feedback.map((f) => `- [${f.section}] ${f.message}${f.suggestion ? `（${f.suggestion}）` : ''}`).join('\n')}\n</FEEDBACK>`);
  }
  return parts.join('\n\n');
}

/** Lists the model may leave empty (compact prompts) are filled from the template. */
function fillEmpty(n: Narrative, tpl: Narrative): Narrative {
  return {
    ...n,
    plans: n.plans.map((p) => {
      const t = tpl.plans.find((x) => x.tier === p.tier);
      return t ? { ...p, merits: p.merits.length ? p.merits : t.merits, cautions: p.cautions.length ? p.cautions : t.cautions } : p;
    }),
    rationaleMemo: n.rationaleMemo.length ? n.rationaleMemo : tpl.rationaleMemo,
  };
}

/** A function that sends the user prompt to a model and resolves the raw (unvalidated) JSON output. */
export type NarrativeCaller = (prompt: string) => Promise<{ data: unknown; usage?: LlmUsage | null }>;

/** Step 5 (+ grounding part of Step 6): language generation with validation, retries and template fallback. */
export async function generateNarrative(ctx: NarrativeContext, cfg: LlmConfig, opts: { maxRegenerations?: number; caller?: NarrativeCaller } = {}): Promise<NarrativeResult> {
  const caller: NarrativeCaller | null =
    opts.caller ??
    (cfg.enabled
      ? async (prompt) => {
          const r = await structuredCall({ cfg, model: cfg.mainModel, knowledge: ctx.knowledge, schema: NarrativeSchema, temperature: 0.4, user: prompt });
          return { data: r.data, usage: r.usage };
        }
      : null);
  return runNarrativeLoop(ctx, caller, opts.maxRegenerations ?? 2);
}

/** The validation / regeneration / patch loop, independent of how the model is called. */
export async function runNarrativeLoop(ctx: NarrativeContext, caller: NarrativeCaller | null, maxRegen = 2, promptOpts: { compact?: boolean } = {}): Promise<NarrativeResult> {
  const pool = groundingPool(ctx);
  const tpl = enforceCautions(templateNarrative(ctx), ctx);
  if (!caller) return { narrative: tpl, source: 'template', attempts: 0, usage: [], patched: [], issuesBeforePatch: [], error: null };

  const usage: LlmUsage[] = [];
  let feedback: ComplianceIssue[] = [];
  let last: Narrative | null = null;
  let lastIssues: ComplianceIssue[] = [];
  let attempts = 0;
  let error: string | null = null;
  for (let i = 0; i <= maxRegen; i++) {
    attempts++;
    try {
      const { data, usage: u } = await caller(buildUserPrompt(ctx, tpl, feedback, promptOpts));
      if (u) usage.push(u);
      const parsed = NarrativeSchema.safeParse(data);
      if (!parsed.success) {
        feedback = [{ type: 'schema', severity: 'error', section: 'plans', message: `出力がスキーマに合いません：${parsed.error.issues.slice(0, 3).map((x) => `${x.path.join('.')} ${x.message}`).join(' / ')}` }];
        continue;
      }
      last = enforceCautions(fillEmpty(parsed.data, tpl), ctx);
      lastIssues = narrativeIssues(last, ctx, pool);
      if (!lastIssues.some((x) => x.severity === 'error')) return { narrative: last, source: 'llm', attempts, usage, patched: [], issuesBeforePatch: lastIssues, error: null };
      feedback = lastIssues.filter((x) => x.severity === 'error');
    } catch (e) {
      error = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
      break;
    }
  }
  if (!last) return { narrative: tpl, source: 'template', attempts, usage, patched: ['all'], issuesBeforePatch: [], error };
  const { narrative, patched } = patchWithTemplate(last, tpl, lastIssues);
  return { narrative, source: patched.includes('all') ? 'template' : 'mixed', attempts, usage, patched, issuesBeforePatch: lastIssues, error };
}

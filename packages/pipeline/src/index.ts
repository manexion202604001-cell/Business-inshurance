import { buildReport, type ComplianceIssue, type ComplianceReport, type MaskHit } from '@p3/compliance';
import {
  runEngine,
  type CalcResult,
  type CaseInput,
  type CompanyInput,
  type ExistingPolicyInput,
  type OfficerInput,
  type PlanSet,
  type Tier,
} from '@p3/engine';
import { toEngineKnowledge, type KnowledgeSnapshot } from '@p3/knowledge';
import {
  extract,
  fieldLabel,
  generateNarrative,
  groundingPool,
  narrativeIssues,
  llmConfig,
  llmReview,
  narrativeSections,
  PROMPT_VERSION,
  type Extraction,
  type LlmConfig,
  type LlmUsage,
  type Narrative,
  type NarrativeCaller,
  type NarrativeContext,
} from '@p3/llm';
import { PDF_FONT_BASE, renderDoc, scanRendered, type DocType, type RenderInput } from '@p3/render';
import { industryLabel } from './industries';
import { normalizeLog } from './normalize';

export * from './industries';
export * from './normalize';

export type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const STEP_LABEL: Record<StepId, string> = {
  1: '入力の正規化・マスキング',
  2: '商談ログの抽出',
  3: '必要保障額などの計算',
  4: '3案の構成',
  5: '提案文の作成',
  6: 'コンプライアンス検証',
  7: '資料のレンダリング',
};

export interface ProgressEvent {
  step: StepId;
  label: string;
  status: 'start' | 'done' | 'error';
  ms?: number;
  data?: unknown;
}

/** Form input. Optional company/officer fields may be null (not entered). */
export interface CaseForm {
  company: CompanyInput;
  officer: OfficerInput;
  existingPolicies: ExistingPolicyInput[];
  rawLog: string;
  onDutyDeath?: boolean;
}

export interface PipelineOptions {
  llm?: LlmConfig;
  maskPii?: boolean;
  onProgress?: (e: ProgressEvent) => void;
  /** Re-run from Step 3 with a previous extraction (after correcting assumed values). */
  reuse?: { normalizedLog: string; inputMaskHits: { kind: string; match: string }[]; extraction: Extraction };
  llmReview?: boolean;
  now?: () => Date;
  /** Custom model caller for Step 5 (e.g. a browser-side Claude call). */
  narrativeCaller?: NarrativeCaller;
  /** Render options for the Step 7 scan (font CSS override for browsers). */
  fontCss?: string;
}

export interface Supplement {
  field: string;
  label: string;
  value: number;
}

export interface PipelineResult {
  normalizedLog: string;
  inputMaskHits: { kind: string; match: string }[];
  extraction: Extraction;
  supplemented: Supplement[];
  engineInput: CaseInput;
  calc: CalcResult;
  facts: Record<string, unknown>;
  planSet: PlanSet;
  narrative: Narrative;
  narrativeMeta: { source: 'llm' | 'template' | 'mixed'; attempts: number; patched: string[]; error: string | null; extractionError: string | null };
  compliance: ComplianceReport;
  docReports: Record<DocType, ComplianceReport>;
  metrics: {
    stepMs: Partial<Record<StepId, number>>;
    totalMs: number;
    llmMs: number;
    usage: LlmUsage[];
    llmEnabled: boolean;
    llmReason: string;
    models: { main: string; fast: string };
    promptVersion: string;
    knowledgeVersion: string;
  };
  generatedAt: string;
}

const SUPPLEMENTABLE: [keyof Extraction['companyFacts'], 'company' | 'officer', string][] = [
  ['ordinaryProfit', 'company', 'ordinaryProfit'],
  ['netAssets', 'company', 'netAssets'],
  ['loanShortTerm', 'company', 'loanShortTerm'],
  ['loanMonthlyRepay', 'company', 'loanMonthlyRepay'],
  ['monthlyLabor', 'company', 'monthlyLabor'],
  ['monthlyFixed', 'company', 'monthlyFixed'],
  ['plannedRetireAge', 'officer', 'plannedRetireAge'],
  ['legalHeirs', 'officer', 'legalHeirs'],
];

/** Build the engine input: form values win; empty optional fields are supplemented from the log. */
export function buildEngineInput(form: CaseForm, ex: Extraction): { input: CaseInput; supplemented: Supplement[] } {
  const company = { ...form.company };
  const officer = { ...form.officer };
  const supplemented: Supplement[] = [];
  for (const [factKey, section, key] of SUPPLEMENTABLE) {
    const target = (section === 'company' ? company : officer) as unknown as Record<string, unknown>;
    const v = ex.companyFacts[factKey];
    if (target[key] == null && v != null) {
      target[key] = v;
      supplemented.push({ field: key, label: fieldLabel(factKey), value: v });
    }
  }
  let existingPolicies = form.existingPolicies;
  if (existingPolicies.length === 0 && ex.existingPolicies.length > 0) {
    existingPolicies = ex.existingPolicies
      .filter((p) => p.deathBenefit != null)
      .map((p) => ({ category: p.categoryGuess, deathBenefit: p.deathBenefit, note: `商談ログから補完（要確認）：${p.note}` }));
    for (const p of existingPolicies) supplemented.push({ field: 'existingPolicies', label: '既存保険の死亡保障', value: p.deathBenefit ?? 0 });
  }
  const input: CaseInput = {
    company,
    officer,
    existingPolicies,
    signals: {
      issueTags: [...new Set(ex.issues.map((i) => i.tag))],
      deficitMentioned: ex.signals.deficitMentioned ?? false,
      employeeRetirementPrepared: ex.signals.employeeRetirementPrepared,
      officerRetirementPrepared: ex.signals.officerRetirementPrepared,
      onDutyDeath: form.onDutyDeath ?? false,
    },
  };
  return { input, supplemented };
}

export function toRenderInput(r: Pick<PipelineResult, 'engineInput' | 'calc' | 'planSet' | 'narrative' | 'extraction' | 'generatedAt'>, k: KnowledgeSnapshot, extra: { recommendedTier?: Tier | null; ownerName?: string } = {}): RenderInput {
  return {
    company: r.engineInput.company,
    officer: r.engineInput.officer,
    existingPolicies: r.engineInput.existingPolicies,
    industryLabel: industryLabel(r.engineInput.company.industry),
    calc: r.calc,
    planSet: r.planSet,
    narrative: r.narrative,
    extraction: r.extraction,
    knowledge: k,
    recommendedTier: extra.recommendedTier ?? null,
    generatedAt: r.generatedAt,
    ...(extra.ownerName ? { ownerName: extra.ownerName } : {}),
  };
}

export const DOC_TYPES: DocType[] = ['summary', 'design', 'slides', 'memo'];

/** Steps 1–7. Every step is deterministic except 2 and 5 (LLM, with rule/template fallbacks). */
export async function runPipeline(form: CaseForm, k: KnowledgeSnapshot, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const cfg = opts.llm ?? llmConfig();
  const emit = opts.onProgress ?? (() => {});
  const stepMs: Partial<Record<StepId, number>> = {};
  const usage: LlmUsage[] = [];
  const t0 = Date.now();
  const step = async <T>(id: StepId, fn: () => Promise<T> | T, data?: (v: T) => unknown): Promise<T> => {
    emit({ step: id, label: STEP_LABEL[id], status: 'start' });
    const s = Date.now();
    try {
      const v = await fn();
      stepMs[id] = Date.now() - s;
      emit({ step: id, label: STEP_LABEL[id], status: 'done', ms: stepMs[id], data: data ? data(v) : undefined });
      return v;
    } catch (e) {
      emit({ step: id, label: STEP_LABEL[id], status: 'error', data: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  };

  // Step 1
  const norm = await step(1, () => {
    if (opts.reuse) return { text: opts.reuse.normalizedLog, hits: opts.reuse.inputMaskHits as unknown as MaskHit[] };
    return normalizeLog(form.rawLog, k.maskingTerms, { pii: opts.maskPii });
  }, (v) => ({ masked: v.hits.length }));
  const inputMaskHits = norm.hits.map((h) => ({ kind: h.kind, match: h.match }));

  // Step 2
  const formSnapshot = { company: form.company, officer: form.officer, existingPolicies: form.existingPolicies };
  const ex = await step(2, async () => {
    if (opts.reuse) return { extraction: opts.reuse.extraction, usage: null, error: null };
    return extract(norm.text, formSnapshot, k, cfg);
  }, (v) => ({ issues: v.extraction.issues, missingInfo: v.extraction.missingInfo, conflicts: v.extraction.conflicts, source: v.extraction.source }));
  if (ex.usage) usage.push(ex.usage);
  const extraction = ex.extraction;

  // Steps 3–4
  const { input, supplemented } = buildEngineInput(form, extraction);
  const engineKnowledge = toEngineKnowledge(k);
  const engineOut = await step(3, () => runEngine(input, engineKnowledge), (v) => ({ required: v.calc.coverage.required.value, gap: v.calc.coverage.gap.value }));
  for (const s of supplemented) {
    engineOut.calc.assumptions.push({ field: s.field, label: s.label, value: s.value, unit: s.field === 'plannedRetireAge' ? '歳' : s.field === 'legalHeirs' ? '人' : '万円', reason: '入力が空欄のため商談ログの発言から補完（要確認）' });
  }
  await step(4, () => engineOut.planSet, (v) => ({ plans: v.plans.map((p) => ({ tier: p.tier, title: p.title })) }));

  // Step 5
  const generatedAt = (opts.now ?? (() => new Date()))().toISOString();
  const ctx: NarrativeContext = {
    company: input.company,
    officer: input.officer,
    existingPolicies: input.existingPolicies,
    industryLabel: industryLabel(input.company.industry),
    calc: engineOut.calc,
    planSet: engineOut.planSet,
    extraction,
    knowledge: k,
  };
  const nar = await step(5, () => generateNarrative(ctx, cfg, opts.narrativeCaller ? { caller: opts.narrativeCaller } : {}), (v) => ({ source: v.source, attempts: v.attempts }));
  usage.push(...nar.usage);

  // Step 6: validation of the narrative (grounding already enforced in step 5) + optional LLM review
  const issues: ComplianceIssue[] = [];
  const renderBase = { engineInput: input, calc: engineOut.calc, planSet: engineOut.planSet, narrative: nar.narrative, extraction, generatedAt };
  await step(6, async () => {
    issues.push(...narrativeIssues(nar.narrative, ctx, groundingPool(ctx)));
    if (opts.llmReview ?? cfg.enabled) {
      const rv = await llmReview(narrativeSections(nar.narrative), k, cfg);
      if (rv.usage) usage.push(rv.usage);
      issues.push(...rv.issues);
    }
  }, () => ({ issues: issues.length }));

  // Step 7: render all documents and scan them before they can be shown or exported
  const docReports = {} as Record<DocType, ComplianceReport>;
  await step(7, () => {
    const ri = toRenderInput(renderBase, k);
    for (const t of DOC_TYPES) {
      const html = renderDoc(t, ri, { fontBase: PDF_FONT_BASE, ...(opts.fontCss ? { fontCss: opts.fontCss } : {}) });
      docReports[t] = scanRendered(t, html, ri);
      issues.push(...docReports[t].issues);
    }
  }, () => Object.fromEntries(Object.entries(docReports).map(([t, r]) => [t, r.status])));

  const compliance = buildReport(issues);
  return {
    normalizedLog: norm.text,
    inputMaskHits,
    extraction,
    supplemented,
    engineInput: input,
    calc: engineOut.calc,
    facts: engineOut.facts,
    planSet: engineOut.planSet,
    narrative: nar.narrative,
    narrativeMeta: { source: nar.source, attempts: nar.attempts, patched: nar.patched, error: nar.error, extractionError: ex.error },
    compliance,
    docReports,
    metrics: {
      stepMs,
      totalMs: Date.now() - t0,
      llmMs: usage.reduce((s, u) => s + u.ms, 0),
      usage,
      llmEnabled: cfg.enabled,
      llmReason: cfg.reason,
      models: { main: cfg.mainModel, fast: cfg.fastModel },
      promptVersion: PROMPT_VERSION,
      knowledgeVersion: k.version,
    },
    generatedAt,
  };
}

import 'server-only';
import { randomBytes } from 'node:crypto';
import { audit, getActiveKnowledge, getKnowledgeVersion, prisma, type Prisma } from '@p3/db';
import type { CalcResult, CaseInput, PlanSet, Tier } from '@p3/engine';
import { loadSeedKnowledge, type KnowledgeSnapshot } from '@p3/knowledge';
import type { Extraction, Narrative } from '@p3/llm';
import { runPipeline, toRenderInput, type CaseForm, type PipelineResult, type ProgressEvent } from '@p3/pipeline';
import type { ComplianceReport } from '@p3/compliance';
import type { DocType, RenderInput } from '@p3/render';
import { HttpError } from './api';
import { isManager, type SessionUser } from './session';

const J = (v: unknown) => v as Prisma.InputJsonValue;

export type CaseRow = NonNullable<Awaited<ReturnType<typeof loadCase>>>;

export async function loadCase(id: string) {
  return prisma.case.findUnique({ where: { id }, include: { company: true, owner: { select: { id: true, name: true } } } });
}

export async function getCaseFor(user: SessionUser, id: string): Promise<CaseRow> {
  const c = await loadCase(id);
  if (!c) throw new HttpError(404, '案件が見つかりません');
  if (c.ownerId !== user.id && !isManager(user)) throw new HttpError(403, 'この案件を閲覧する権限がありません');
  return c;
}

export function formOf(c: CaseRow): CaseForm {
  return c.form as unknown as CaseForm;
}

async function knowledgeOf(c: { knowledgeVersion: string | null }): Promise<KnowledgeSnapshot> {
  if (c.knowledgeVersion) {
    const k = await getKnowledgeVersion(c.knowledgeVersion);
    if (k) return k;
  }
  return getActiveKnowledge();
}

function statusFrom(r: PipelineResult): string {
  return r.compliance.status === 'blocked' ? 'blocked' : 'generated';
}

async function saveResult(caseId: string, r: PipelineResult, actor: string, action: string) {
  await prisma.case.update({
    where: { id: caseId },
    data: {
      normalizedLog: r.normalizedLog,
      inputMaskHits: J(r.inputMaskHits),
      extracted: J(r.extraction),
      engineInput: J(r.engineInput),
      calc: J(r.calc),
      plans: J(r.planSet),
      outputs: J({ narrative: r.narrative, meta: r.narrativeMeta, supplemented: r.supplemented, facts: r.facts }),
      compliance: J(r.compliance),
      docReports: J(r.docReports),
      metrics: J(r.metrics),
      status: statusFrom(r),
      error: null,
      knowledgeVersion: r.metrics.knowledgeVersion,
      promptVersion: r.metrics.promptVersion,
      llmModel: r.metrics.llmEnabled ? `${r.metrics.models.main} / ${r.metrics.models.fast}` : 'template',
      generatedAt: new Date(r.generatedAt),
      approvedAt: null,
      approvedById: null,
    },
  });
  await audit(actor, action, { status: statusFrom(r), compliance: r.compliance.counts, totalMs: r.metrics.totalMs, knowledgeVersion: r.metrics.knowledgeVersion, narrative: r.narrativeMeta.source }, caseId);
}

/** Full generation (Steps 1–7) with the latest published knowledge. */
export async function generateCase(user: SessionUser, id: string, onProgress?: (e: ProgressEvent) => void): Promise<PipelineResult> {
  const c = await getCaseFor(user, id);
  const k = await getActiveKnowledge();
  await prisma.case.update({ where: { id }, data: { status: 'generating', error: null } });
  try {
    const r = await runPipeline(formOf(c), k, { onProgress, maskPii: process.env.P3_MASK_PII === '1' });
    await saveResult(id, r, user.email, 'generate');
    return r;
  } catch (e) {
    await prisma.case.update({ where: { id }, data: { status: 'error', error: e instanceof Error ? e.message : String(e) } });
    await audit(user.email, 'generate_error', { error: String(e) }, id);
    throw e;
  }
}

export interface Overrides {
  company?: Record<string, number | null>;
  officer?: Record<string, number | null>;
}

const EDITABLE_COMPANY = ['revenue', 'ordinaryProfit', 'netAssets', 'loanTotal', 'loanShortTerm', 'loanMonthlyRepay', 'monthlyLabor', 'monthlyFixed', 'employeeCount'];
const EDITABLE_OFFICER = ['age', 'monthlyPay', 'tenureYears', 'plannedRetireAge', 'legalHeirs'];

/** Correct assumed values and re-run from Step 3 (reuses the previous extraction). */
export async function recalcCase(user: SessionUser, id: string, ov: Overrides): Promise<PipelineResult> {
  const c = await getCaseFor(user, id);
  if (!c.extracted || !c.normalizedLog) throw new HttpError(409, '先に3案を作成してください');
  const form = structuredClone(formOf(c));
  for (const [k, v] of Object.entries(ov.company ?? {})) if (EDITABLE_COMPANY.includes(k)) (form.company as unknown as Record<string, unknown>)[k] = v;
  for (const [k, v] of Object.entries(ov.officer ?? {})) if (EDITABLE_OFFICER.includes(k)) (form.officer as unknown as Record<string, unknown>)[k] = v;
  const k = await getActiveKnowledge();
  const r = await runPipeline(form, k, {
    maskPii: process.env.P3_MASK_PII === '1',
    reuse: { normalizedLog: c.normalizedLog, inputMaskHits: (c.inputMaskHits as { kind: string; match: string }[]) ?? [], extraction: c.extracted as unknown as Extraction },
  });
  await prisma.case.update({ where: { id }, data: { form: J(form) } });
  await syncCompany(c.companyId, form);
  await saveResult(id, r, user.email, 'recalc');
  return r;
}

export async function syncCompany(companyId: string, form: CaseForm) {
  const co = form.company;
  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: co.name, industry: co.industry, fiscalMonth: co.fiscalMonth ?? null, revenue: co.revenue, ordinaryProfit: co.ordinaryProfit ?? null, netAssets: co.netAssets ?? null,
      loanTotal: co.loanTotal, loanShortTerm: co.loanShortTerm ?? null, loanMonthlyRepay: co.loanMonthlyRepay ?? null, monthlyLabor: co.monthlyLabor ?? null, monthlyFixed: co.monthlyFixed ?? null, employeeCount: co.employeeCount,
    },
  });
}

export interface CaseView {
  id: string;
  status: string;
  error: string | null;
  companyName: string;
  ownerName: string;
  form: CaseForm;
  extraction: Extraction | null;
  engineInput: CaseInput | null;
  calc: CalcResult | null;
  planSet: PlanSet | null;
  narrative: Narrative | null;
  narrativeMeta: PipelineResult['narrativeMeta'] | null;
  supplemented: PipelineResult['supplemented'];
  inputMaskHits: { kind: string; match: string }[];
  compliance: ComplianceReport | null;
  docReports: Record<DocType, ComplianceReport> | null;
  metrics: PipelineResult['metrics'] | null;
  recommendedTier: Tier | null;
  knowledgeVersion: string | null;
  promptVersion: string | null;
  llmModel: string | null;
  generatedAt: string | null;
  approvedAt: string | null;
  shareToken: string | null;
  shareExpiresAt: string | null;
  requireApproval: boolean;
  createdAt: string;
}

export async function toView(c: CaseRow): Promise<CaseView> {
  const out = (c.outputs ?? null) as { narrative: Narrative; meta: PipelineResult['narrativeMeta']; supplemented: PipelineResult['supplemented'] } | null;
  const k = c.knowledgeVersion ? await knowledgeOf(c) : await getActiveKnowledge();
  return {
    id: c.id,
    status: c.status,
    error: c.error,
    companyName: c.company.name,
    ownerName: c.owner.name,
    form: formOf(c),
    extraction: (c.extracted as unknown as Extraction) ?? null,
    engineInput: (c.engineInput as unknown as CaseInput) ?? null,
    calc: (c.calc as unknown as CalcResult) ?? null,
    planSet: (c.plans as unknown as PlanSet) ?? null,
    narrative: out?.narrative ?? null,
    narrativeMeta: out?.meta ?? null,
    supplemented: out?.supplemented ?? [],
    inputMaskHits: (c.inputMaskHits as { kind: string; match: string }[]) ?? [],
    compliance: (c.compliance as unknown as ComplianceReport) ?? null,
    docReports: (c.docReports as unknown as Record<DocType, ComplianceReport>) ?? null,
    metrics: (c.metrics as unknown as PipelineResult['metrics']) ?? null,
    recommendedTier: (c.recommendedTier as Tier | null) ?? null,
    knowledgeVersion: c.knowledgeVersion,
    promptVersion: c.promptVersion,
    llmModel: c.llmModel,
    generatedAt: c.generatedAt?.toISOString() ?? null,
    approvedAt: c.approvedAt?.toISOString() ?? null,
    shareToken: c.shareToken,
    shareExpiresAt: c.shareExpiresAt?.toISOString() ?? null,
    requireApproval: Boolean(k.presentation.requireApproval),
    createdAt: c.createdAt.toISOString(),
  };
}

/** Render input for a generated case, using the knowledge version it was generated with. */
export async function renderInputOf(c: CaseRow): Promise<{ input: RenderInput; knowledge: KnowledgeSnapshot }> {
  if (!c.calc || !c.plans || !c.outputs || !c.engineInput || !c.extracted) throw new HttpError(409, 'まだ3案が作成されていません');
  const k = (await knowledgeOf(c)) ?? loadSeedKnowledge();
  const out = c.outputs as { narrative: Narrative };
  const input = toRenderInput(
    {
      engineInput: c.engineInput as unknown as CaseInput,
      calc: c.calc as unknown as CalcResult,
      planSet: c.plans as unknown as PlanSet,
      narrative: out.narrative,
      extraction: c.extracted as unknown as Extraction,
      generatedAt: (c.generatedAt ?? c.createdAt).toISOString(),
    },
    k,
    { recommendedTier: (c.recommendedTier as Tier | null) ?? null, ownerName: c.owner.name },
  );
  return { input, knowledge: k };
}

/** Customer-facing output gate: blocked compliance or missing approval stops output. */
export function assertPresentable(c: CaseRow, k: KnowledgeSnapshot, type: DocType) {
  if (c.status === 'blocked') throw new HttpError(423, 'コンプライアンスチェックでブロックされているため出力できません');
  if (type !== 'memo' && k.presentation.requireApproval && !c.approvedAt) throw new HttpError(423, '顧客提示前にマネージャーの承認が必要です');
}

export function newShareToken(): string {
  return randomBytes(18).toString('base64url');
}

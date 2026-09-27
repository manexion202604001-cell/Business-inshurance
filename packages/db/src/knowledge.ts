import type { EngineSettings, LogicRule, ReferenceRate } from '@p3/engine';
import {
  loadSeedKnowledge,
  type BannedPhrase,
  type Disclaimers,
  type InsuranceCategory,
  type InternalRef,
  type KnowledgeSnapshot,
  type MaskingTerm,
  type PresentationSettings,
  type Statistic,
  type TaxRuleDef,
} from '@p3/knowledge';
import type { Prisma } from '@prisma/client';
import { prisma } from './client';

const J = (v: unknown) => v as Prisma.InputJsonValue;

/** Replace all knowledge tables with the given snapshot (used by the seed and by "restore version"). */
export async function writeKnowledgeTables(k: KnowledgeSnapshot): Promise<void> {
  await prisma.$transaction([
    prisma.insuranceCategory.deleteMany(),
    prisma.taxRule.deleteMany(),
    prisma.logicRule.deleteMany(),
    prisma.maskingTerm.deleteMany(),
    prisma.bannedPhrase.deleteMany(),
    prisma.referenceRate.deleteMany(),
    prisma.statistic.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.insuranceCategory.createMany({
      data: k.categories.map((c, i) => {
        const { code, name, source, asOf, ...data } = c;
        return { code, name, source: J(source), asOf, data: J(data), sortOrder: i };
      }),
    }),
    prisma.taxRule.createMany({ data: k.taxRules.map((t) => ({ bucket: t.bucket, asOf: t.asOf, data: J(t) })) }),
    prisma.logicRule.createMany({
      data: k.logicRules.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, priority: r.priority ?? 0, condition: J(r.condition), effect: J(r.effect), rationale: r.rationale })),
    }),
    prisma.maskingTerm.createMany({ data: k.maskingTerms.map((m) => ({ term: m.term, kind: m.kind, replacement: m.replacement, isRegex: m.isRegex })) }),
    prisma.bannedPhrase.createMany({
      data: k.bannedPhrases.map((b) => ({ phrase: b.phrase, isRegex: b.isRegex, category: b.category, severity: b.severity, suggestion: b.suggestion, allowContext: J(b.allowContext ?? []) })),
    }),
    prisma.referenceRate.createMany({
      data: k.referenceRates.map((r) => ({ category: r.category, sex: r.sex, age: r.age, termToAge: r.termToAge, annualPremiumPer1000man: r.annualPremiumPer1000man, peakReturnRate: r.peakReturnRate, peakYear: r.peakYear, source: r.source, asOf: r.asOf, isSample: Boolean(r.isSample) })),
    }),
    prisma.statistic.createMany({ data: k.statistics.map((s) => ({ key: s.key, asOf: s.asOf, data: J(s) })) }),
    prisma.setting.createMany({
      data: [
        { key: 'engine', value: J(k.settings) },
        { key: 'presentation', value: J(k.presentation) },
        { key: 'disclaimers', value: J(k.disclaimers) },
        { key: 'internalRefs', value: J(k.internalRefs) },
      ],
    }),
  ]);
}

/** Read the (editable) draft knowledge from the tables. */
export async function readDraftKnowledge(meta: { version: string; label: string; publishedAt?: string } = { version: 'draft', label: '編集中' }): Promise<KnowledgeSnapshot> {
  const [cats, taxes, rules, masks, banned, rates, stats, settings] = await Promise.all([
    prisma.insuranceCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.taxRule.findMany({ orderBy: { bucket: 'asc' } }),
    prisma.logicRule.findMany({ orderBy: [{ priority: 'asc' }, { id: 'asc' }] }),
    prisma.maskingTerm.findMany({ orderBy: { id: 'asc' } }),
    prisma.bannedPhrase.findMany({ orderBy: { id: 'asc' } }),
    prisma.referenceRate.findMany({ orderBy: { id: 'asc' } }),
    prisma.statistic.findMany({ orderBy: { key: 'asc' } }),
    prisma.setting.findMany(),
  ]);
  const seed = loadSeedKnowledge();
  const setting = <T>(key: string, fallback: T): T => (settings.find((s) => s.key === key)?.value as T | undefined) ?? fallback;
  return {
    version: meta.version,
    label: meta.label,
    publishedAt: meta.publishedAt ?? new Date().toISOString(),
    settings: { ...seed.settings, ...setting<Partial<EngineSettings>>('engine', {}) },
    presentation: { ...seed.presentation, ...setting<Partial<PresentationSettings>>('presentation', {}) },
    disclaimers: { ...seed.disclaimers, ...setting<Partial<Disclaimers>>('disclaimers', {}) },
    internalRefs: setting<InternalRef[]>('internalRefs', []),
    categories: cats.map((c) => ({ ...(c.data as object), code: c.code, name: c.name, source: c.source, asOf: c.asOf }) as unknown as InsuranceCategory),
    taxRules: taxes.map((t) => t.data as unknown as TaxRuleDef),
    logicRules: rules.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, priority: r.priority, condition: r.condition, effect: r.effect as LogicRule['effect'], rationale: r.rationale })),
    maskingTerms: masks.map((m) => ({ term: m.term, kind: m.kind as MaskingTerm['kind'], replacement: m.replacement, isRegex: m.isRegex })),
    bannedPhrases: banned.map((b) => ({ phrase: b.phrase, isRegex: b.isRegex, category: b.category as BannedPhrase['category'], severity: b.severity as BannedPhrase['severity'], suggestion: b.suggestion, allowContext: (b.allowContext as string[] | null) ?? [] })),
    referenceRates: rates.map((r) => ({ category: r.category, sex: r.sex as 'M' | 'F', age: r.age, termToAge: r.termToAge, annualPremiumPer1000man: r.annualPremiumPer1000man, peakReturnRate: r.peakReturnRate, peakYear: r.peakYear, source: r.source, asOf: r.asOf, isSample: r.isSample }) as ReferenceRate),
    statistics: stats.map((s) => s.data as unknown as Statistic),
  };
}

/** Publish the current draft as a new immutable knowledge version. */
export async function publishKnowledge(label: string, publishedBy: string): Promise<{ id: string }> {
  const now = new Date();
  const count = await prisma.knowledgeVersion.count();
  const id = `v${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(count + 1).padStart(3, '0')}`;
  const snapshot = await readDraftKnowledge({ version: id, label, publishedAt: now.toISOString() });
  await prisma.knowledgeVersion.create({ data: { id, label, snapshot: J(snapshot), publishedAt: now, publishedBy } });
  cache.clear();
  return { id };
}

const cache = new Map<string, KnowledgeSnapshot>();

export async function getKnowledgeVersion(id: string): Promise<KnowledgeSnapshot | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const row = await prisma.knowledgeVersion.findUnique({ where: { id } });
  if (!row) return null;
  const k = row.snapshot as unknown as KnowledgeSnapshot;
  cache.set(id, k);
  return k;
}

/** The latest published knowledge version (used for new generations). */
export async function getActiveKnowledge(): Promise<KnowledgeSnapshot> {
  const row = await prisma.knowledgeVersion.findFirst({ orderBy: { publishedAt: 'desc' }, select: { id: true } });
  if (row) {
    const k = await getKnowledgeVersion(row.id);
    if (k) return k;
  }
  return loadSeedKnowledge();
}

export function clearKnowledgeCache() {
  cache.clear();
}

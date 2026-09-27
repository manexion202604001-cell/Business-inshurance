import { DEFAULT_SETTINGS, type CategoryInfo, type EngineKnowledge, type EngineSettings, type LogicRule, type ReferenceRate } from '@p3/engine';
import bannedPhrases from '../seed/banned-phrases.json';
import categories from '../seed/categories.json';
import disclaimers from '../seed/disclaimers.json';
import internalRefs from '../seed/internal-refs.json';
import logicRules from '../seed/logic-rules.json';
import maskingTerms from '../seed/masking-terms.json';
import referenceRates from '../seed/reference-rates.json';
import settings from '../seed/settings.json';
import statistics from '../seed/statistics.json';
import taxRules from '../seed/tax-rules.json';
import type {
  BannedPhrase,
  Disclaimers,
  InsuranceCategory,
  InternalRef,
  KnowledgeSnapshot,
  MaskingTerm,
  PresentationSettings,
  Statistic,
  TaxRuleDef,
} from './types';

export * from './types';

export const SEED_VERSION = 'seed-2026.09';

/** Build the initial knowledge snapshot from the bundled seed JSON files. */
export function loadSeedKnowledge(): KnowledgeSnapshot {
  const engineOverrides = (settings as { engine: Partial<EngineSettings> }).engine;
  return {
    version: SEED_VERSION,
    label: '初期ナレッジ（参考資料より作成）',
    publishedAt: '2026-09-01T00:00:00.000Z',
    settings: { ...DEFAULT_SETTINGS, ...engineOverrides },
    presentation: (settings as { presentation: PresentationSettings }).presentation,
    categories: categories as InsuranceCategory[],
    taxRules: taxRules as TaxRuleDef[],
    logicRules: logicRules as LogicRule[],
    statistics: statistics as Statistic[],
    maskingTerms: maskingTerms as MaskingTerm[],
    bannedPhrases: bannedPhrases as BannedPhrase[],
    referenceRates: referenceRates as ReferenceRate[],
    disclaimers: disclaimers as Disclaimers,
    internalRefs: internalRefs as InternalRef[],
  };
}

export function toCategoryInfo(k: KnowledgeSnapshot): CategoryInfo[] {
  return k.categories.map((c) => ({
    code: c.code,
    name: c.name,
    typicalTaxBucket: c.typicalTaxBucket,
    retirementFunding: c.retirementFunding,
    longVariable: c.longVariable,
  }));
}

export function toEngineKnowledge(k: KnowledgeSnapshot): EngineKnowledge {
  return { settings: k.settings, rules: k.logicRules, categories: toCategoryInfo(k), rates: k.referenceRates };
}

/** "2026-02-01" -> "2026年2月" */
export function asOfLabel(iso: string): string {
  const [y, m] = iso.split('-');
  return `${Number(y)}年${Number(m)}月`;
}

export function categoryByCode(k: KnowledgeSnapshot, code: string): InsuranceCategory | undefined {
  return k.categories.find((c) => c.code === code);
}

export const CATEGORY_CODES = [
  'TERM_LOW_CV',
  'TERM_LEVEL_LONG',
  'TERM_DECREASING',
  'VARIABLE_TERM',
  'WHOLE_LIFE',
  'THIRD_SECTOR',
  'ENDOWMENT_HALF',
] as const;

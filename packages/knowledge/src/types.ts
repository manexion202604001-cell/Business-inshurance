import type { EngineSettings, LogicRule, ReferenceRate } from '@p3/engine';

export interface SourceRef {
  title: string;
  page: number | null;
}

export interface InsuranceCategory {
  code: string;
  name: string;
  description: string;
  typicalUse: string[];
  pros: string[];
  cons: string[];
  riskNotes: string[];
  mandatoryDisclaimers: string[];
  taxRuleRef: string;
  typicalTaxBucket: number | null;
  retirementFunding: boolean;
  longVariable: boolean;
  requiresVariableLicense: boolean;
  variants: { key: string; features: string[] }[];
  source: SourceRef;
  asOf: string;
}

export interface TaxRuleDef {
  bucket: number;
  label: string;
  peakRateFrom: number;
  peakRateTo: number;
  assetPeriod: string;
  assetAmount: string;
  reversal: string;
  note?: string;
  source: SourceRef;
  asOf: string;
}

export interface Statistic {
  key: string;
  label: string;
  value: number;
  unit: string;
  text: string;
  numbers?: number[];
  source: SourceRef;
  asOf: string;
}

export type MaskingKind = 'insurer' | 'product' | 'fund' | 'docId' | 'agency' | 'pii';

export interface MaskingTerm {
  term: string;
  kind: MaskingKind;
  replacement: string;
  isRegex: boolean;
}

export interface BannedPhrase {
  phrase: string;
  isRegex: boolean;
  category: 'tax_saving' | 'assurance' | 'comparison' | 'fear' | 'other';
  severity: 'error' | 'warning';
  suggestion: string;
  /** Phrases containing the match that are explicitly allowed (e.g. the mandatory "節税効果はありません"). */
  allowContext?: string[];
}

export interface Disclaimers {
  taxNoSaving: string;
  taxAsOf: string;
  estimate: string;
  image: string;
  purpose: string;
  loanTaxNote: string;
  regulation: string;
  sampleRates: string;
}

export interface PresentationSettings {
  brandName: string;
  accentColor: string;
  footerNote: string;
  requireApproval: boolean;
  showInternalRefs: boolean;
}

export interface InternalRef {
  categoryCode: string;
  variant: string;
  internalRef: string;
}

/** A complete, immutable knowledge snapshot used for one generation. */
export interface KnowledgeSnapshot {
  version: string;
  label: string;
  publishedAt: string;
  settings: EngineSettings;
  presentation: PresentationSettings;
  categories: InsuranceCategory[];
  taxRules: TaxRuleDef[];
  logicRules: LogicRule[];
  statistics: Statistic[];
  maskingTerms: MaskingTerm[];
  bannedPhrases: BannedPhrase[];
  referenceRates: ReferenceRate[];
  disclaimers: Disclaimers;
  internalRefs: InternalRef[];
}

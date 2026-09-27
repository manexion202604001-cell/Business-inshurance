import type { CalcResult, CompanyInput, ExistingPolicyInput, OfficerInput, PlanSet, Tier } from '@p3/engine';
import type { KnowledgeSnapshot } from '@p3/knowledge';
import type { Extraction, Narrative } from '@p3/llm';

export interface RenderInput {
  company: CompanyInput;
  officer: OfficerInput;
  existingPolicies: ExistingPolicyInput[];
  industryLabel: string;
  calc: CalcResult;
  planSet: PlanSet;
  narrative: Narrative;
  extraction: Extraction;
  knowledge: KnowledgeSnapshot;
  recommendedTier?: Tier | null;
  generatedAt: string;
  /** Sales rep display name for the memo. */
  ownerName?: string;
}

export interface RenderOptions {
  /** URL prefix where the Noto Serif JP woff2 files are served. */
  fontBase: string;
  /** Include the internal reference table in the memo (manager+ only). */
  showInternalRefs?: boolean;
  /** Screen preview: add auto-fit zoom and page shadows. */
  preview?: boolean;
}

export type DocType = 'summary' | 'design' | 'memo' | 'slides';

export const DOC_LABEL: Record<DocType, string> = {
  summary: 'サマリー型ワンペーパー',
  design: '設計書型（算定根拠）',
  memo: '営業向けメモ（社内用）',
  slides: 'Webスライド',
};

import type { KnowledgeSnapshot } from '@p3/knowledge';
import { findBanned } from './banned';
import { missingDisclaimers } from './disclaimers';
import { checkGrounding, type NumberPool } from './grounding';
import { findMaskHits } from './mask';

export * from './banned';
export * from './disclaimers';
export * from './grounding';
export * from './mask';
export * from './normalize';

export type IssueType = 'masking' | 'banned' | 'grounding' | 'disclaimer' | 'schema' | 'llm_review';

export interface ComplianceIssue {
  type: IssueType;
  severity: 'error' | 'warning';
  section: string;
  message: string;
  match?: string;
  suggestion?: string;
}

export interface ComplianceReport {
  status: 'ok' | 'warning' | 'blocked';
  issues: ComplianceIssue[];
  checkedAt: string;
  counts: Record<IssueType, number>;
}

export interface TextSection {
  id: string;
  label: string;
  text: string;
  audience: 'customer' | 'internal';
}

export const MASK_KIND_LABEL: Record<string, string> = {
  insurer: '保険会社名',
  product: '商品名',
  fund: 'ファンド・運用会社名',
  docId: '資料番号',
  agency: '代理店・連絡先',
  pii: '個人情報',
};

/** Run masking, banned-phrase and number-grounding checks over text sections. */
export function checkSections(sections: TextSection[], k: KnowledgeSnapshot, pool: NumberPool | null): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  for (const sec of sections) {
    if (!sec.text) continue;
    for (const h of findMaskHits(sec.text, k.maskingTerms)) {
      issues.push({ type: 'masking', severity: 'error', section: sec.id, message: `${MASK_KIND_LABEL[h.kind] ?? h.kind}「${h.match}」が含まれています`, match: h.match, suggestion: h.replacement ? `「${h.replacement}」に置き換えてください` : '削除してください' });
    }
    for (const b of findBanned(sec.text, k.bannedPhrases)) {
      issues.push({ type: 'banned', severity: b.severity, section: sec.id, message: `禁止表現「${b.match}」`, match: b.match, suggestion: b.suggestion });
    }
    if (pool) {
      for (const v of checkGrounding(sec.text, pool)) {
        issues.push({ type: 'grounding', severity: 'error', section: sec.id, message: `計算結果にない数値「${v.raw}」`, match: v.raw, suggestion: '計算結果（CalcResult）の数値のみを使ってください' });
      }
    }
  }
  return issues;
}

export function checkDisclaimers(documentText: string, required: string[], section = 'document'): ComplianceIssue[] {
  return missingDisclaimers(documentText, required).map((d) => ({ type: 'disclaimer' as const, severity: 'error' as const, section, message: `必須注記が不足しています：「${d}」` }));
}

export function buildReport(issues: ComplianceIssue[]): ComplianceReport {
  const counts = { masking: 0, banned: 0, grounding: 0, disclaimer: 0, schema: 0, llm_review: 0 } as Record<IssueType, number>;
  for (const i of issues) counts[i.type]++;
  const status = issues.some((i) => i.severity === 'error') ? 'blocked' : issues.length ? 'warning' : 'ok';
  return { status, issues, checkedAt: new Date().toISOString(), counts };
}

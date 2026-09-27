import type { KnowledgeSnapshot } from '@p3/knowledge';
import { EXTRACT_PROMPT, GENERATE_PROMPT, RATIONALE_EXAMPLES, SYSTEM_PROMPT } from '../prompts';

export const PROMPT_VERSION = 'p3-prompts-2026.09.3';

export const SYSTEM_BASE = SYSTEM_PROMPT;
export const EXTRACT_INSTRUCTIONS = EXTRACT_PROMPT;
export const GENERATE_INSTRUCTIONS = GENERATE_PROMPT;
export const FEW_SHOT = RATIONALE_EXAMPLES;

/**
 * Knowledge block placed at the top of the system prompt (stable across requests -> prompt cache).
 * Deliberately excludes internal references (real product names).
 */
export function knowledgeBlock(k: KnowledgeSnapshot): string {
  const cats = k.categories.map((c) => ({ code: c.code, name: c.name, pros: c.pros, cons: c.cons, mandatoryDisclaimers: c.mandatoryDisclaimers, taxRuleRef: c.taxRuleRef }));
  const rules = k.logicRules.filter((r) => r.enabled).map((r) => ({ id: r.id, name: r.name, rationale: r.rationale }));
  const stats = k.statistics.map((s) => ({ text: s.text, source: s.source.title, asOf: s.asOf }));
  const banned = k.bannedPhrases.map((b) => b.phrase);
  return [
    '<KNOWLEDGE>',
    `ナレッジ版: ${k.version}`,
    `保険種別マスタ: ${JSON.stringify(cats)}`,
    `ロジック辞書: ${JSON.stringify(rules)}`,
    `統計値（出典つき）: ${JSON.stringify(stats)}`,
    `禁止表現: ${JSON.stringify(banned)}`,
    `必須注記: ${JSON.stringify(k.disclaimers)}`,
    `根拠文の良い例・悪い例: ${JSON.stringify(FEW_SHOT)}`,
    '</KNOWLEDGE>',
  ].join('\n');
}

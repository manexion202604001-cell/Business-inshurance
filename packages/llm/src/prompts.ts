import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KnowledgeSnapshot } from '@p3/knowledge';

export const PROMPT_VERSION = 'p3-prompts-2026.09.3';

const dir = join(import.meta.dirname, '..', 'prompts');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');

export const SYSTEM_BASE = read('system.md');
export const EXTRACT_INSTRUCTIONS = read('extract.md');
export const GENERATE_INSTRUCTIONS = read('generate.md');
export const FEW_SHOT = JSON.parse(read('examples/rationale-pairs.json')) as { label: string; text: string; why: string }[];

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

import type { ComplianceIssue, TextSection } from '@p3/compliance';
import type { KnowledgeSnapshot } from '@p3/knowledge';
import type { LlmConfig } from './config';
import { structuredCall, type LlmUsage } from './llm';
import { ReviewSchema } from './schemas';

const KIND_LABEL: Record<string, string> = {
  insurer_or_product_name: '保険会社名・商品名らしき語',
  tax_saving_appeal: '実質的な節税訴求',
  assurance: '断定・保証表現',
  comparison: '他社比較',
  other: 'その他の懸念',
};

/**
 * Optional FAST-model double check for issues a dictionary cannot catch (unknown brand names,
 * implicit tax-saving appeals). Findings must quote the text verbatim to be accepted.
 */
export async function llmReview(sections: TextSection[], k: KnowledgeSnapshot, cfg: LlmConfig): Promise<{ issues: ComplianceIssue[]; usage: LlmUsage | null; error: string | null }> {
  if (!cfg.enabled) return { issues: [], usage: null, error: null };
  const customer = sections.filter((s) => s.audience === 'customer');
  const body = customer.map((s) => `[${s.id}] ${s.text}`).join('\n');
  try {
    const { data, usage } = await structuredCall({
      cfg,
      model: cfg.fastModel,
      knowledge: k,
      schema: ReviewSchema,
      temperature: 0,
      maxTokens: 4000,
      user: `次の顧客提示用の文章をコンプライアンスの観点で確認してください。保険会社名・商品名・ファンド名らしき固有名詞、実質的に節税を訴求している表現、断定・保証、他社比較があれば、該当箇所をそのまま引用して findings に入れてください。「通期での節税効果はありません」などの注記は問題ありません。問題がなければ findings は空配列にしてください。\n\n${body}`,
    });
    const issues: ComplianceIssue[] = [];
    for (const f of data.findings) {
      const sec = customer.find((s) => f.quote && s.text.includes(f.quote));
      if (!sec) continue;
      issues.push({ type: 'llm_review', severity: 'warning', section: sec.id, message: `${KIND_LABEL[f.kind] ?? f.kind}の可能性：「${f.quote}」（${f.reason}）`, match: f.quote });
    }
    return { issues, usage, error: null };
  } catch (e) {
    return { issues: [], usage: null, error: e instanceof Error ? e.message : String(e) };
  }
}

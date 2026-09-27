import type { KnowledgeSnapshot } from '@p3/knowledge';
import type { LlmConfig } from './config';
import { buildConflicts, extractWithRules, missingInfo, validateQuotes, type FormSnapshot } from './extract-rules';
import { structuredCall, type LlmUsage } from './llm';
import { EXTRACT_INSTRUCTIONS } from './prompts';
import { ExtractionSchema, type Extraction } from './schemas';

export interface ExtractResult {
  extraction: Extraction;
  usage: LlmUsage | null;
  error: string | null;
}

/** Step 2: LLM extraction (FAST model) with deterministic fallback. */
export async function extract(log: string, form: FormSnapshot, k: KnowledgeSnapshot, cfg: LlmConfig): Promise<ExtractResult> {
  const rules = extractWithRules(log, form);
  if (!cfg.enabled || !log.trim()) return { extraction: rules, usage: null, error: null };
  try {
    const formView = { company: form.company, officer: form.officer, existingPolicies: form.existingPolicies };
    const { data, usage } = await structuredCall({
      cfg,
      model: cfg.fastModel,
      knowledge: k,
      schema: ExtractionSchema,
      temperature: 0,
      maxTokens: 8000,
      user: `${EXTRACT_INSTRUCTIONS}\n\n<FORM>\n${JSON.stringify(formView)}\n</FORM>\n\n<LOG>\n${log}\n</LOG>`,
    });
    let ex: Extraction = { ...data, source: 'llm' };
    ex = validateQuotes(ex, log);
    // Conflicts and missing info are recomputed in code for consistency.
    ex.conflicts = [...buildConflicts(ex.companyFacts, form, Object.fromEntries(ex.conflicts.map((c) => [c.field, c.quote])))];
    ex.missingInfo = [...new Set([...missingInfo(form, ex.companyFacts), ...ex.missingInfo])];
    // Merge signals from rules where the LLM had no opinion.
    for (const key of Object.keys(ex.signals) as (keyof Extraction['signals'])[]) {
      if (ex.signals[key] == null) ex.signals[key] = rules.signals[key];
    }
    return { extraction: ex, usage, error: null };
  } catch (e) {
    return { extraction: rules, usage: null, error: e instanceof Error ? e.message : String(e) };
  }
}

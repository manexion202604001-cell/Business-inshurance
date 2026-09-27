import { NextResponse } from 'next/server';
import { getActiveKnowledge } from '@p3/db';
import { extractWithRules } from '@p3/llm';
import { normalizeLog } from '@p3/pipeline';
import { apiUser, handle } from '@/lib/api';

/** Quick (rule-based) preview used by the form to pre-fill empty fields from a pasted log. */
export const POST = handle(async (req: Request) => {
  await apiUser();
  const body = (await req.json().catch(() => ({}))) as { rawLog?: string; officerAge?: number | null };
  const k = await getActiveKnowledge();
  const norm = normalizeLog(body.rawLog ?? '', k.maskingTerms);
  const ex = extractWithRules(norm.text, { company: {}, officer: body.officerAge ? { age: body.officerAge } : {}, existingPolicies: [] });
  return NextResponse.json({ facts: ex.companyFacts, existingPolicies: ex.existingPolicies, masked: norm.hits.map((h) => h.match) });
});

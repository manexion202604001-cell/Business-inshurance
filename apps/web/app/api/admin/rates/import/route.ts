import { NextResponse } from 'next/server';
import { audit, readDraftKnowledge, writeKnowledgeTables } from '@p3/db';
import { apiUser, handle } from '@/lib/api';
import { parseRatesCsv } from '@/lib/admin';

export const POST = handle(async (req: Request) => {
  const user = await apiUser(['admin']);
  const body = (await req.json().catch(() => ({}))) as { csv?: string; mode?: 'append' | 'replace' | 'replaceSamples' };
  const rows = parseRatesCsv(body.csv ?? '');
  const draft = await readDraftKnowledge();
  const mode = body.mode ?? 'append';
  const kept = mode === 'replace' ? [] : mode === 'replaceSamples' ? draft.referenceRates.filter((r) => !r.isSample) : draft.referenceRates;
  draft.referenceRates = [...kept, ...rows];
  await writeKnowledgeTables(draft);
  await audit(user.email, 'rates_import', { rows: rows.length, mode });
  return NextResponse.json({ imported: rows.length, total: draft.referenceRates.length });
});

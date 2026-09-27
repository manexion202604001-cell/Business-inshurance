import { NextResponse } from 'next/server';
import { audit, readDraftKnowledge, writeKnowledgeTables } from '@p3/db';
import { apiUser, handle, HttpError } from '@/lib/api';
import { applyKind, KINDS, type Kind } from '@/lib/admin';

export const PUT = handle(async (req: Request, { params }: { params: Promise<{ kind: string }> }) => {
  const user = await apiUser(['admin']);
  const kind = (await params).kind as Kind;
  if (!KINDS.includes(kind)) throw new HttpError(404, '不明なナレッジ種別です');
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
  if (!body || !('value' in body)) throw new HttpError(400, 'value を指定してください');
  const next = applyKind(await readDraftKnowledge(), kind, body.value);
  await writeKnowledgeTables(next);
  await audit(user.email, 'knowledge_edit', { kind });
  return NextResponse.json({ ok: true });
});

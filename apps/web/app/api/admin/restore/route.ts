import { NextResponse } from 'next/server';
import { audit, getKnowledgeVersion, writeKnowledgeTables } from '@p3/db';
import { apiUser, handle, HttpError } from '@/lib/api';

/** Load a published version back into the editable draft tables. */
export const POST = handle(async (req: Request) => {
  const user = await apiUser(['admin']);
  const body = (await req.json().catch(() => ({}))) as { versionId?: string };
  const k = body.versionId ? await getKnowledgeVersion(body.versionId) : null;
  if (!k) throw new HttpError(404, '版が見つかりません');
  await writeKnowledgeTables(k);
  await audit(user.email, 'knowledge_restore', { versionId: body.versionId });
  return NextResponse.json({ ok: true });
});

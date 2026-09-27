import { NextResponse } from 'next/server';
import { audit, prisma } from '@p3/db';
import { apiUser, handle, HttpError } from '@/lib/api';
import { getCaseFor } from '@/lib/cases';

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const c = await getCaseFor(user, (await params).id);
  const body = (await req.json().catch(() => ({}))) as { target?: string; rating?: number; comment?: string };
  if (!body.target || (body.rating !== 1 && body.rating !== -1)) throw new HttpError(400, '評価を選択してください');
  await prisma.feedback.create({ data: { caseId: c.id, userId: user.id, target: body.target.slice(0, 40), rating: body.rating, comment: body.comment?.slice(0, 1000) ?? null } });
  await audit(user.email, 'feedback', { target: body.target, rating: body.rating }, c.id);
  return NextResponse.json({ ok: true });
});

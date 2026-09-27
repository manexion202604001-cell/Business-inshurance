import { NextResponse } from 'next/server';
import { audit, prisma } from '@p3/db';
import { apiUser, handle } from '@/lib/api';
import { assertPresentable, getCaseFor, newShareToken, renderInputOf } from '@/lib/cases';

/** Create an expiring, sign-in-required share link (internal use only). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const c = await getCaseFor(user, (await params).id);
  const { knowledge } = await renderInputOf(c);
  assertPresentable(c, knowledge, 'summary');
  const body = (await req.json().catch(() => ({}))) as { days?: number };
  const days = Math.min(30, Math.max(1, Number(body.days ?? 7)));
  const token = newShareToken();
  const expires = new Date(Date.now() + days * 86400000);
  await prisma.case.update({ where: { id: c.id }, data: { shareToken: token, shareExpiresAt: expires } });
  await audit(user.email, 'share', { days }, c.id);
  return NextResponse.json({ url: `/share/${token}`, expiresAt: expires.toISOString() });
});

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const c = await getCaseFor(user, (await params).id);
  await prisma.case.update({ where: { id: c.id }, data: { shareToken: null, shareExpiresAt: null } });
  await audit(user.email, 'unshare', {}, c.id);
  return NextResponse.json({ ok: true });
});

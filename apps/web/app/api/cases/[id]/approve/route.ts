import { NextResponse } from 'next/server';
import { audit, prisma } from '@p3/db';
import { apiUser, handle, HttpError } from '@/lib/api';
import { getCaseFor } from '@/lib/cases';

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser(['manager', 'admin']);
  const c = await getCaseFor(user, (await params).id);
  if (c.status === 'blocked') throw new HttpError(409, 'ブロック中の案件は承認できません');
  if (!['generated', 'approved', 'presented'].includes(c.status)) throw new HttpError(409, '3案の作成後に承認できます');
  await prisma.case.update({ where: { id: c.id }, data: { status: 'approved', approvedAt: new Date(), approvedById: user.id } });
  await audit(user.email, 'approve', {}, c.id);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser(['manager', 'admin']);
  const c = await getCaseFor(user, (await params).id);
  await prisma.case.update({ where: { id: c.id }, data: { status: 'generated', approvedAt: null, approvedById: null } });
  await audit(user.email, 'unapprove', {}, c.id);
  return NextResponse.json({ ok: true });
});

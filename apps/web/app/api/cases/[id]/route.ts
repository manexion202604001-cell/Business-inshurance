import { NextResponse } from 'next/server';
import { audit, prisma } from '@p3/db';
import { apiUser, handle, HttpError } from '@/lib/api';
import { getCaseFor, toView } from '@/lib/cases';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const c = await getCaseFor(user, (await params).id);
  return NextResponse.json(await toView(c));
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const c = await getCaseFor(user, (await params).id);
  const body = (await req.json().catch(() => ({}))) as { recommendedTier?: string | null; status?: string };
  const data: { recommendedTier?: string | null; status?: string } = {};
  if ('recommendedTier' in body) {
    if (body.recommendedTier != null && !['MIN', 'BALANCED', 'MAX'].includes(body.recommendedTier)) throw new HttpError(400, '不正なプランです');
    data.recommendedTier = body.recommendedTier ?? null;
  }
  if (body.status === 'presented') {
    if (!['generated', 'approved'].includes(c.status)) throw new HttpError(409, 'この状態からは提示済みにできません');
    data.status = 'presented';
  }
  await prisma.case.update({ where: { id: c.id }, data });
  await audit(user.email, 'update_case', data, c.id);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await apiUser();
  const c = await getCaseFor(user, (await params).id);
  await audit(user.email, 'delete_case', { company: c.company.name }, null);
  await prisma.case.delete({ where: { id: c.id } });
  const remaining = await prisma.case.count({ where: { companyId: c.companyId } });
  if (remaining === 0) await prisma.company.delete({ where: { id: c.companyId } });
  return NextResponse.json({ ok: true });
});

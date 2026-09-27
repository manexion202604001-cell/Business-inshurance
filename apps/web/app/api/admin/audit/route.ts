import { NextResponse } from 'next/server';
import { prisma } from '@p3/db';
import { apiUser, handle } from '@/lib/api';

export const GET = handle(async (req: Request) => {
  await apiUser(['manager', 'admin']);
  const limit = Math.min(500, Number(new URL(req.url).searchParams.get('limit') ?? 200));
  const events = await prisma.auditEvent.findMany({ orderBy: { at: 'desc' }, take: limit });
  return NextResponse.json({ events });
});

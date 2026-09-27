import { NextResponse } from 'next/server';
import { prisma, readDraftKnowledge } from '@p3/db';
import { apiUser, handle } from '@/lib/api';

export const GET = handle(async () => {
  await apiUser(['admin']);
  const draft = await readDraftKnowledge();
  const versions = await prisma.knowledgeVersion.findMany({ orderBy: { publishedAt: 'desc' }, select: { id: true, label: true, publishedAt: true, publishedBy: true } });
  return NextResponse.json({ draft, versions });
});

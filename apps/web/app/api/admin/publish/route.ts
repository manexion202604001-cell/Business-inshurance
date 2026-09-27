import { NextResponse } from 'next/server';
import { audit, publishKnowledge } from '@p3/db';
import { apiUser, handle } from '@/lib/api';

export const POST = handle(async (req: Request) => {
  const user = await apiUser(['admin']);
  const body = (await req.json().catch(() => ({}))) as { label?: string };
  const { id } = await publishKnowledge(body.label?.trim() || 'ナレッジ更新', user.email);
  await audit(user.email, 'knowledge_publish', { id, label: body.label });
  return NextResponse.json({ id });
});

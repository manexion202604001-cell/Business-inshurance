import { NextResponse } from 'next/server';
import { apiUser, handle } from '@/lib/api';
import { recalcCase, type Overrides } from '@/lib/cases';

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await apiUser();
  const body = (await req.json().catch(() => ({}))) as Overrides;
  const t = Date.now();
  const r = await recalcCase(user, (await params).id, body);
  return NextResponse.json({ ok: true, status: r.compliance.status, ms: Date.now() - t });
});

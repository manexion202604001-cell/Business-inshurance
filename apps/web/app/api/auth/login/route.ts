import { NextResponse } from 'next/server';
import { audit, prisma, verifyPassword } from '@p3/db';
import { handle, HttpError } from '@/lib/api';
import { setSessionCookie } from '@/lib/session';

export const POST = handle(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = body.email ? await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } }) : null;
  if (!user || !verifyPassword(body.password ?? '', user.passwordHash)) throw new HttpError(401, 'メールアドレスまたはパスワードが違います');
  await setSessionCookie(user.id);
  await audit(user.email, 'login');
  return NextResponse.json({ ok: true, role: user.role });
});

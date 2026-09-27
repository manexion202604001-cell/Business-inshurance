import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@p3/db';

export const SESSION_COOKIE = 'p3_session';
const MAX_AGE = 60 * 60 * 12; // 12h

export type Role = 'sales' | 'manager' | 'admin';
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

function secret(): string {
  return process.env.SESSION_SECRET || 'dev-only-insecure-secret';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + MAX_AGE })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { uid: string; exp: number };
    if (data.exp < Date.now() / 1000) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export async function setSessionCookie(userId: string) {
  (await cookies()).set(SESSION_COOKIE, createToken(userId), { httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE, secure: process.env.NODE_ENV === 'production' && process.env.P3_INSECURE_COOKIE !== '1' });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const uid = verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const u = await prisma.user.findUnique({ where: { id: uid } });
  return u ? { id: u.id, email: u.email, name: u.name, role: u.role as Role } : null;
});

/** For pages: redirect to /login when not signed in (or lacking role). */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (roles && !roles.includes(u.role)) redirect('/cases');
  return u;
}

export const isManager = (u: SessionUser) => u.role === 'manager' || u.role === 'admin';

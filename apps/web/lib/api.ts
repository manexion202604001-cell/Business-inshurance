import 'server-only';
import { NextResponse } from 'next/server';
import { currentUser, type Role, type SessionUser } from './session';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export async function apiUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'ログインが必要です');
  if (roles && !roles.includes(u.role)) throw new HttpError(403, '権限がありません');
  return u;
}

/** Wrap a route handler: converts HttpError / unexpected errors into JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, detail: e.detail ?? null }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'サーバーエラーが発生しました', detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  };
}

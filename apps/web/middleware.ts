import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/api/auth/login', '/api/health', '/fonts', '/_next', '/favicon'];

/** Cheap gate: redirect to /login when the session cookie is missing. Signature is verified server-side. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (req.cookies.get('p3_session')) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image).*)'] };

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Staff portal only: tells server components which page was asked for, so a
 * signed-out visitor can be sent back to it after signing in.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-portal-path', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/admin/:path*'] };

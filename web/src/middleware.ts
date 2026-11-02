import { NextResponse, type NextRequest } from 'next/server';

/**
 * Staff portal pages only: tells server components which page was asked for,
 * so a signed-out visitor can be sent back to it after signing in. Not the
 * portal's API (/admin/api): for any route it runs on, Next copies the request
 * body for middleware and keeps only the first 10 MB, which would cut large
 * image uploads short.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-portal-path', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/admin', '/admin/((?!api/).*)'] };

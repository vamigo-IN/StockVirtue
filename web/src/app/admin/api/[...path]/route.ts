import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { API_V1, backendHeaders, clientFromHeaders } from '@/portal/backend';
import {
  isSessionEnd,
  sessionCookieOptions,
  STAFF_COOKIE,
} from '@/portal/session';

/**
 * The portal's only door to the newsroom API (backend-for-frontend). The
 * browser calls /admin/api/staff/...; this handler
 *  - accepts only same-origin calls carrying the portal's own header, so other
 *    sites can't drive it (on top of the SameSite=Strict session cookie);
 *  - swaps the httpOnly session cookie for the API's x-staff-session header
 *    and keeps the raw token out of every response body;
 *  - forwards nothing but /api/v1/staff/... and never the browser's headers.
 * Permissions are enforced by the API itself on every call.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;
/** The largest portal request is site settings with three 50 KB code blocks. */
const MAX_BODY_BYTES = 256 * 1024;

function fail(status: number, message: string) {
  return NextResponse.json(
    { statusCode: status, message },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

/** Hosts a portal page may legitimately be served from. */
function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  for (const h of [
    req.headers.get('host'),
    req.headers.get('x-forwarded-host'),
  ]) {
    if (h) hosts.add(h.split(',')[0].trim());
  }
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? '');
    hosts.add(site.host);
    hosts.add(
      site.host.startsWith('www.') ? site.host.slice(4) : `www.${site.host}`,
    );
  } catch {
    // No configured site URL: the request's own host is the only one allowed.
  }
  return hosts;
}

function fromPortal(req: NextRequest): boolean {
  if (req.headers.get('x-sv-portal') !== '1') return false;
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;
  if (req.method === 'GET') return true;
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return allowedHosts(req).has(new URL(origin).host);
  } catch {
    return false;
  }
}

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (path[0] !== 'staff' || !path.every((s) => SEGMENT.test(s))) {
    return fail(404, 'Not found.');
  }
  if (!fromPortal(req)) {
    return fail(403, 'This request did not come from the newsroom portal.');
  }
  // Without the server key the API can't tell staff apart by IP, so every
  // sign-in would share one rate limit. Refuse loudly instead.
  if (!process.env.SITE_ADMIN_KEY) {
    return fail(
      503,
      "The newsroom portal isn't set up on this server yet (SITE_ADMIN_KEY is missing).",
    );
  }
  const route = path.join('/');
  const token = req.cookies.get(STAFF_COOKIE)?.value;
  const hasBody = req.method !== 'GET' && req.method !== 'DELETE';
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail(413, 'That request is too large.');
  }
  const body = hasBody ? await req.text() : undefined;
  if (body && body.length > MAX_BODY_BYTES) {
    return fail(413, 'That request is too large.');
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_V1}/${route}${req.nextUrl.search}`, {
      method: req.method,
      headers: backendHeaders(token, clientFromHeaders(req.headers), hasBody),
      body: body || undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return fail(
      502,
      "The newsroom service isn't reachable right now. Try again in a minute.",
    );
  }

  const text = await upstream.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return fail(502, 'The newsroom service sent an unreadable reply.');
  }

  // Signing in: keep the token in the httpOnly cookie, never in the page.
  if (route === 'staff/auth/verify' && upstream.ok) {
    const { token: newToken, ...rest } = data as {
      token: string;
      expiresAt: string;
    };
    const res = NextResponse.json(rest, {
      headers: { 'cache-control': 'no-store' },
    });
    res.cookies.set(
      STAFF_COOKIE,
      newToken,
      sessionCookieOptions(new Date(rest.expiresAt)),
    );
    return res;
  }

  const res = NextResponse.json(data, {
    status: upstream.status,
    headers: { 'cache-control': 'no-store' },
  });
  const code = (data as { message?: { code?: unknown } } | null)?.message?.code;
  if (route === 'staff/auth/logout' || isSessionEnd(code)) {
    res.cookies.set(STAFF_COOKIE, '', {
      ...sessionCookieOptions(new Date(0)),
      maxAge: 0,
    });
  }
  // Saved website settings show on the public site straight away.
  if (route === 'staff/site/settings' && req.method === 'PUT' && upstream.ok) {
    revalidatePath('/', 'layout');
  }
  return res;
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};

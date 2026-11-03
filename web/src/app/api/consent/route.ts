import { NextResponse, type NextRequest } from 'next/server';
import { API_V1, backendHeaders, clientFromHeaders } from '@/portal/backend';

/**
 * The consent log: each cookie choice a visitor makes, with the random id
 * kept in their consent cookie (DPDP Act s.6(10): we must be able to show
 * what was agreed and when). Passed to the API with the site key; the
 * visitor's address goes along for rate limiting only and is not stored.
 */
export const dynamic = 'force-dynamic';

const ID = /^[a-z0-9]{8,40}$/;
const SOURCES = new Set(['web.banner', 'web.settings']);

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { id, version, analytics, advertising, source } = body;
  if (
    typeof id !== 'string' ||
    !ID.test(id) ||
    typeof version !== 'number' ||
    typeof analytics !== 'boolean' ||
    typeof advertising !== 'boolean' ||
    typeof source !== 'string' ||
    !SOURCES.has(source)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const res = await fetch(`${API_V1}/privacy/consents`, {
      method: 'POST',
      headers: backendHeaders(undefined, clientFromHeaders(req.headers), true),
      body: JSON.stringify({ id, version, analytics, advertising, source }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

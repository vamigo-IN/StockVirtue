import { NextResponse, type NextRequest } from 'next/server';
import { API_V1, backendHeaders, clientFromHeaders } from '@/portal/backend';

/**
 * A story was read (sent by the article page). Passed on to the API with the
 * reader's address and browser, which it uses only to count each reader once
 * a day; nothing identifying is stored.
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') {
    return new NextResponse(null, { status: 403 });
  }
  let id: unknown;
  try {
    id = ((await req.json()) as { id?: unknown }).id;
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof id !== 'string' || !UUID.test(id)) {
    return new NextResponse(null, { status: 400 });
  }
  try {
    const res = await fetch(`${API_V1}/news/${id}/view`, {
      method: 'POST',
      headers: backendHeaders(undefined, clientFromHeaders(req.headers), false),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    return new NextResponse(null, { status: res.status === 429 ? 429 : 204 });
  } catch {
    // Counting is best effort; the reader never notices.
    return new NextResponse(null, { status: 204 });
  }
}

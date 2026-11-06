import { NextResponse, type NextRequest } from 'next/server';
import { API_V1 } from '@/portal/backend';

/**
 * Market data for the website's widgets and ticker, from this server. One
 * fetch per address is shared by every reader for a few seconds (Next's data
 * cache), so the API — and behind it the broker — sees a handful of requests
 * however many people are reading. Only the public market endpoints pass;
 * the site key gets the website's data licence.
 */
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

/** Seconds a response is reused, per endpoint. */
const TTL: Record<string, number> = {
  snapshot: 5,
  ticker: 5,
  // Curated values come from the stream, so a quote set can wait 30 s
  // (spec §7.12): at most 2 broker calls a minute per set.
  quotes: 30,
  movers: 15,
  sectors: 15,
  heatmap: 15,
  chart: 60,
  ipos: 300,
  widgets: 60,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (status: number) =>
  NextResponse.json(
    {
      statusCode: status,
      message:
        status === 404 ? 'Not found.' : 'Market data is unavailable right now.',
    },
    { status, headers: { 'cache-control': 'no-store' } },
  );

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const [head, ...rest] = path;
  const ok =
    head === 'widgets'
      ? rest.length === 1 && UUID.test(rest[0])
      : head in TTL && rest.length === 0;
  if (!ok || req.nextUrl.search.length > 700) return fail(404);
  const ttl = TTL[head];
  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_V1}/market/${path.join('/')}${req.nextUrl.search}`,
      {
        headers: {
          accept: 'application/json',
          'x-site-admin-key': process.env.SITE_ADMIN_KEY ?? '',
        },
        next: { revalidate: ttl, tags: ['market'] },
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch {
    return fail(502);
  }
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': upstream.ok
        ? `public, max-age=${Math.min(ttl, 15)}, stale-while-revalidate=${ttl}`
        : 'no-store',
    },
  });
}

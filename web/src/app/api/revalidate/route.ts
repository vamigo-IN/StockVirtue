import { createHmac, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * The API calls this after anything public changes in the newsroom (a
 * publish, an unpublish, an edit to a live story, the homepage layout…), so
 * news pages refresh within seconds. Signed with SITE_ADMIN_KEY: HMAC-SHA256
 * of `${timestamp}.${body}`, and only recent timestamps are accepted.
 */
export const dynamic = 'force-dynamic';

const MAX_SKEW_MS = 5 * 60_000;
/** Tags this hook may refresh; anything else in the body is ignored. */
const ALLOWED_TAGS = new Set(['news']);

function reply(status: number, message: string) {
  return NextResponse.json(
    { statusCode: status, message },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function POST(req: NextRequest) {
  const key = process.env.SITE_ADMIN_KEY;
  if (!key) return reply(503, 'SITE_ADMIN_KEY is not set on this server.');
  const body = await req.text();
  if (body.length > 8_192) return reply(413, 'Too large.');

  const timestamp = req.headers.get('x-sv-timestamp') ?? '';
  const signature = req.headers.get('x-sv-signature') ?? '';
  if (
    !/^\d{10,16}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > MAX_SKEW_MS
  ) {
    return reply(401, 'Stale or missing timestamp.');
  }
  const expected = createHmac('sha256', key)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  if (!safeEqual(signature, expected)) return reply(401, 'Bad signature.');

  let tags: unknown;
  try {
    tags = (JSON.parse(body) as { tags?: unknown }).tags;
  } catch {
    return reply(400, 'Body must be JSON.');
  }
  const refreshed = Array.isArray(tags)
    ? [
        ...new Set(
          tags.filter((t): t is string => ALLOWED_TAGS.has(t as string)),
        ),
      ]
    : [];
  for (const tag of refreshed) revalidateTag(tag);
  return NextResponse.json(
    { revalidated: refreshed, at: Date.now() },
    { headers: { 'cache-control': 'no-store' } },
  );
}

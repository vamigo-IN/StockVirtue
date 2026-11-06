import { createHmac, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * The API calls this after anything public changes in the newsroom (a
 * publish, an unpublish, an edit to a live story, the homepage layout…) and
 * in the admin-managed site (W7 addendum §7.5: a page, menu or legal
 * publish, a custom page change, a new cookie choice version), so the pages
 * refresh within seconds. Signed with SITE_ADMIN_KEY: HMAC-SHA256 of
 * `${timestamp}.${body}`, and only recent timestamps are accepted.
 */
export const dynamic = 'force-dynamic';

const MAX_SKEW_MS = 5 * 60_000;

/**
 * Tags this hook may refresh (W7 addendum §7.5, Appendix B); anything else
 * in the body is ignored:
 * - `news`, `market`: the newsroom and market data (unchanged);
 * - `site-chrome`: menus, footer, 404 texts and the footer notice line;
 * - `site-pages`: the content index (the sitemap, custom pages' params);
 * - `site-settings`: the settings every page's layout reads, sent by a
 *   material privacy publish that affects cookies, so every page's consent
 *   banner gets the new cookie choice version (§5.13);
 * - `content:<key>` for the twelve designed, shared and legal keys;
 * - `custom:<slug>` for a custom page (at most 70 characters).
 */
const EXACT_TAGS = new Set(['news', 'market', 'site-chrome', 'site-pages', 'site-settings']);
const CONTENT_TAG =
  /^content:(home|features|about|faq|download|contact|wont-do|privacy|privacy-hi|terms|disclaimer|privacy-requests)$/;
const CUSTOM_TAG = /^custom:[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether this hook may refresh `tag`. */
function isAllowedTag(tag: unknown): tag is string {
  if (typeof tag !== 'string') return false;
  return EXACT_TAGS.has(tag) || CONTENT_TAG.test(tag) || (tag.length <= 70 && CUSTOM_TAG.test(tag));
}

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
  const refreshed = Array.isArray(tags) ? [...new Set(tags.filter(isAllowedTag))] : [];
  for (const tag of refreshed) revalidateTag(tag);
  return NextResponse.json(
    { revalidated: refreshed, at: Date.now() },
    { headers: { 'cache-control': 'no-store' } },
  );
}

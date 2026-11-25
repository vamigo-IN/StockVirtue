import { NextRequest } from 'next/server';
import { getSettings } from '@/lib/settings';

/**
 * Serves the IndexNow key verification file. When a request comes in for
 * `/{key}.txt`, this checks whether the key matches the one stored in Site
 * settings → Search → IndexNow API key. If it matches, the response is a
 * plain-text file containing just the key (the IndexNow protocol's ownership
 * proof). Any other slug falls through to Next.js's normal page routing.
 *
 * @see https://www.indexnow.org/documentation
 */

/** Only handle requests that look like a 32-char hex IndexNow key file. */
const KEY_PATTERN = /^[a-f0-9]{32}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ indexNowKey: string }> },
) {
  const { indexNowKey } = await params;

  // Strip the .txt extension if present (the route catches the bare slug).
  const slug = indexNowKey.replace(/\.txt$/, '');

  if (!KEY_PATTERN.test(slug)) {
    return new Response('Not Found', { status: 404 });
  }

  const { search } = (await getSettings()).config;

  if (!search.indexNowEnabled || slug !== search.indexNowApiKey) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(slug, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
}


import { NextRequest } from 'next/server';
import { getSettings } from '@/lib/settings';

/**
 * IndexNow key verification file. IndexNow requires a text file at
 * `/{apiKey}.txt` containing just the key. A rewrite in `next.config.mjs`
 * maps `/:key.txt` to this route when the key looks like a 32-char hex
 * string.
 *
 * @see https://www.indexnow.org/documentation
 */

const KEY_PATTERN = /^[a-f0-9]{32}$/;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') ?? '';

  if (!KEY_PATTERN.test(key)) {
    return new Response('Not Found', { status: 404 });
  }

  const { search } = (await getSettings()).config;

  if (!search.indexNowEnabled || key !== search.indexNowApiKey) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(key, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  });
}


import { getSettings } from '@/lib/settings';

/**
 * IndexNow key verification file. IndexNow requires a text file at
 * `/{apiKey}.txt` containing just the key. A rewrite in `next.config.mjs`
 * maps `/:key([a-f0-9]{32}).txt` to `/api/indexnow-key/:key`.
 *
 * @see https://www.indexnow.org/documentation
 */
export const dynamic = 'force-dynamic';

const KEY_PATTERN = /^[a-f0-9]{32}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: raw } = await params;
  const key = raw.replace(/\.txt$/, '');

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
      'cache-control': 'public, max-age=300',
    },
  });
}

import { getSettings } from '@/lib/settings';

/**
 * ads.txt (IAB): which ad networks may sell space on this site. The AdSense
 * line comes from the publisher id under Site settings → Advertising, plus any
 * lines added there for other networks.
 */
export const dynamic = 'force-static';
export const revalidate = 300;

/// Google's certification authority id, the same for every AdSense account.
const GOOGLE_CERT = 'f08c47fec0942fa0';

export async function GET() {
  const { ads } = (await getSettings()).config;
  const lines: string[] = [];
  if (/^ca-pub-\d{10,20}$/.test(ads.adsenseClient)) {
    const pub = ads.adsenseClient.replace(/^ca-/, '');
    lines.push(`google.com, ${pub}, DIRECT, ${GOOGLE_CERT}`);
  }
  if (ads.adsTxt.trim()) lines.push(ads.adsTxt.trim());
  if (lines.length === 0) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

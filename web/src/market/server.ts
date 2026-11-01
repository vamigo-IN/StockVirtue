import 'server-only';
import { API_V1 } from '@/portal/backend';
import type { TickerData } from './types';

/**
 * The site ticker's settings and prices, for server-rendered pages. Shared by
 * every reader for 15 seconds and refreshed when market settings change (tag
 * "market"); null when the API can't be reached, and the ticker then hides.
 */
export async function getTicker(): Promise<TickerData | null> {
  try {
    const res = await fetch(`${API_V1}/market/ticker`, {
      headers: {
        accept: 'application/json',
        'x-site-admin-key': process.env.SITE_ADMIN_KEY ?? '',
      },
      next: { revalidate: 15, tags: ['market'] },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as TickerData;
  } catch {
    return null;
  }
}

'use client';

import { useEffect } from 'react';

/**
 * Counts one read of a story (for "Trending"). Sent to this site, which adds
 * the reader's address for the API's once-a-day de-duplication; no cookie or
 * identifier is stored in the browser.
 */
export function ViewBeacon({ id }: { id: string }) {
  useEffect(() => {
    if (document.visibilityState === 'hidden') return;
    void fetch('/api/news/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
      keepalive: true,
    }).catch(() => {});
  }, [id]);
  return null;
}

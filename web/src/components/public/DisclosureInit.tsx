'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';
import { openWideDisclosures } from '@/lib/disclosure';

/**
 * Repeats DISCLOSURE_SCRIPT after client navigations (spec §2.5, §4.11):
 * the inline script runs once, on the first HTML load, so the
 * PhoneDisclosures of a page reached by a client navigation mount closed.
 * This layout effect opens them at >= 768 px before that page paints.
 * Render it ONCE, in the (public) layout, next to the script, and import
 * this module from nowhere else (openWideDisclosures is in
 * src/lib/disclosure.ts; see the note there). It renders nothing. It
 * never closes a disclosure: a reader's own choice stays, and a window
 * that shrinks below 768 px keeps what is open.
 */
export function DisclosureInit() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    openWideDisclosures(document);
  }, [pathname]);
  return null;
}

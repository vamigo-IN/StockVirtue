'use client';

import { fmtStamp } from './format';
import { useToday } from './use-today';

/**
 * A stamp's time (spec §4.10, §7.0 rule 2). The server and the first client
 * render print the full, clock-free form "4 Nov, 3:05 pm IST", so cached
 * HTML and hydration always agree; after hydration it becomes "3:05 pm IST"
 * when `iso` falls on the reader's IST today. Text only: the caller supplies
 * the sr-only "Prices as of" and any wrapper.
 */
export function StampTime({ iso }: { iso: string | null | undefined }) {
  return <>{fmtStamp(iso, useToday())}</>;
}

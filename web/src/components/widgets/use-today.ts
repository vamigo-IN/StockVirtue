'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * The reader's "now", for the short "3:05 pm IST" form of a stamp:
 * `fmtStamp(asOf, useToday())`. Null while the server renders and while the
 * page hydrates, so the first render prints the full, clock-free form
 * ("3 Nov, 3:05 pm IST") on both sides; the reader's clock afterwards
 * (constraints map §8.4). Call it only in client components; server code
 * calls `fmtStamp(asOf)` with no second argument.
 */
export function useToday(): Date | null {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? new Date() : null;
}

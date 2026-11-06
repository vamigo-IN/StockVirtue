'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False on the server and while the page hydrates; true afterwards (and on
 * the first render of anything mounted after hydration, such as a client
 * navigation). Use it to switch text that depends on the browser (the
 * clock, the viewport, storage) only once hydration is over, so the server
 * HTML and the first client render always agree (constraints map §8.5).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

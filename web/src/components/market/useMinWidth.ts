'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the viewport is at least `px` wide, for markup (not styling) that
 * must differ by width: the IPO board and the home movers stack their tab
 * panels from 768 px, where the panels must lose their tab semantics (A-5).
 * False on the server and during hydration, so the first render always
 * matches the server HTML; it follows the media query after that.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Props that strip a Radix tab panel's tab semantics (role, its label and
 * the focus stop) where the panels are shown stacked and the tab list is
 * hidden by CSS: there, a screen reader would announce "tab panel" with no
 * tabs, and each panel would be an extra Tab stop. Radix spreads these after
 * its own defaults, so `undefined` removes them.
 */
export const STACKED_PANEL = {
  role: undefined,
  tabIndex: undefined,
  'aria-labelledby': undefined,
} as const;

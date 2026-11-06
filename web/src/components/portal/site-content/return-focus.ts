'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Focus goes back to whatever opened a dialog when it closes (Escape, Cancel
 * or done). Radix returns focus only to its own Dialog.Trigger; our dialogs
 * are controlled and opened from buttons elsewhere, so without this the
 * focus falls to <body> and a keyboard user starts again from the top.
 *
 * Remembers the focused element when `open` turns true (a layout effect, so
 * before Radix moves focus into the dialog) and returns the handler for the
 * content's `onCloseAutoFocus`. If that element has gone (a menu item, a
 * removed row), `fallback` gets focus instead, else Radix's default applies.
 */
export function useReturnFocus(open: boolean, fallback?: () => HTMLElement | null | undefined): (e: Event) => void {
  const opener = useRef<HTMLElement | null>(null);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useLayoutEffect(() => {
    if (!open) return;
    const el = document.activeElement;
    opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
  }, [open]);

  return useCallback((e: Event) => {
    const el = opener.current?.isConnected ? opener.current : (fallbackRef.current?.() ?? null);
    opener.current = null;
    if (!el || !el.isConnected) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
  }, []);
}

/**
 * The same promise for a dialog whose content we can't reach (the portal's
 * MediaPicker): when `open` turns false, and for up to a second while its
 * closing animation runs, focus that has fallen to <body> goes back to the
 * opener (remembered when `open` turned true). Focus anywhere else is left
 * alone, so a click elsewhere wins.
 */
export function useRefocusOnClose(open: boolean): void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open) {
      wasOpen.current = true;
      const el = document.activeElement;
      opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const el = opener.current;
    opener.current = null;
    if (!el) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const active = document.activeElement;
      const fallen = !active || active === document.body;
      const inDialog = active instanceof HTMLElement && !!active.closest('[role="dialog"]');
      if (fallen && el.isConnected) el.focus({ preventScroll: true });
      else if (!inDialog || Date.now() - started > 1000) window.clearInterval(id);
      if (Date.now() - started > 1000) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [open]);
}

'use client';

import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { isPaletteOn, PALETTE_EVENT, setPalette } from '@/lib/palette';

/**
 * "Blue and orange for up and down" (spec §3.1.3, §4.5 item 4, §4.14): the
 * colour-blind palette switch, a `<button>` with `aria-pressed`. Client.
 *
 * setPalette() stores the choice in `localStorage['sv:palette']` (inside
 * try/catch), sets or clears `data-palette` on #sv-public and fires the
 * window event `sv:palette`, so canvas charts re-read their colours. The
 * pre-paint script applies a stored choice before the first paint.
 *
 * Hydration-safe: the server render and the first client render are always
 * "off" (aria-pressed="false"); the real state is read from #sv-public in
 * an effect, and kept in step whenever the palette changes elsewhere (the
 * ticker's popover has the same switch). Its name never changes, so the
 * pressed state is what a screen reader announces.
 *
 * The look follows the surface: on paper the track fills ink when on; in
 * the dark footer it fills `--sv-on-stage` (`.sv-switch`, public.css).
 *
 * Classes are joined with clsx, not tailwind-merge: this switch is in the
 * footer of every public page, and tailwind-merge (about 8 KB gzip) would
 * ride along in their initial JS (spec §6.10).
 */
export function PaletteToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(isPaletteOn());
    sync();
    window.addEventListener(PALETTE_EVENT, sync);
    return () => window.removeEventListener(PALETTE_EVENT, sync);
  }, []);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setPalette(!on)}
      className={clsx('sv-switch', className)}
    >
      <span className="sv-switch-track" aria-hidden="true">
        <span className="sv-switch-knob" />
      </span>
      <span className="sv-switch-label">Blue and orange for up and down</span>
    </button>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Whether an element is in (or near) the viewport, through one
 * IntersectionObserver per element. Returns a callback ref to put on the
 * element, and the flag.
 *
 * - The flag is false on the server and during hydration, so nothing that
 *   depends on it changes the first render.
 * - `rootMargin` widens the viewport (market modules use "200px": they load
 *   within 200 px of the screen, spec §4.10); `threshold` is the visible
 *   fraction that counts (the diagrams use 0.6).
 * - `once`: stays true after the first time, and stops observing.
 * - Without IntersectionObserver the element counts as in view, so content
 *   that waits for the view still loads.
 */
export function useInView<T extends Element>(
  o: { rootMargin?: string; threshold?: number; once?: boolean } = {},
): [ref: (el: T | null) => void, inView: boolean] {
  const { rootMargin = '0px', threshold = 0, once = false } = o;
  const [el, setEl] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  const ref = useCallback((node: T | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        const visible =
          threshold > 0 ? e.intersectionRatio >= threshold : e.isIntersecting;
        if (once) {
          if (visible) {
            setInView(true);
            io.disconnect();
          }
          return;
        }
        setInView(visible);
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, rootMargin, threshold, once]);

  return [ref, inView];
}

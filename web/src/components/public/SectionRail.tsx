'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { isCurrentSection, railItems, type RailCategory } from '@/lib/nav';

export type { RailCategory } from '@/lib/nav';

/** How far the active item keeps clear of an edge (the 24 px fade). */
const EDGE = 24;

/**
 * The news section rail (spec §4.2): `<nav aria-label="News sections">`
 * inside the news header, under the brand bar. It MUST stay inside
 * `<header>`: official-e2e finds its "Official updates" link there. Client.
 *
 * Items: Front page (/news), Latest, then the categories in CMS order
 * (railItems, src/lib/nav.ts). The active item (exact match for /news,
 * whole-segment prefix match for the rest) is `--sv-fg` with a 2 px
 * `--sv-selected` underline and `aria-current="page"`.
 *
 * Overflow: the list scrolls sideways (`scroll-snap-type: x proximity`).
 * A 24 px edge fade shows only on a side that hides content: a scroll
 * listener and a ResizeObserver set `data-fade-start` / `data-fade-end` on
 * the list directly (no re-render). After mount, after each client
 * navigation and once the web font is in, the rail sets its own
 * `scrollLeft` so the active item is fully visible: never
 * `scrollIntoView`, which can scroll the page.
 *
 * Folding (CSS, public.css): on story pages at >= 1024 px it folds to 0 as
 * the header compacts; below 1024 px it folds whenever the header comes
 * back more than 200 px down the page (`data-compact`). Folded links are
 * `visibility: hidden`, so they leave the tab order.
 */
export function SectionRail({
  categories = [],
}: {
  categories?: readonly RailCategory[];
}) {
  const pathname = usePathname() ?? '';
  const listRef = useRef<HTMLUListElement>(null);
  const items = railItems(categories);

  // Edge fades: only on a side that hides content.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const max = el.scrollWidth - el.clientWidth;
      const x = Math.abs(el.scrollLeft);
      el.toggleAttribute('data-fade-start', x > 1);
      el.toggleAttribute('data-fade-end', max - x > 1);
    };
    const queue = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };
    sync();
    el.addEventListener('scroll', queue, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(queue);
      ro.observe(el);
      // Items change width when the web font arrives; the list box doesn't.
      el.querySelectorAll('li').forEach((li) => ro?.observe(li));
    }
    return () => {
      el.removeEventListener('scroll', queue);
      ro?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items.length]);

  // Keep the active item fully in view, by moving the rail itself. Again
  // once the fonts are in: Archivo swaps in (display: swap) and changes the
  // items' widths.
  useEffect(() => {
    let live = true;
    const reveal = () => {
      const el = listRef.current;
      const a = el?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!live || !el || !a || el.scrollWidth <= el.clientWidth) return;
      const box = el.getBoundingClientRect();
      const r = a.getBoundingClientRect();
      const left = r.left - box.left + el.scrollLeft;
      const right = left + r.width;
      if (left - EDGE < el.scrollLeft) {
        el.scrollLeft = Math.max(0, left - EDGE);
      } else if (right + EDGE > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = right + EDGE - el.clientWidth;
      }
    };
    reveal();
    document.fonts?.ready.then(reveal, () => undefined);
    return () => {
      live = false;
    };
  }, [pathname]);

  return (
    <nav aria-label="News sections" className="sv-rail">
      <div className="sv-container">
        <ul ref={listRef} className="sv-rail-list">
          {items.map((it) => (
            <li key={it.href}>
              <Link
                href={it.href}
                className="sv-rail-link"
                aria-current={isCurrentSection(pathname, it.href) ? 'page' : undefined}
              >
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

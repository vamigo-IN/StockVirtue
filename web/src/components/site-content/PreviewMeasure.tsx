'use client';

import { useEffect } from 'react';

/**
 * The measuring end of the editor's layout meters (W7 addendum §3.1, §8.9;
 * M7.4b). Rendered by /preview/<token> next to a designed page's view; it
 * draws nothing. Once the page has loaded and its fonts are ready, it
 * measures the page as the meters need it and posts the result to the
 * portal frame (`window.parent`, `targetOrigin = location.origin`, so only a
 * same-origin parent ever receives it):
 *
 *   { type: 'sv-preview-measure', key, docHeight, foldShare?, fold, viewport }
 *
 * - `docHeight`: `document.documentElement.scrollHeight` with every
 *   `details[data-pd]` closed (the spec §8.3 rule: phone disclosures closed).
 *   Open ones are closed for the reading and reopened at once, in the same
 *   task, so nothing is painted closed. The phone length the meter shows
 *   against the page's budget is this number from a 390 px wide frame.
 * - `fold`: W1's home fold check, `measureHomeFold()` from
 *   $R/checks/W1/fold.mjs, copied unchanged below (typed): the hero
 *   figure's plate (`#sv-hero-figure [data-plate]`) at scroll 0, its share
 *   above the viewport's bottom edge, plus the H1's line count and the
 *   header's height. null when the page has no figure (every page but a
 *   priced Home: the type-led hero has none). `foldShare` is `fold.share`,
 *   left out when there is no figure. The meter's "above the fold" number
 *   is this share from a 1366 × 657 frame.
 * - `viewport`: the frame's inner size, so the portal can tell which of
 *   its frames the numbers come from.
 *
 * It measures again (and posts only when something changed) after a
 * resize, e.g. when the portal changes the frame's width, and when the
 * body's size changes later (a module filling in after load). It never
 * renders text and touches the document only in effects (plan §0 rule 9).
 */

/** W1's fold check result (the fields of fold.mjs's measureHomeFold). */
export type FoldMeasure = {
  share: number;
  top: number;
  height: number;
  visible: number;
  viewport: number;
  h1Lines: number | null;
  headerHeight: number | null;
};

/** The message posted to the portal frame. */
export type PreviewMeasureMessage = {
  type: 'sv-preview-measure';
  /** The previewed item's key ('home', 'features' …). */
  key: string;
  docHeight: number;
  foldShare?: number;
  fold: FoldMeasure | null;
  viewport: { width: number; height: number };
};

/** Wait after fonts are ready before the first reading (W1's check waits 400 ms, W2's 700 ms after load). */
const SETTLE_MS = 500;
/** Debounce for resizes and late layout changes. */
const AGAIN_MS = 300;

/**
 * W1's measureHomeFold() ($R/checks/W1/fold.mjs), unchanged but for types:
 * plain DOM, run at scroll 0, the share of the figure's plate above the
 * viewport's bottom edge. The addendum's §10.3 compares the two.
 */
function measureHomeFold(win: Window = window): FoldMeasure | null {
  const doc = win.document;
  const fig = doc.getElementById('sv-hero-figure');
  if (!fig) return null;
  const plate = fig.querySelector('[data-plate]') || fig;
  const r = plate.getBoundingClientRect();
  const top = r.top + win.scrollY;
  const height = r.height;
  const viewport = win.innerHeight;
  const visible = Math.max(0, Math.min(height, viewport - top));
  const h1 = doc.querySelector('main h1');
  let h1Lines: number | null = null;
  if (h1) {
    const lh = parseFloat(win.getComputedStyle(h1).lineHeight);
    h1Lines = lh ? Math.round(h1.getBoundingClientRect().height / lh) : null;
  }
  const header = doc.querySelector('header');
  return {
    share: height ? visible / height : 0,
    top: Math.round(top),
    height: Math.round(height),
    visible: Math.round(visible),
    viewport,
    h1Lines,
    headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
  };
}

/** The document's height with every phone disclosure closed (spec §8.3). */
function phoneLength(doc: Document): number {
  const open = Array.from(doc.querySelectorAll<HTMLDetailsElement>('details[data-pd][open]'));
  for (const d of open) d.open = false;
  const height = doc.documentElement.scrollHeight;
  for (const d of open) d.open = true;
  return height;
}

export function PreviewMeasure({ itemKey }: { itemKey: string }) {
  useEffect(() => {
    // The editors' phone-length meter loads its frame with ?pointer=coarse: on a
    // phone the footer's links and Cookie settings get 44 px rows from
    // `@media (pointer: coarse)`, which a frame inside the desktop portal never
    // matches. public.css applies the same rows under this attribute, so the
    // meter reads what a phone shows (24 px more at today's footer; W6 F2).
    if (new URLSearchParams(window.location.search).get('pointer') === 'coarse') {
      document.documentElement.setAttribute('data-sv-pointer', 'coarse');
    }
    let stopped = false;
    let armed = false;
    let timer: number | undefined;
    let last = '';

    const post = () => {
      if (stopped) return;
      const fold = measureHomeFold(window);
      const message: PreviewMeasureMessage = {
        type: 'sv-preview-measure',
        key: itemKey,
        docHeight: phoneLength(document),
        ...(fold ? { foldShare: fold.share } : {}),
        fold,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
      const sig = JSON.stringify(message);
      if (sig === last) return;
      last = sig;
      try {
        window.parent.postMessage(message, window.location.origin);
      } catch {
        // A frame that can't be reached: nothing to tell.
      }
    };
    const later = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(post, ms);
    };
    const again = () => {
      if (armed) later(AGAIN_MS);
    };

    const loaded =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((resolve) => window.addEventListener('load', () => resolve(), { once: true }));
    void loaded
      .then(() => document.fonts?.ready)
      .catch(() => undefined)
      .then(() => {
        if (stopped) return;
        armed = true;
        later(SETTLE_MS);
      });

    window.addEventListener('resize', again);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(again) : null;
    ro?.observe(document.body);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('resize', again);
      ro?.disconnect();
    };
  }, [itemKey]);
  return null;
}

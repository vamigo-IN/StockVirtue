'use client';

import { useEffect, type RefObject } from 'react';

/** How far down the page the header may start hiding, in px. */
const HIDE_BELOW = 200;
/**
 * Above this the full header comes back (the news rail unfolds), in px.
 * The gap to HIDE_BELOW is wider than the rail (44 px), so the page moving
 * by the rail's own fold can never carry the reader back across the line.
 */
const FULL_ABOVE = 140;
/** Scroll movement that counts as a change of direction, in px. */
const DELTA = 4;
/**
 * After the rail folds or unfolds: its height transition (--sv-dur-2,
 * 200 ms) plus a margin. Scroll anchoring moves the page by the rail's
 * height meanwhile; those movements are not the reader's.
 */
const SETTLE_MS = 320;
/**
 * The most the fold itself can move the page: the rail's 44 px plus DELTA.
 * A larger net movement over the settle window was the reader's own.
 */
const FOLD_SLACK = 48;
/** Headroom runs below 1024 px only; from 1024 the header compacts in CSS. */
const NARROW = '(max-width: 1023.98px)';

/**
 * Headroom for the sticky site header (spec §4.1), below 1024 px:
 * - `data-hidden="true"` once the reader is more than 200 px down and has
 *   scrolled down by more than 4 px; `"false"` on any upward scroll of more
 *   than 4 px, near the top of the page, and whenever focus moves into the
 *   header (the skip link lives there);
 * - `data-compact="true"` once the header hides more than 200 px down, so
 *   the header that comes back is the brand bar alone (the news rail folds
 *   away); `"false"` again near the top (within 140 px), where the rail
 *   shows.
 * CSS does the rest: `[data-hidden="true"]` slides the header up (no
 * transition under reduced motion), and `#sv-public:has(...)` moves
 * `--sv-sticky-top`.
 *
 * The rail's fold changes the header's height in the page flow, so the
 * browser's scroll anchoring moves the page by up to 44 px while it runs.
 * Those movements are ignored for SETTLE_MS, and the 140/200 px pair keeps
 * the fold from re-crossing the line it was triggered at. Without both, a
 * reader stopped near 200 px on a news page saw the header flip every frame.
 * When the window ends, a net movement since the fold began that is larger
 * than the fold can make (a jump with End or a link, made while the rail
 * was still moving) is decided then, from where the fold began; otherwise
 * the jump would be lost and the full header would stay over the page.
 *
 * The listener is passive and runs at most once per frame. `enabled: false`
 * (the drawer is open) shows the header and stops it hiding. From 1024 px
 * both attributes stay "false". Without JS the header simply stays sticky.
 */
export function useHeadroom(
  ref: RefObject<HTMLElement | null>,
  o: { enabled: boolean },
): void {
  const { enabled } = o;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mq = window.matchMedia(NARROW);
    let lastY = Math.max(0, window.scrollY);
    let frame = 0;
    let settleUntil = 0;
    let settleFrom = 0;
    let settleTimer = 0;

    const compactNow = () => el.getAttribute('data-compact') === 'true';

    const set = (hidden: boolean, compact: boolean) => {
      const h = hidden ? 'true' : 'false';
      const c = compact ? 'true' : 'false';
      if (el.getAttribute('data-hidden') !== h) el.setAttribute('data-hidden', h);
      if (el.getAttribute('data-compact') !== c) {
        el.setAttribute('data-compact', c);
        // Only a header with a rail changes height when it compacts.
        if (el.querySelector('.sv-rail')) {
          settleUntil = performance.now() + SETTLE_MS;
          settleFrom = Math.max(0, window.scrollY);
          window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(settleEnd, SETTLE_MS + 20);
        }
      }
    };

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      if (!mq.matches) {
        set(false, false);
        lastY = y;
        return;
      }
      if (performance.now() < settleUntil) {
        // The rail is folding or unfolding: follow the page, decide nothing.
        lastY = y;
        return;
      }
      if (y <= FULL_ABOVE) {
        set(false, false);
        lastY = y;
        return;
      }
      if (!enabled) {
        set(false, compactNow() || y > HIDE_BELOW);
        lastY = y;
        return;
      }
      const dy = y - lastY;
      if (dy > DELTA) {
        lastY = y;
        // Between 140 and 200 px the header neither hides nor compacts.
        if (y > HIDE_BELOW && !el.contains(document.activeElement)) set(true, true);
      } else if (dy < -DELTA) {
        lastY = y;
        set(false, compactNow() || y > HIDE_BELOW);
      }
    };

    // The settle window has ended: a movement larger than the fold can make
    // was the reader's, so decide it now, measured from where the fold began.
    function settleEnd() {
      settleTimer = 0;
      const y = Math.max(0, window.scrollY);
      if (Math.abs(y - settleFrom) > FOLD_SLACK) {
        lastY = settleFrom;
        update();
      } else {
        lastY = y;
      }
    }

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const onFocusIn = () => {
      if (el.getAttribute('data-hidden') === 'true') {
        set(false, mq.matches && (compactNow() || window.scrollY > HIDE_BELOW));
      }
    };
    const onMedia = () => update();

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('focusin', onFocusIn);
    mq.addEventListener('change', onMedia);
    return () => {
      window.removeEventListener('scroll', onScroll);
      el.removeEventListener('focusin', onFocusIn);
      mq.removeEventListener('change', onMedia);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
    };
  }, [ref, enabled]);
}

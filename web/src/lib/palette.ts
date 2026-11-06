/**
 * The reader's colour-blind palette choice (spec §3.1.3): blue and orange
 * for up and down, stored per browser. PaletteToggle (M0.4) writes it with
 * setPalette(); the pre-paint script below applies it before the first
 * paint. No 'use client' and no 'server-only': the (public) layout imports
 * the script constants on the server, and the toggle calls setPalette() in
 * the browser.
 */
export const PALETTE_KEY = 'sv:palette';

/** The window event setPalette() fires, so charts re-read their colours. */
export const PALETTE_EVENT = 'sv:palette';

/** Also importable from here, as plan Appendix A lists it (it lives in ./disclosure.ts). */
export { DISCLOSURE_SCRIPT } from './disclosure';

/**
 * Runs inline as the first child of #sv-public (src/app/(public)/layout.tsx),
 * before any public content paints (spec §2.5). It sets:
 * - data-palette="bo" when the reader chose blue and orange;
 * - data-motion="ok" when the reader has no reduced-motion preference and
 *   the browser has IntersectionObserver (motion that waits for the view
 *   keys off it; without it, everything shows its final frame).
 * It then keeps data-motion in step when the OS reduced-motion setting
 * changes after load (spec §6.9): the listener looks #sv-public up again on
 * every change, so it never holds a stale element.
 * Every access is wrapped in try/catch: storage can throw (private windows,
 * blocked site data), and a failure here must never stop the page.
 * #sv-public carries suppressHydrationWarning for these two attributes.
 */
export const PRE_PAINT_SCRIPT = `(function(){try{var d=document,w=window,e=d.getElementById('sv-public');if(!e)return;try{if(w.localStorage.getItem('${PALETTE_KEY}')==='bo')e.setAttribute('data-palette','bo')}catch(_){}var q=w.matchMedia('(prefers-reduced-motion: no-preference)'),io='IntersectionObserver' in w,s=function(){var x=d.getElementById('sv-public');if(!x)return;if(io&&q.matches)x.setAttribute('data-motion','ok');else x.removeAttribute('data-motion')};s();if(q.addEventListener)q.addEventListener('change',s);else if(q.addListener)q.addListener(s)}catch(_){}})();`;

/**
 * Switches the blue/orange palette on or off: stores the choice (inside
 * try/catch, since storage can throw), sets or clears data-palette on
 * #sv-public, and fires the window event `sv:palette` ({ detail: { on } }),
 * so canvas charts re-read their colours from the tokens. Browser only:
 * call it from an event handler or an effect, never during render.
 */
export function setPalette(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(PALETTE_KEY, 'bo');
    else window.localStorage.removeItem(PALETTE_KEY);
  } catch {
    // storage blocked: the choice lasts for this page only
  }
  const el = document.getElementById('sv-public');
  if (el) {
    if (on) el.setAttribute('data-palette', 'bo');
    else el.removeAttribute('data-palette');
  }
  try {
    window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: { on } }));
  } catch {
    // very old browsers without CustomEvent: the attribute still switched
  }
}

/**
 * Whether the blue/orange palette is on right now (reads #sv-public).
 * Browser only: call it in an effect, never during render, so the server
 * HTML and the first client render agree.
 */
export function isPaletteOn(): boolean {
  return document.getElementById('sv-public')?.getAttribute('data-palette') === 'bo';
}

import type { ReactNode } from 'react';
import { clsx } from 'clsx';

// Not DisclosureInit: only the (public) layout imports that client module
// (see openWideDisclosures in src/lib/disclosure.ts).
export { openWideDisclosures } from '@/lib/disclosure';

/**
 * The one primitive for "closed on phones, open from 768 px" (spec §4.11,
 * §8.1 item 5). A real <details class="sv-pd" data-pd> that is CLOSED in
 * the server HTML. DISCLOSURE_SCRIPT (src/lib/disclosure.ts, inline in the
 * (public) layout) opens every one at >= 768 px before the first paint, and
 * DisclosureInit does the same after client navigations, so the state is a
 * real `open` attribute everywhere: screen readers hear the true state, and
 * desktop readers can still close it. `suppressHydrationWarning` covers the
 * attribute the script adds. Without JS, both variants are working, closed
 * disclosures at every width.
 *
 * - `variant="head"`: `summary` is the section's heading element (an
 *   <h2>/<h3>; a <summary> may hold one heading). From 768 px it keeps
 *   showing as a heading, with no marker. The footer columns, "How to read
 *   a price", the Learn glossary groups.
 * - `variant="tail"`: `summary` is a "Show …" line ("Show 4 more about
 *   orders and charges"). From 768 px the open disclosure's summary is
 *   hidden, so the content reads as normal page content. The /features
 *   chapter tails and fact file, the /news movers and sectors wrappers.
 *
 * Server component (no client JS of its own); it also works inside client
 * components. One mounted AFTER hydration should call openWideDisclosures()
 * on its root from a layout effect.
 */
export function PhoneDisclosure({
  variant,
  summary,
  children,
  id,
  className,
}: {
  variant: 'head' | 'tail';
  summary: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <details
      id={id}
      className={clsx('sv-pd', className)}
      data-pd={variant}
      suppressHydrationWarning
    >
      <summary>
        {variant === 'tail' ? <span className="t-body">{summary}</span> : summary}
        <svg
          className="sv-pd-chev"
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="sv-pd-body">{children}</div>
    </details>
  );
}

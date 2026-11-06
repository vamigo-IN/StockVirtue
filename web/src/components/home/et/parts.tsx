import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import e from './et.module.css';

/**
 * The section head of the Emerald Terminal home page: a mono label with a
 * rule, the H2 and an optional line, with an aside (a tag or a link) on the
 * right. Server component.
 */
export function SectionHead({
  id,
  label,
  title,
  lead,
  aside,
  dark = false,
}: {
  /** The H2's id: the section's accessible name. */
  id: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  /** On the terminal or emerald ground (the label turns neon). */
  dark?: boolean;
}) {
  return (
    <div className={clsx(e.head, dark && e.dark)}>
      <div className={e.headText}>
        <p className={e.kicker}>{label}</p>
        <h2 id={id} className={e.h2}>
          {title}
        </h2>
        {lead ? <div className={e.headLead}>{lead}</div> : null}
      </div>
      {aside ? <div className={e.headAside}>{aside}</div> : null}
    </div>
  );
}

/** The dashed mono tag every illustrative block carries ("Sample screen", "Example order"). */
export function SampleTag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx(e.tag, className)}>{children}</span>;
}

/** A right arrow for "All markets", "Read the news" and the like. */
export function ArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** The shield beside the small print and on the "₹0" card. */
export function Shield({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** up / down / flat class for a signed number. */
export function tone(n: number | null | undefined): string {
  if (!n) return e.flat;
  return n > 0 ? e.up : e.down;
}

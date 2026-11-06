import { LazyPopover } from '@/components/public/ui/LazyPopover';
import { LabelPill } from '@/components/widgets/frame';
import { fmtStamp } from '@/components/widgets/format';
import type { StreamPath } from '@/components/widgets/PulseDot';
import { StampTime } from '@/components/widgets/StampTime';
import { clsx } from 'clsx';
import type { DataLabel } from '@/market/types';
import { COPY } from './copy';

export interface StampProps {
  label: DataLabel | null | undefined;
  /** ISO time the values are as of. */
  asOf: string | null | undefined;
  /** The payload's attribution, never hard-coded (F21). */
  attribution: string | null | undefined;
  /** Minutes for "Delayed 15m": pass `delayFor(right, delayMinutes)` only. */
  delay?: number;
  /** An ⓘ after the stamp that loads "About these prices" on first use. */
  withInfo?: boolean;
  /**
   * The home hero's stamp (spec §4.10, F13): the pill and the visible time
   * sit in one inline `<span data-hero-stamp>` reading exactly
   * "Live · 4 Nov, 3:05 pm IST".
   */
  heroStamp?: boolean;
  /** The streamed list these prices follow: the Live dot pulses on moves. */
  stream?: StreamPath;
  /** The last refresh failed: say that these are the values from `asOf`. */
  stale?: boolean;
  className?: string;
}

/**
 * Every market module ends with one (spec §4.10, §7.0 rule 3, §9.7):
 * "[Live] · 4 Nov, 3:05 pm IST · NSE, BSE, MCX and NSE currency data", in
 * SV Mono 12 px (Emerald Terminal: small labels are mono)
 * and `--sv-fg-3`. An sr-only "Prices as of"
 * precedes the time. The time is StampTime's: the full form on the server
 * and on the first client render, "3:05 pm IST" after hydration when it is
 * today. The attribution wraps, never truncates.
 *
 * Server-safe (no 'use client'): server pages and client modules both
 * render it. Its client parts are the pill's PulseDot, StampTime and the
 * ⓘ's LazyPopover, whose Radix module loads only when a reader uses it.
 *
 * `heroStamp`: everything inside `[data-hero-stamp]` is an inline box (the
 * pill is inline-block, the dot is empty) with no sr-only text and no
 * attribution, so its innerText is exactly the visible "{pill} · {time}"
 * with no line break (widgets-e2e's anchored regex).
 *
 * Renders nothing without a label and a time: a module that can't produce
 * them doesn't show its numbers either (spec §4.10).
 */
export function Stamp({
  label,
  asOf,
  attribution,
  delay,
  withInfo = false,
  heroStamp = false,
  stream,
  stale = false,
  className,
}: StampProps) {
  if (!label || !asOf) return null;
  const pill = <LabelPill label={label} delay={delay} stream={stream} />;
  const time = <StampTime iso={asOf} />;
  return (
    <span className={clsx('sv-stamp t-mono text-[12px] leading-[18px] text-fg-3', className)}>
      {heroStamp ? (
        <>
          <span className="sr-only">{COPY.pricesAsOf}</span>
          <span data-hero-stamp="">
            {pill}
            {' · '}
            {time}
          </span>
        </>
      ) : (
        <>
          {pill}
          {' · '}
          <span className="whitespace-nowrap">
            <span className="sr-only">{COPY.pricesAsOf}</span>
            {time}
          </span>
        </>
      )}
      {attribution ? (
        <>
          {' · '}
          <span className="sv-stamp-attr">{attribution}</span>
        </>
      ) : null}
      {withInfo ? (
        <>
          {' '}
          <StampInfo label={label} asOf={asOf} attribution={attribution} />
        </>
      ) : null}
      {stale ? (
        <span className="sv-stamp-stale">
          {COPY.staleLead}
          {time}.
        </span>
      ) : null}
    </span>
  );
}

/** The ⓘ: "About these prices", loaded on first use (spec §4.10, §9.7). */
function StampInfo({
  asOf,
  attribution,
}: {
  label: DataLabel;
  asOf: string;
  attribution: string | null | undefined;
}) {
  return (
    <LazyPopover
      label="About these prices"
      triggerClassName="sv-stamp-info"
      className="max-w-[320px] p-4"
      trigger={<InfoGlyph />}
    >
      <p className="t-small text-fg">
        {attribution ? `Market data: ${attribution}. ` : ''}
        {/* The clock-free full form: the same on the server and in the browser. */}
        Prices as of {fmtStamp(asOf)}.
      </p>
      <p className="t-small mt-3">
        <a href="/#prices" className="sv-quiet sv-quiet-hit">
          How to read our prices
        </a>
      </p>
    </LazyPopover>
  );
}

/** Lucide's "info" (circle with an i), inline so this file stays server-safe. */
export function InfoGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

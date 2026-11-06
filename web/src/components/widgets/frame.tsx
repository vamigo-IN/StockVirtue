import { clsx } from 'clsx';
import type { DataLabel, InstrumentKind } from '@/market/types';
import { direction, fmtChange, fmtPct, fmtPrice } from './format';
import { PulseDot, type StreamPath } from './PulseDot';
import { StampTime } from './StampTime';

/**
 * The frame every widget sits in, plus the small pieces every market module
 * shares: the label pill, the data stamp and the change.
 *
 * Server-safe (spec §3.10): no 'use client' and no client library, so server
 * components (OurPrices, HouseAd, the market modules' server parts) can
 * render LabelPill, DataStamp and Change without shipping hooks. The only
 * client parts are PulseDot (the one-shot live-dot pulse) and StampTime (the
 * time's short form after hydration).
 *
 * Colours are theme names that both stylesheets define (spec §3.10):
 * public.css maps them to the --sv-* tokens, portal.css maps the same names
 * for the editor and its dark mode. Text and rules use the area-level names
 * (foreground, muted-foreground, border, card, muted), never a raw colour.
 */

export type WidgetVariant = 'article' | 'rail' | 'hub';

const ROOT: Record<WidgetVariant, string> = {
  // The article card: <section>, my-8 and the Emerald Terminal's 16 px card
  // corners (explicit; sv-wcard takes the card shadow on the public site).
  article:
    'sv-wcard not-prose my-8 overflow-hidden rounded-[16px] border border-border bg-card text-card-foreground',
  // A rail module: no outer margin, square, separated by the rail's own rules.
  rail: 'not-prose text-card-foreground',
  // A hub card: no outer margin, radius 12.
  hub: 'sv-wcard not-prose overflow-hidden rounded-[16px] border border-border bg-card text-card-foreground',
};
const HEAD: Record<WidgetVariant, string> = {
  article:
    'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5',
  rail: 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-3',
  hub: 'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5',
};
const BODY: Record<WidgetVariant, string> = {
  article: 'px-4 py-4 sm:px-5',
  rail: '',
  hub: 'px-4 py-4 sm:px-5',
};
const FOOT: Record<WidgetVariant, string> = {
  article:
    'border-t border-border bg-muted/40 px-4 py-2.5 text-[13px] leading-[18px] text-muted-foreground sm:px-5',
  rail: 'pt-3 text-[13px] leading-[18px] text-muted-foreground',
  hub: 'border-t border-border px-4 py-2.5 text-[13px] leading-[18px] text-muted-foreground sm:px-5',
};

/**
 * A widget's card. `article` (the default) keeps today's <section>, header
 * and footer; `rail` and `hub` render <div>s with no outer margin (spec
 * §3.10), so the page's own last <footer> stays the site footer.
 */
export function WidgetCard({
  title,
  icon: Icon,
  aside,
  children,
  footer,
  className,
  variant = 'article',
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  aside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  variant?: WidgetVariant;
}) {
  const article = variant === 'article';
  const Root = article ? 'section' : 'div';
  const Head = article ? 'header' : 'div';
  const Foot = article ? 'footer' : 'div';
  return (
    <Root className={clsx(ROOT[variant], className)}>
      {(title || aside) && (
        <Head className={HEAD[variant]}>
          {title && (
            <h3
              className={clsx(
                'flex min-w-0 items-center gap-2 font-semibold',
                variant === 'rail'
                  ? 'text-[15px] leading-5'
                  : 'text-sm leading-5',
              )}
            >
              {Icon && (
                <Icon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{title}</span>
            </h3>
          )}
          {aside}
        </Head>
      )}
      <div className={BODY[variant]}>{children}</div>
      {footer && <Foot className={FOOT[variant]}>{footer}</Foot>}
    </Root>
  );
}

const LABEL_STYLE: Record<DataLabel, string> = {
  LIVE: 'bg-live-bg text-live-fg',
  DELAYED: 'bg-delayed-bg text-delayed-fg',
  EOD: 'bg-eod-bg text-eod-fg',
};
const LABEL_TEXT: Record<DataLabel, string> = {
  LIVE: 'Live',
  DELAYED: 'Delayed',
  EOD: 'End of day',
};

/**
 * "Live", "Delayed" (+ " 15m" only when the caller passes `delay`, which
 * callers do only when the licence is DELAYED: `delayFor()`), or "End of
 * day". 20 px tall, 12/16 at weight 650, sentence case, the pill colours
 * from the tokens (spec §4.10).
 *
 * An inline box all the way down (no flex), so a stamp's innerText reads
 * "Live · 4 Nov, 3:05 pm IST" with no line breaks (the heroStamp contract).
 *
 * Live adds a 6 px dot. With `stream` it is a PulseDot that pulses once each
 * time the price stream moves a value in that list (never on its first
 * picture); without it, a still dot.
 */
export function LabelPill({
  label,
  delay,
  stream,
  className,
}: {
  label: DataLabel;
  delay?: number;
  /** The streamed list this pill describes: its dot pulses when it moves. */
  stream?: StreamPath;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-block rounded-[4px] px-1.5 py-0.5 align-middle text-[12px] leading-4 font-[650] whitespace-nowrap',
        LABEL_STYLE[label],
        className,
      )}
      title={
        label === 'LIVE'
          ? 'Live market data'
          : label === 'DELAYED'
            ? `Prices delayed${delay ? ` by ${delay} minutes` : ''}`
            : // One vocabulary (spec §7.9 f): "End of day", never "Closing prices".
              'End-of-day prices'
      }
    >
      {label === 'LIVE' &&
        (stream ? (
          <PulseDot path={stream} />
        ) : (
          <span className="sv-live-dot" aria-hidden="true" />
        ))}
      {LABEL_TEXT[label]}
      {label === 'DELAYED' && delay ? ` ${delay}m` : ''}
    </span>
  );
}

/**
 * "[Live] 4 Nov, 3:05 pm IST · NSE, BSE, MCX and NSE currency data": on
 * every value shown. The time is the full form on the server and on the
 * first client render, and "3:05 pm IST" after hydration when it is today
 * (StampTime). The attribution wraps rather than truncates.
 *
 * `stale`: the last refresh failed and these are the values from `asOf`
 * (spec §4.10 shared states): a second line says so.
 */
export function DataStamp({
  label,
  asOf,
  attribution,
  delay,
  stream,
  stale,
  className,
}: {
  label: DataLabel | null | undefined;
  asOf: string | null | undefined;
  attribution?: string;
  delay?: number;
  stream?: StreamPath;
  stale?: boolean;
  className?: string;
}) {
  return (
    <>
      <p className={clsx('text-[13px] leading-[18px]', className)}>
        {label && (
          <>
            <LabelPill label={label} delay={delay} stream={stream} />{' '}
          </>
        )}
        {asOf && (
          <span className="whitespace-nowrap">
            <span className="sr-only">Prices as of </span>
            <StampTime iso={asOf} />
          </span>
        )}
        {attribution && (
          <>
            {asOf || label ? ' · ' : ''}
            <span>{attribution}</span>
          </>
        )}
      </p>
      {stale && asOf && (
        <p className="mt-1 text-[13px] leading-[18px]">
          Couldn’t refresh. Showing prices from <StampTime iso={asOf} />.
        </p>
      )}
    </>
  );
}

/** 8 × 8 direction marks: a triangle up or down, or a 6 px bar for flat. */
function DirectionMark({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden="true"
      focusable="false"
      className="mr-1 inline-block shrink-0 align-baseline"
    >
      {dir === 'up' ? (
        <path d="M4 .8 7.6 7.2H.4z" fill="currentColor" />
      ) : dir === 'down' ? (
        <path d="M4 7.2 .4.8h7.2z" fill="currentColor" />
      ) : (
        <rect x="1" y="3" width="6" height="2" rx=".5" fill="currentColor" />
      )}
    </svg>
  );
}

const TONE = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-muted-foreground',
};

/**
 * A move: the triangle, the signed change, then "(±x.xx%)" (just the
 * percentage when `showAbs` is off or there is no absolute change). Colour
 * up or down from the tokens; `neutral` (volatility indices such as India
 * VIX, `isVolatilityIndex`) keeps the surrounding text colour. Screen
 * readers hear "up 0.42 per cent". With no values at all (End of day while
 * the market is open): an en dash and "no change yet".
 */
export function Change({
  change,
  pct,
  kind,
  className,
  showAbs = true,
  neutral = false,
}: {
  change: number | null;
  pct: number | null;
  kind?: InstrumentKind;
  className?: string;
  showAbs?: boolean;
  neutral?: boolean;
}) {
  if (change === null && pct === null) {
    return (
      <span className={clsx('text-muted-foreground', className)}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">no change yet</span>
      </span>
    );
  }
  const dir = direction(pct ?? change);
  const abs = showAbs && change !== null;
  const visible = [
    abs ? fmtChange(change, kind) : null,
    pct !== null ? (abs ? `(${fmtPct(pct)})` : fmtPct(pct)) : null,
  ]
    .filter(Boolean)
    .join(' ');
  // "up 0.42 per cent"; with the absolute move, "up 12.30, 0.42 per cent".
  const spoken =
    dir === 'flat'
      ? 'unchanged'
      : [
          abs ? `${dir} ${fmtPrice(Math.abs(change ?? 0), kind)}` : null,
          pct !== null
            ? `${abs ? '' : `${dir} `}${Math.abs(pct).toFixed(2)} per cent`
            : null,
        ]
          .filter(Boolean)
          .join(', ');
  return (
    <span
      data-dir={dir}
      className={clsx(
        'whitespace-nowrap tabular-nums',
        !neutral && TONE[dir],
        className,
      )}
    >
      <DirectionMark dir={dir} />
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/** Skeleton rows at the final height while data loads (still: nothing loops). */
export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="space-y-2"
      aria-busy="true"
      aria-label="Loading market data"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-4 rounded-[4px] bg-muted"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

/** Lucide's lock and circle-alert, drawn inline so this file stays server-only. */
function MessageIcon({ kind }: { kind: 'rights' | 'error' | 'empty' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="mt-0.5 size-4 shrink-0"
    >
      {kind === 'rights' ? (
        <>
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </>
      )}
    </svg>
  );
}

/** Why there is nothing to show: licence, upstream trouble, or simply empty. */
export function WidgetMessage({
  kind,
  children,
}: {
  kind: 'rights' | 'error' | 'empty';
  children?: React.ReactNode;
}) {
  const text =
    children ??
    (kind === 'rights'
      ? 'Not available under our current market-data licence.'
      : kind === 'error'
        ? 'Market data isn’t available right now. It will reappear shortly.'
        : 'Nothing to show yet.');
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <MessageIcon kind={kind} />
      {text}
    </p>
  );
}

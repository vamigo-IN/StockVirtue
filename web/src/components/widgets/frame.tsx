import { CircleAlert, Clock, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DataLabel, InstrumentKind } from '@/market/types';
import { direction, fmtChange, fmtPct, fmtStamp } from './format';

/** The frame every widget sits in. */
export function WidgetCard({
  title,
  icon: Icon,
  aside,
  children,
  footer,
  className,
}: {
  title?: string;
  icon?: React.ComponentType<{ className?: string }>;
  aside?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'not-prose my-8 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          {title && (
            <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              {Icon && (
                <Icon className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">{title}</span>
            </h3>
          )}
          {aside}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
      {footer && (
        <footer className="border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground sm:px-5">
          {footer}
        </footer>
      )}
    </section>
  );
}

const LABEL_STYLE: Record<DataLabel, string> = {
  LIVE: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  DELAYED: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  EOD: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
};
const LABEL_TEXT: Record<DataLabel, string> = {
  LIVE: 'Live',
  DELAYED: 'Delayed',
  EOD: 'End of day',
};

export function LabelPill({
  label,
  delay,
}: {
  label: DataLabel;
  delay?: number;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase',
        LABEL_STYLE[label],
      )}
      title={
        label === 'LIVE'
          ? 'Live market data'
          : label === 'DELAYED'
            ? `Prices delayed${delay ? ` by ${delay} minutes` : ''}`
            : 'Closing prices'
      }
    >
      {label === 'LIVE' && (
        <span
          className="sv-live-dot size-1.5 rounded-full bg-emerald-500"
          aria-hidden="true"
        />
      )}
      {LABEL_TEXT[label]}
      {label === 'DELAYED' && delay ? ` ${delay}m` : ''}
    </span>
  );
}

/** "LIVE · 3:05 pm IST · NSE, BSE … via Angel One" — on every value shown. */
export function DataStamp({
  label,
  asOf,
  attribution,
  delay,
}: {
  label: DataLabel | null | undefined;
  asOf: string | null | undefined;
  attribution?: string;
  delay?: number;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {label && <LabelPill label={label} delay={delay} />}
      {asOf && (
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" aria-hidden="true" />
          <span>
            <span className="sr-only">Prices as of </span>
            {fmtStamp(asOf)}
          </span>
        </span>
      )}
      {attribution && <span className="truncate">· {attribution}</span>}
    </p>
  );
}

const DIR_STYLE = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-muted-foreground',
};

export function Change({
  change,
  pct,
  kind,
  className,
  showAbs = true,
}: {
  change: number | null;
  pct: number | null;
  kind?: InstrumentKind;
  className?: string;
  showAbs?: boolean;
}) {
  const dir = direction(pct ?? change);
  if (change === null && pct === null) {
    return <span className={cn('text-muted-foreground', className)}>—</span>;
  }
  return (
    <span className={cn('tabular-nums', DIR_STYLE[dir], className)}>
      <span aria-hidden="true">
        {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'}{' '}
      </span>
      {showAbs && change !== null && <>{fmtChange(change, kind)} </>}
      {pct !== null && <>({fmtPct(pct)})</>}
    </span>
  );
}

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
          className="h-4 animate-pulse rounded bg-muted"
          style={{ width: `${90 - i * 12}%` }}
        />
      ))}
    </div>
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
  const Icon = kind === 'rights' ? Lock : CircleAlert;
  const text =
    children ??
    (kind === 'rights'
      ? 'Not available under our current market-data licence.'
      : kind === 'error'
        ? 'Market data isn’t available right now. It will reappear shortly.'
        : 'Nothing to show yet.');
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

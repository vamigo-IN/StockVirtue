'use client';

import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PreviewMeasureMessage } from '@/components/site-content/PreviewMeasure';
import type { DesignedKey } from '@/content/site/types';
import { cn } from '@/lib/utils';
import { withQuery, type PreviewTarget } from './PreviewPane';

/**
 * The layout meters under a designed page's preview (W7 addendum §3.1, §8.3,
 * §8.9): the page's length on a phone against its budget, and on Home the
 * share of the hero figure above the fold. They warn and never block.
 *
 * The preview route measures its own render (PreviewMeasure, M7.4b) and
 * posts { type: 'sv-preview-measure', docHeight, fold, viewport, … } to its
 * parent. The visible frame is whatever width the editor picked, so the
 * meters keep two small frames of their own, out of sight: one of exactly
 * 390 × 844 for the phone length (W6's measure, spec §8.3, with the phone
 * disclosures closed) and, on Home, one of exactly 1366 × 657 for the fold
 * (W1's check, spec §5.1.1). They load the same preview whenever it holds a
 * newer version, at most once every 6 s (each load is one preview GET, and
 * the API allows 60 a minute per person, §7.2), and take messages only from
 * this origin and from their own frames. Being off screen, the frames never
 * start the home page's WebGL scene.
 */

/**
 * Each designed page's length budget on a 390 × 844 phone: the plan's §4.2
 * phone-length table (spec §8.3 as amended on 5 Nov 2026). Home and Features
 * were re-set for the Emerald Terminal look the owner chose on 6 Nov 2026
 * (home measured 14,036 and features 7,121 at 390, about 4% headroom kept);
 * the other four keep their spec §8.3 targets.
 */
export const PHONE_BUDGETS: Readonly<Record<DesignedKey, number>> = {
  home: 14600,
  features: 7400,
  about: 2950,
  faq: 2530,
  download: 2530,
  contact: 2110,
};
export const PHONE_VIEWPORT = { width: 390, height: 844 } as const;
/** The tightest of the three gated viewports of spec §5.1.1. */
export const FOLD_VIEWPORT = { width: 1366, height: 657 } as const;
/** At least this share of the hero figure sits above the fold (spec §5.1.1). */
export const FOLD_MIN_SHARE = 0.6;

const MEASURE_GAP_MS = 6_000;
/** A frame that has loaded but sent nothing for this long couldn't be measured. */
const QUIET_MS = 15_000;

export interface PhoneReading {
  docHeight: number;
  rev: number;
  query: string;
}
export interface FoldReading {
  /** null: no hero figure (the type-led hero, without prices). */
  share: number | null;
  h1Lines: number | null;
  rev: number;
  query: string;
}

export interface LayoutReadings {
  budget: number;
  phone: PhoneReading | null;
  /** Home only. */
  fold: FoldReading | null;
  /** Whether each reading is of the version the preview holds now. */
  phoneCurrent: boolean;
  foldCurrent: boolean;
  /** No preview to measure (the pane is hidden or unavailable). */
  idle: boolean;
  failed: boolean;
}

const px = (n: number) => Math.round(n).toLocaleString('en-IN');
/** One decimal, as W1's fold check reports it; a share just under the line never reads as 60.0 %. */
const pct = (share: number) => {
  const v = Math.round(share * 1000) / 10;
  return `${(share < FOLD_MIN_SHARE && v >= FOLD_MIN_SHARE * 100 ? FOLD_MIN_SHARE * 100 - 0.1 : v).toFixed(1)} %`;
};

/** What the publish dialog says about the layout: warnings only, never a block. */
export function layoutNotes(pageKey: DesignedKey, r: LayoutReadings | null): string[] {
  const out: string[] = [];
  const home = pageKey === 'home';
  if (!r || r.idle) return ['The layout meters haven’t measured this version: open the preview to measure it.'];
  if (r.failed) out.push('The layout meters couldn’t measure this version.');
  if (!r.phone || !r.phoneCurrent || (home && (!r.fold || !r.foldCurrent))) {
    if (!r.failed) out.push('The layout meters are still measuring this version.');
  }
  if (r.phone && r.phone.docHeight > r.budget) {
    out.push(`On a phone the page is ${px(r.phone.docHeight)} px long, over its ${px(r.budget)} px budget.`);
  }
  if (home && r.fold && r.fold.share !== null && r.fold.share < FOLD_MIN_SHARE) {
    out.push(`At 1366 × 657 only ${pct(r.fold.share)} of the hero figure is above the fold; it needs ${FOLD_MIN_SHARE * 100} %.`);
  }
  return out;
}

type Target = { url: string; rev: number; query: string; nonce: number };

function Bar({ value, max, over }: { value: number; max: number; over: boolean }) {
  const w = Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span className={cn('block h-full rounded-full', over ? 'bg-warning' : 'bg-success')} style={{ width: `${w}%` }} />
    </span>
  );
}

function Updating({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Loader2 className="size-3 animate-spin" aria-hidden /> updating
    </span>
  );
}

export function LayoutMeters({
  pageKey,
  preview,
  query = '',
  onReadings,
}: {
  pageKey: DesignedKey;
  /** The preview's address and version (PreviewPane's onPreview); null while there is none. */
  preview: PreviewTarget | null;
  /** The same query as the visible frame ("gate=off"). */
  query?: string;
  onReadings?: (r: LayoutReadings) => void;
}) {
  const home = pageKey === 'home';
  const budget = PHONE_BUDGETS[pageKey];
  const [target, setTarget] = useState<Target | null>(null);
  const [phone, setPhone] = useState<PhoneReading | null>(null);
  const [fold, setFold] = useState<FoldReading | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const phoneFrame = useRef<HTMLIFrameElement>(null);
  const foldFrame = useRef<HTMLIFrameElement>(null);
  const targetRef = useRef<Target | null>(null);
  targetRef.current = target;
  const lastLoad = useRef(0);
  const heard = useRef({ phone: -1, fold: -1 });
  const quiet = useRef<number[]>([]);

  const url = preview?.url ?? null;
  const rev = preview?.rev ?? 0;

  // Load the newest version into the measuring frames, at most once every 6 s.
  useEffect(() => {
    if (!url) {
      setTarget(null);
      return;
    }
    const run = () => {
      lastLoad.current = Date.now();
      setFailed(false);
      setTarget({ url, rev, query, nonce });
    };
    const wait = lastLoad.current + MEASURE_GAP_MS - Date.now();
    if (wait <= 0) {
      run();
      return;
    }
    const t = window.setTimeout(run, wait);
    return () => window.clearTimeout(t);
  }, [url, rev, query, nonce]);

  // The measurements, from this origin and our own frames only.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.source) return;
      const d = e.data as PreviewMeasureMessage | null;
      const t = targetRef.current;
      if (!t || !d || d.type !== 'sv-preview-measure') return;
      if (e.source === phoneFrame.current?.contentWindow && typeof d.docHeight === 'number') {
        heard.current.phone = t.rev;
        setPhone({ docHeight: d.docHeight, rev: t.rev, query: t.query });
      } else if (e.source === foldFrame.current?.contentWindow) {
        heard.current.fold = t.rev;
        setFold({ share: d.fold ? d.fold.share : null, h1Lines: d.fold?.h1Lines ?? null, rev: t.rev, query: t.query });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(
    () => () => {
      for (const t of quiet.current) window.clearTimeout(t);
    },
    [],
  );

  /** A frame has loaded: it should speak within QUIET_MS (PreviewMeasure waits for fonts + 500 ms). */
  const armQuiet = useCallback((which: 'phone' | 'fold', forRev: number) => {
    const t = window.setTimeout(() => {
      if (targetRef.current?.rev === forRev && heard.current[which] !== forRev) setFailed(true);
    }, QUIET_MS);
    quiet.current.push(t);
  }, []);

  const idle = !url;
  const phoneCurrent = !!phone && phone.rev === rev && phone.query === query;
  const foldCurrent = !!fold && fold.rev === rev && fold.query === query;

  const onReadingsRef = useRef(onReadings);
  onReadingsRef.current = onReadings;
  useEffect(() => {
    onReadingsRef.current?.({ budget, phone, fold: home ? fold : null, phoneCurrent, foldCurrent, idle, failed });
  }, [budget, phone, fold, home, phoneCurrent, foldCurrent, idle, failed]);

  const over = !!phone && phone.docHeight > budget;
  const foldLow = !!fold && fold.share !== null && fold.share < FOLD_MIN_SHARE;
  const frameSrc = target ? withQuery(target.url, target.query) : '';
  const frameKey = target ? `${target.rev}|${target.query}|${target.nonce}` : '';

  return (
    <div className="w-full space-y-3" aria-label="Layout meters" role="group">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Layout meters</p>
        {failed && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => setNonce((n) => n + 1)}
          >
            <RefreshCw className="size-3" aria-hidden /> Measure again
          </button>
        )}
      </div>

      {idle ? (
        <p className="text-xs text-muted-foreground">Open the preview to measure the page.</p>
      ) : (
        <>
          <div className="space-y-1" data-meter="phone">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
              <span className="text-muted-foreground">Phone length (390 × 844)</span>
              <span className={cn('font-medium tabular-nums', over && 'text-warning')} data-meter-value>
                {phone ? `${px(phone.docHeight)} / ${px(budget)} px` : '…'}
              </span>
            </div>
            {phone ? <Bar value={phone.docHeight} max={budget} over={over} /> : <Bar value={0} max={budget} over={false} />}
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" aria-live="polite">
              {!phone ? (
                failed ? (
                  <span>Couldn’t measure this version.</span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" aria-hidden /> Measuring…
                  </span>
                )
              ) : over ? (
                <span className="inline-flex items-center gap-1 text-warning">
                  <TriangleAlert className="size-3" aria-hidden /> {px(phone.docHeight - budget)} px over this page’s budget
                </span>
              ) : (
                <span>{px(budget - phone.docHeight)} px to spare</span>
              )}
              <Updating on={!!phone && !phoneCurrent && !failed} />
            </p>
          </div>

          {home && (
            <div className="space-y-1" data-meter="fold">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="text-muted-foreground">Hero figure above the fold (1366 × 657)</span>
                <span className={cn('font-medium tabular-nums', foldLow && 'text-warning')} data-meter-value>
                  {!fold ? '…' : fold.share === null ? 'no figure' : `${pct(fold.share)} (needs ${FOLD_MIN_SHARE * 100} %)`}
                </span>
              </div>
              {fold && fold.share !== null ? (
                <Bar value={fold.share} max={1} over={foldLow} />
              ) : (
                <Bar value={0} max={1} over={false} />
              )}
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground" aria-live="polite">
                {!fold ? (
                  failed ? (
                    <span>Couldn’t measure this version.</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="size-3 animate-spin" aria-hidden /> Measuring…
                    </span>
                  )
                ) : fold.share === null ? (
                  <span>The hero is type-led here (the site shows no prices), so there is no figure to keep above the fold.</span>
                ) : foldLow ? (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <TriangleAlert className="size-3" aria-hidden />
                    {fold.h1Lines && fold.h1Lines > 2
                      ? `The headline takes ${fold.h1Lines} lines at this width and pushes the figure down. Shorten it.`
                      : 'Less of the figure is above the fold than the design needs.'}
                  </span>
                ) : (
                  <span>{fold.h1Lines ? `The headline takes ${fold.h1Lines} lines at this width.` : 'Above the fold as designed.'}</span>
                )}
                <Updating on={!!fold && !foldCurrent && !failed} />
              </p>
            </div>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground">
            Measured on the preview with your motion setting. They warn and never block a publish.
          </p>
        </>
      )}

      {/* The measuring frames: real viewports, out of sight and out of reach. */}
      {target && (
        <div aria-hidden inert className="pointer-events-none fixed top-0 -left-[20000px] h-0 w-0 overflow-hidden">
          <iframe
            key={`phone|${frameKey}`}
            ref={phoneFrame}
            // A phone has a coarse pointer, and the footer's 44 px rows follow it;
            // this desktop frame can't, so PreviewMeasure marks it (W6 F2).
            src={withQuery(frameSrc, 'pointer=coarse')}
            title="Measuring the phone length"
            tabIndex={-1}
            width={PHONE_VIEWPORT.width}
            height={PHONE_VIEWPORT.height}
            style={{ width: PHONE_VIEWPORT.width, height: PHONE_VIEWPORT.height, border: 0 }}
            onLoad={() => armQuiet('phone', target.rev)}
          />
          {home && (
            <iframe
              key={`fold|${frameKey}`}
              ref={foldFrame}
              src={frameSrc}
              title="Measuring the fold"
              tabIndex={-1}
              width={FOLD_VIEWPORT.width}
              height={FOLD_VIEWPORT.height}
              style={{ width: FOLD_VIEWPORT.width, height: FOLD_VIEWPORT.height, border: 0 }}
              onLoad={() => armQuiet('fold', target.rev)}
            />
          )}
        </div>
      )}
    </div>
  );
}

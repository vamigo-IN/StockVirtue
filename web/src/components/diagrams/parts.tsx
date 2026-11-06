import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { VIEW_H, VIEW_W } from './geometry';
import s from './diagrams.module.css';

/**
 * The parts every teaching diagram shares (spec §6.8): the 600 × 240 box,
 * the SVG marks and the HTML labels. Server-safe: no hooks, no directive.
 *
 * Labels are HTML, not SVG text, so they stay `meta` 13/18 at every width;
 * they are placed in % over the drawing and never move or fade (only the
 * marks animate). With `keyed`, below 640 px each labelled mark gets a
 * numbered disc instead (a 1.5 px ink ring, the numeral at 12/16, 650) and
 * the labels are listed under the drawing in the same order. The SVG is
 * aria-hidden; the labels (or, below 640, the list) carry the words.
 */

/** A point in viewBox units with the side of the text that sits on it. */
export type Place = {
  x: number;
  y: number;
  /** Which end of the text is at x (default start). */
  align?: 'start' | 'center' | 'end';
  /** Whether the text sits above y, below it, or centred on it (default below). */
  valign?: 'above' | 'below' | 'middle';
};

/** One labelled mark: its words, where they sit, and (keyed diagrams) its disc's centre below 640 px. */
export type DiagramLabel = { key: string; text: string; at: Place; disc?: { x: number; y: number } };

const X: Record<NonNullable<Place['align']>, string> = { start: '0', center: '-50%', end: '-100%' };
const Y: Record<NonNullable<Place['valign']>, string> = { above: '-100%', below: '0', middle: '-50%' };

function pct(x: number, y: number): CSSProperties {
  return { left: `${((x / VIEW_W) * 100).toFixed(3)}%`, top: `${((y / VIEW_H) * 100).toFixed(3)}%` };
}

function placeStyle(p: Place): CSSProperties {
  return { ...pct(p.x, p.y), transform: `translate(${X[p.align ?? 'start']}, ${Y[p.valign ?? 'below']})` };
}

export function DiagramBox({
  labels,
  keyed,
  children,
}: {
  labels: DiagramLabel[];
  /** Numbered discs and a list below 640 px (Diagrams 1 and 2). */
  keyed: boolean;
  /** The SVG marks, in viewBox units. */
  children: ReactNode;
}) {
  return (
    <div className={cn(s.root, keyed && s.keyed)}>
      <div className={s.box}>
        <svg
          className={s.svg}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          {children}
        </svg>
        {labels.map((l) => (
          <span key={l.key} className={cn('t-meta', s.label)} style={placeStyle(l.at)} data-label={l.key}>
            {l.text}
          </span>
        ))}
        {keyed
          ? labels.map((l, i) =>
              l.disc ? (
                <span key={l.key} className={s.disc} style={pct(l.disc.x, l.disc.y)} aria-hidden="true">
                  {i + 1}
                </span>
              ) : null,
            )
          : null}
      </div>
      {keyed ? (
        <ol className={s.key} role="list">
          {labels.map((l, i) => (
            <li key={l.key} className="t-meta">
              <span className={s.keyDisc} aria-hidden="true">
                {i + 1}
              </span>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** Class names for the SVG marks (diagrams.module.css). */
export const mark = {
  ink: s.ink,
  level: s.level,
  stop: s.stop,
  guide: s.guide,
  dot: s.dot,
  ring: s.ring,
  square: s.square,
  bar: s.bar,
  blocked: s.blocked,
} as const;

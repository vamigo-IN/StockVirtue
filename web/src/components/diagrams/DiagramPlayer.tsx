'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { DIAGRAM_ANIMATIONS } from './animations';
import { DiagramFrame } from './DiagramFrame';
import type { DiagramAnimate, DiagramId } from './types';

export type { DiagramAnimate, DiagramEntry, DiagramId } from './types';

const REDUCE = '(prefers-reduced-motion: reduce)';

function reducedMotion(): boolean {
  try {
    return window.matchMedia(REDUCE).matches;
  } catch {
    return false;
  }
}

/** Entirely outside the viewport (no pixel of it visible). */
function offScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const h = window.innerHeight || document.documentElement.clientHeight;
  return r.bottom <= 0 || r.top >= h;
}

/** Start the diagram's animations with a fill that shows the start state. */
function start(animate: DiagramAnimate, root: HTMLElement): Animation[] {
  let list: Animation[] = [];
  try {
    list = animate(root) ?? [];
  } catch {
    return [];
  }
  for (const a of list) {
    const effect = a.effect;
    if (!effect) continue;
    const fill = effect.getTiming().fill;
    if (fill === 'none' || fill === 'auto' || fill === undefined) {
      effect.updateTiming({ fill: 'backwards' });
    } else if (fill === 'forwards') {
      effect.updateTiming({ fill: 'both' });
    }
  }
  return list;
}

function cancelAll(list: Animation[]): void {
  for (const a of list) {
    try {
      a.cancel();
    } catch {
      // already gone
    }
  }
}

/**
 * Plays a teaching diagram (spec §6.8, §6.9) with the browser's Web
 * Animations API: no animation library, no next/dynamic.
 *
 * - The drawing arrives as `children`, rendered by the caller on the server
 *   (pages use the server `Diagram` wrapper, which renders the catalog
 *   entry's Drawing). So the server HTML is the final annotated frame, the
 *   first client render is the same, and the drawings never ship as client
 *   JS. Only this player and the animate functions do.
 * - The animation is found by `id` in DIAGRAM_ANIMATIONS (animations.ts, W2).
 *   `animate` overrides it for client callers only (the gallery's demo): a
 *   server component can't pass a function to a client component.
 * - At hydration, a diagram ENTIRELY off screen is set to its start state
 *   and plays once when 60% of it is visible. A diagram already on screen
 *   keeps its final frame: it is never pulled back to empty in front of
 *   the reader.
 * - `prefers-reduced-motion` is checked with matchMedia before every play
 *   (Web Animations ignore the CSS switch): under it nothing is armed, the
 *   final frame shows, and Replay is hidden (CSS: no data-motion="ok").
 * - Replay (a secondary `sm` button, 44 px hit area) plays it from the
 *   start at any time. A diagram with no animation shows no Replay.
 */
export function DiagramPlayer({
  id,
  name,
  caption,
  headingLevel = 'h3',
  animate,
  children,
}: {
  id: DiagramId;
  name: string;
  caption: ReactNode;
  headingLevel?: 'h2' | 'h3';
  /** Client callers only (the gallery). Pages leave it out. */
  animate?: DiagramAnimate;
  /** The final frame, rendered on the server: the entry's `<Drawing />`. */
  children: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const running = useRef<Animation[]>([]);
  /** True while an armed diagram waits for 60% visibility. */
  const pending = useRef(false);
  const play = animate ?? DIAGRAM_ANIMATIONS[id];
  /** The latest animate function, so an inline one never re-arms the effect. */
  const playRef = useRef(play);
  const hasPlay = Boolean(play);
  const nameId = `diagram-${id}`;

  useEffect(() => {
    playRef.current = play;
  });

  const drawingRoot = useCallback(
    () => wrap.current?.querySelector<HTMLElement>('.sv-diagram-drawing') ?? null,
    [],
  );

  // Arm an off-screen diagram once, at hydration; play it at 60% visible.
  useEffect(() => {
    const el = wrap.current;
    const root = drawingRoot();
    const fn = playRef.current;
    if (!el || !root || !fn) return;
    if (reducedMotion() || !offScreen(el)) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const list = start(fn, root);
    if (!list.length) return;
    for (const a of list) {
      a.pause();
      a.currentTime = 0;
    }
    running.current = list;
    pending.current = true;

    const io = new IntersectionObserver(
      (entries) => {
        if (!pending.current) {
          io.disconnect(); // Replay already played it
          return;
        }
        const e = entries[entries.length - 1];
        if (!e || e.intersectionRatio < 0.6) return;
        io.disconnect();
        pending.current = false;
        if (reducedMotion()) {
          cancelAll(running.current); // straight to the final frame
          running.current = [];
          return;
        }
        for (const a of running.current) a.play();
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      pending.current = false;
      cancelAll(running.current);
      running.current = [];
    };
  }, [id, hasPlay, drawingRoot]);

  const replay = () => {
    const root = drawingRoot();
    const fn = playRef.current;
    if (!root || !fn) return;
    pending.current = false;
    cancelAll(running.current);
    running.current = [];
    if (reducedMotion()) return;
    running.current = start(fn, root); // element.animate() plays at once
  };

  return (
    <div ref={wrap} className="sv-diagram-player" data-diagram={id}>
      <DiagramFrame
        id={nameId}
        name={name}
        caption={caption}
        headingLevel={headingLevel}
        actions={
          hasPlay ? (
            <button
              type="button"
              className="sv-btn sv-btn-secondary sv-replay"
              data-size="sm"
              aria-describedby={nameId}
              onClick={replay}
            >
              Replay
            </button>
          ) : null
        }
      >
        {children}
      </DiagramFrame>
    </div>
  );
}

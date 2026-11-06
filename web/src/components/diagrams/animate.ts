import { MB, MOL, SL, VIEW_W, type PathEvent } from './geometry';
import type { DiagramAnimate } from './types';

/**
 * The three teaching diagrams' Web Animations (spec §6.8): the only diagram
 * code that ships to the browser, with geometry.ts. It never imports a
 * drawing. DiagramPlayer runs these on the drawing's root, pauses them at
 * their start state when it arms an off-screen diagram, and checks
 * reduced motion before every play.
 *
 * Every animation leaves the server's final frame untouched once it ends:
 * keyframes only ever run from a start state TO the drawn state, and fills
 * are 'backwards' (the start state shows while paused or delayed; nothing
 * is held afterwards). Path draws are linear, and each event's time is the
 * moment the drawn length reaches its mark, measured with getTotalLength()
 * and getPointAtLength(); no event has a hand-set delay.
 */

const EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)'; // --sv-ease-out

function find<T extends Element = SVGElement>(root: HTMLElement, name: string): T | null {
  return root.querySelector<T>(`[data-mark="${name}"]`);
}

/**
 * The drawn length at which `path` first meets the event: x at or past
 * `ev.x`, or y at or past `ev.y` (lower on screen). Sampled, then refined.
 */
function lengthAt(path: SVGPathElement, total: number, ev: PathEvent): number {
  const hit = (l: number): boolean => {
    const p = path.getPointAtLength(l);
    return (ev.x !== undefined && p.x >= ev.x - 0.5) || (ev.y !== undefined && p.y >= ev.y - 0.75);
  };
  const steps = 240;
  for (let i = 1; i <= steps; i += 1) {
    const l = (total * i) / steps;
    if (!hit(l)) continue;
    let a = (total * (i - 1)) / steps;
    let b = l;
    for (let k = 0; k < 12; k += 1) {
      const m = (a + b) / 2;
      if (hit(m)) b = m;
      else a = m;
    }
    return b;
  }
  return total;
}

/**
 * Draws `path` from its start in `ms`, linear. With vector-effect:
 * non-scaling-stroke the browser measures dashes in screen pixels, not in
 * viewBox units, so the dash is the path's length times the drawing's scale
 * (uniform: the box keeps 600:240).
 */
function draw(path: SVGPathElement, total: number, ms: number): Animation {
  const w = path.ownerSVGElement?.getBoundingClientRect().width ?? 0;
  const scale = w > 0 ? w / VIEW_W : 1;
  const len = Math.ceil(total * scale) + 2;
  const dash = `${len} ${len}`;
  return path.animate(
    [
      { strokeDasharray: dash, strokeDashoffset: `${len}` },
      { strokeDasharray: dash, strokeDashoffset: '0' },
    ],
    { duration: ms, easing: 'linear', fill: 'backwards' },
  );
}

/** A mark scaling in from nothing (its transform origin is its centre, in CSS). */
function pop(el: Element, delay: number, ms: number): Animation {
  return el.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], {
    delay,
    duration: ms,
    easing: EASE_OUT,
    fill: 'backwards',
  });
}

/** Diagram 1: the path draws; the market dot pops in at x 80, the limit dot fills where the path first reaches the line. */
export const animateMarketOrLimit: DiagramAnimate = (root) => {
  const path = find<SVGPathElement>(root, 'path');
  const market = find(root, 'market');
  const limit = find(root, 'limit');
  if (!path || !market || !limit) return [];
  const total = path.getTotalLength();
  if (!(total > 0)) return [];
  const at = (ev: PathEvent) => MOL.drawMs * (lengthAt(path, total, ev) / total);
  return [
    draw(path, total, MOL.drawMs),
    pop(market, at(MOL.marketAt), MOL.popMs),
    limit.animate([{ fillOpacity: 0 }, { fillOpacity: 1 }], {
      delay: at(MOL.limitAt),
      duration: MOL.popMs,
      easing: EASE_OUT,
      fill: 'backwards',
    }),
  ];
};

/** Diagram 2: the path draws down; the square appears where it crosses the stop. */
export const animateStopLoss: DiagramAnimate = (root) => {
  const path = find<SVGPathElement>(root, 'path');
  const square = find(root, 'trigger');
  if (!path || !square) return [];
  const total = path.getTotalLength();
  if (!(total > 0)) return [];
  const crossAt = SL.drawMs * (lengthAt(path, total, SL.crossAt) / total);
  return [draw(path, total, SL.drawMs), pop(square, crossAt, SL.popMs)];
};

/** Diagram 3: each blocked segment grows from the left, 600 ms each, starting 200 ms apart. */
export const animateMarginBlocks: DiagramAnimate = (root) => {
  const list: Animation[] = [];
  MB.bars.forEach((b, i) => {
    const el = find(root, `blocked-${b.key}`);
    if (!el) return;
    list.push(
      el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
        delay: i * MB.gapMs,
        duration: MB.growMs,
        easing: EASE_OUT,
        fill: 'backwards',
      }),
    );
  });
  return list;
};

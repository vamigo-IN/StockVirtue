/**
 * Where everything in the Ridgeline lands, in the poster's viewBox
 * (0–1400 × 0–400), for a given selection and camera: the ridges' projected
 * tops and bodies (the poster's paths), their slot styles, and the reading
 * layer's marks (spec §6.4.3–§6.4.5). Pure and isomorphic: no DOM, no
 * three.js. The poster draws with it on the server and in the browser; the
 * reading layer places its marks with it in both modes; the scene uses the
 * same world vertices (worldX/worldY) and the same slot styles.
 */
import type { RidgeModel } from './model';
import {
  BODY_FLOOR,
  REF_LINE_Z,
  REST_VIEW,
  VIEW_H,
  VIEW_W,
  project,
  slotZ,
  worldX,
  worldY,
  type View,
} from './projection';

/** One slot's look; values in between interpolate during a selection. */
export interface SlotStyle {
  /** How far the fill is mixed from --sv-surface toward --sv-paper, in %. */
  paperMix: number;
  /** Edge width in CSS px. */
  edgeWidth: number;
  edgeOpacity: number;
}

/**
 * Slot styles (spec §6.4.3): fill --sv-surface mixed toward --sv-paper by
 * 15% per slot (slot 0 pure white); edge 2.5 px at slot 0 and 1.25 px
 * behind it, opacity 0.9 at slot 0 falling evenly to 0.4 at slot 5.
 */
export function slotStyle(slot: number): SlotStyle {
  const s = Math.min(5, Math.max(0, slot));
  return {
    paperMix: 15 * s,
    edgeWidth: 2.5 - 1.25 * Math.min(1, s),
    edgeOpacity: 0.9 - 0.1 * s,
  };
}

/** Reference-line opacities: "0%" and the labelled second line. */
export const REF_OPACITY = { zero: 0.3, second: 0.15 } as const;

/** Line i's top, projected at depth `slot`: [x0, y0, x1, y1, …]. */
export function ridgePoints(
  model: RidgeModel,
  i: number,
  slot: number,
  view: View = REST_VIEW,
): Float64Array {
  const line = model.lines[i];
  const n = model.dates.length;
  const z = slotZ(slot);
  const out = new Float64Array(n * 2);
  for (let k = 0; k < n; k++) {
    const [x, y] = project(
      view,
      worldX(k, n),
      worldY(line.pct[k], model.scale),
      z,
    );
    out[2 * k] = x;
    out[2 * k + 1] = y;
  }
  return out;
}

/**
 * Where the body's two ends cross the bottom of the frame (x at y = 400):
 * the body is a vertical strip in the world, so its ends lean in the
 * picture, and the poster follows them exactly.
 */
export function bodyFeet(
  model: RidgeModel,
  i: number,
  slot: number,
  pts: Float64Array,
  view: View = REST_VIEW,
): [left: number, right: number] {
  const n = model.dates.length;
  const z = slotZ(slot);
  const foot = (k: number) => {
    const [bx, by] = project(view, worldX(k, n), BODY_FLOOR, z);
    const tx = pts[2 * k];
    const ty = pts[2 * k + 1];
    const t = by === ty ? 1 : (VIEW_H - ty) / (by - ty);
    return tx + t * (bx - tx);
  };
  return [foot(0), foot(n - 1)];
}

/** A whole number of tenths as the shortest decimal ("52" → "5.2", "-3" → "-.3"). */
function tenths(n: number): string {
  const neg = n < 0;
  const a = neg ? -n : n;
  const whole = Math.floor(a / 10);
  const f = a % 10;
  const s = f ? (whole ? `${whole}.${f}` : `.${f}`) : `${whole}`;
  return neg && a ? `-${s}` : s;
}

/**
 * The poster's two paths for one ridge: the edge (its top, one decimal,
 * relative steps accumulated from the rounded points so nothing drifts) and
 * the fill (the same top, then down its leaning ends to the bottom edge, so
 * every body reaches y = 400).
 */
export function ridgePaths(
  pts: Float64Array,
  feet: readonly [number, number],
): { edge: string; fill: string } {
  const n = pts.length / 2;
  let X = Math.round(pts[0] * 10);
  let Y = Math.round(pts[1] * 10);
  let d = `M${tenths(X)} ${tenths(Y)}`;
  if (n > 1) d += 'l';
  for (let k = 1; k < n; k++) {
    const nx = Math.round(pts[2 * k] * 10);
    const ny = Math.round(pts[2 * k + 1] * 10);
    const a = tenths(nx - X);
    const b = tenths(ny - Y);
    if (k > 1 && a[0] !== '-') d += ' ';
    d += b[0] === '-' ? a + b : `${a} ${b}`;
    X = nx;
    Y = ny;
  }
  const fill = `${d}L${tenths(Math.round(feet[1] * 10))} ${VIEW_H}L${tenths(
    Math.round(feet[0] * 10),
  )} ${VIEW_H}Z`;
  return { edge: d, fill };
}

/** The y of a projected polyline at viewBox x, or null outside it. */
export function polylineYAt(pts: Float64Array, x: number): number | null {
  const n = pts.length / 2;
  if (n < 2 || x < pts[0] || x > pts[2 * (n - 1)]) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[2 * mid] <= x) lo = mid;
    else hi = mid;
  }
  const x0 = pts[2 * lo];
  const x1 = pts[2 * hi];
  const y0 = pts[2 * lo + 1];
  const y1 = pts[2 * hi + 1];
  return x1 === x0 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * The session (a calendar index from `sessions`) whose projected x on the
 * front line `pts` is nearest viewBox x (a binary search; spec §6.4.6).
 */
export function sessionAtX(
  pts: Float64Array,
  sessions: readonly number[],
  x: number,
): number {
  if (!sessions.length) return 0;
  let lo = 0;
  let hi = sessions.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[2 * sessions[mid]] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const before = sessions[lo - 1];
    if (x - pts[2 * before] < pts[2 * sessions[lo]] - x) return before;
  }
  return sessions[lo];
}

/** Line i's point on calendar date k, at depth `slot`. */
export function pointOn(
  model: RidgeModel,
  i: number,
  k: number,
  slot: number,
  view: View = REST_VIEW,
): [number, number] {
  const n = model.dates.length;
  return project(
    view,
    worldX(k, n),
    worldY(model.lines[i].pct[k], model.scale),
    slotZ(slot),
  );
}

/** A reference line's two ends at `pct` on the front plane: [x0, y0, x1, y1]. */
export function refLine(
  model: RidgeModel,
  pct: number,
  view: View = REST_VIEW,
): [number, number, number, number] {
  const y = worldY(pct, model.scale);
  const [x0, y0] = project(view, -7, y, REF_LINE_Z);
  const [x1, y1] = project(view, 7, y, REF_LINE_Z);
  return [x0, y0, x1, y1];
}

/** viewBox units as a percentage of the figure box (dots stay round on the stretched phone poster). */
export const pctX = (x: number) => (x / VIEW_W) * 100;
export const pctY = (y: number) => (y / VIEW_H) * 100;

/**
 * The cubic-bezier easing CSS uses, for the selection's frame-by-frame
 * moves (--sv-ease-in-out is cubic-bezier(.65, 0, .35, 1)).
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) break;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    // Fall back to bisection if Newton's method wandered off.
    if (t < 0 || t > 1 || Math.abs(sx(t) - x) > 1e-4) {
      let lo = 0;
      let hi = 1;
      t = x;
      for (let i = 0; i < 24; i++) {
        if (sx(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sy(t);
  };
}

/** --sv-ease-in-out and its duration --sv-dur-3, for selections in both renderings. */
export const EASE_IN_OUT = cubicBezier(0.65, 0, 0.35, 1);
export const SELECT_MS = 320;

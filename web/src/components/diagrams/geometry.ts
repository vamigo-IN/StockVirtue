/**
 * The teaching diagrams' geometry (spec §6.8), in viewBox units of the shared
 * 600 × 240 box. Plain data with no imports: the server drawings
 * (MarketOrLimit.tsx, StopLoss.tsx, MarginBlocks.tsx) and the client
 * animations (animate.ts) both read it, so the final frame the server draws
 * and the frame an animation ends on are the same numbers, and no drawing is
 * pulled into the client bundle.
 *
 * The price paths are freehand (fixed curves, not data); the diagrams show no
 * prices and no axis numbers (R5). Each path is a chain of cubic curves whose
 * events sit on a vertex, so the server HTML draws every mark in its place.
 */

export const VIEW_W = 600;
export const VIEW_H = 240;

/** Where an event fires along a path: first x at or past `x`, or first y at or below the level (SVG y grows downward). */
export type PathEvent = { x?: number; y?: number };

/* ── Diagram 1, "Market or limit?" ───────────────────────────────────────── */

export const MOL = {
  /** Wanders from x 40 to 560; first reaches the limit line at the (420, 150) vertex. */
  path:
    'M40 96 C54 82 68 84 80 92 S112 118 140 108 S186 88 214 104 S262 136 292 124 S336 104 362 122 S400 150 420 150 S452 128 476 120 S520 98 560 102',
  drawMs: 1600,
  /** The dashed limit line, below the starting price. */
  limitY: 150,
  lineFrom: 40,
  lineTo: 560,
  /** The market order: fills at the next price. */
  market: { x: 80, y: 92 },
  /** The limit order: a hollow dot that fills when the path first reaches the line. */
  limit: { x: 420, y: 150 },
  dotR: 8,
  /** Event marks: the market dot when the drawn path reaches x 80, the limit dot when it reaches y 150. */
  marketAt: { x: 80 } satisfies PathEvent,
  limitAt: { y: 150 } satisfies PathEvent,
  popMs: 200,
} as const;

/* ── Diagram 2, "Where a stop-loss sits" ─────────────────────────────────── */

export const SL = {
  /** Passes the entry at (100, 90), falls through the stop at the (380, 165) vertex and keeps falling. */
  path:
    'M40 84 C60 80 82 84 100 90 S136 104 160 102 S206 118 232 126 S280 128 306 144 S352 150 380 165 S412 186 440 192 S500 204 560 212',
  drawMs: 1800,
  entry: { x: 100, y: 90 },
  /** The dashed stop-loss line (--sv-down). */
  stopY: 165,
  lineFrom: 40,
  lineTo: 560,
  /** The square marker where the path crosses the stop. */
  cross: { x: 380, y: 165 },
  square: 16,
  dotR: 8,
  /** The static bracket from the entry level to the stop level, and the entry level's guide. */
  bracketX: 520,
  tick: 8,
  guideFrom: 114,
  crossAt: { y: 165 } satisfies PathEvent,
  popMs: 200,
} as const;

/* ── Diagram 3, "What margin blocks" ─────────────────────────────────────── */

/**
 * A futures BUY blocks a fixed 12% of the contract's value for an index
 * future and 20% for a stock future (F6; backend common/margin.ts
 * INDEX_FUTURES_BPS 1200, STOCK_FUTURES_BPS 2000). The segments are drawn to
 * that scale; no number is printed in the diagram.
 */
export const MB = {
  barX: 40,
  barW: 520,
  barH: 30,
  bars: [
    { key: 'index', y: 48, share: 0.12 }, // F6
    { key: 'stock', y: 162, share: 0.2 }, // F6
  ],
  growMs: 600,
  gapMs: 200,
} as const;

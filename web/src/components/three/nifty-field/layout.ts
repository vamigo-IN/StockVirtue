/**
 * The Nifty Field's pure maths (spec §6.7): ranking, the grid and block
 * heights. No three.js and no DOM, so it is cheap to test and to import
 * from the React side.
 *
 * - Blocks are equal (no index weights exist). A block's height above the
 *   plane is its day gain and its depth below the plane its day fall:
 *   h = 0.04 + 0.45 × min(|pct|, 4) world units, centred at y = ±h/2. A
 *   move beyond 4% is drawn at 4% (the caption says so; the tooltip and the
 *   list give every exact value).
 * - Placement: ranked by % change, biggest gainer first, filling columns
 *   from left to right and each column from front to back, at a pitch of
 *   1.2 (x) by 1.3 (z). 5 rows when there are more than 12 members (Nifty
 *   50 is 10 × 5, Sensex 6 × 5), 3 otherwise (Bank Nifty 4 × 3), centred on
 *   the plane. The heatmap returns a row only for members it could quote,
 *   so the grid takes any count; a missing member leaves the last cell
 *   empty.
 */

export const PITCH_X = 1.2;
export const PITCH_Z = 1.3;
/** The block's footprint (BoxGeometry(0.9, 1, 0.9)). */
export const BLOCK = 0.9;
/** The plane: 12 × 6.5 world units, at y = 0 (the previous close). */
export const PLANE_W = 12;
export const PLANE_D = 6.5;
/** Moves beyond this are drawn at it. */
export const CAP_PCT = 4;
export const MIN_H = 0.04;
export const H_PER_PCT = 0.45;

/** The tallest block (and the deepest): 1.84. */
export const MAX_H = MIN_H + H_PER_PCT * CAP_PCT;

export function blockHeight(pct: number): number {
  return MIN_H + H_PER_PCT * Math.min(Math.abs(pct), CAP_PCT);
}

/** y of the block's centre: up for a gain (or no change), down for a fall. */
export function blockY(pct: number): number {
  const h = blockHeight(pct);
  return pct < 0 ? -h / 2 : h / 2;
}

export type FieldShape = { cols: number; rows: number };

export function fieldShape(count: number): FieldShape {
  const rows = count > 12 ? 5 : 3;
  return { cols: Math.max(1, Math.ceil(Math.max(count, 1) / rows)), rows };
}

export type FieldInput = { symbol: string; pct: number };

export type FieldCell<T extends FieldInput = FieldInput> = {
  item: T;
  /** 0 = the biggest gainer. */
  rank: number;
  col: number;
  row: number;
  x: number;
  z: number;
  h: number;
  y: number;
};

/** Biggest gainer first; ties keep the input order (Array#sort is stable). */
export function rankRows<T extends FieldInput>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.pct - a.pct);
}

/**
 * The cells, in rank order. Column c runs left to right (x from −… to +…),
 * and within a column row 0 is at the front (the largest z, nearest the
 * camera).
 */
export function layoutField<T extends FieldInput>(items: readonly T[]): {
  shape: FieldShape;
  cells: FieldCell<T>[];
} {
  const ranked = rankRows(items);
  const shape = fieldShape(ranked.length);
  const x0 = -((shape.cols - 1) * PITCH_X) / 2;
  const z0 = ((shape.rows - 1) * PITCH_Z) / 2;
  const cells = ranked.map((item, rank) => {
    const col = Math.floor(rank / shape.rows);
    const row = rank % shape.rows;
    return {
      item,
      rank,
      col,
      row,
      x: x0 + col * PITCH_X,
      z: z0 - row * PITCH_Z,
      h: blockHeight(item.pct),
      y: blockY(item.pct),
    };
  });
  return { shape, cells };
}

/**
 * The cell grid's lines on the plane (pairs of [x, z] end points): the
 * outline of every cell of the shape, so the empty last cells still show.
 */
export function gridLines(shape: FieldShape): [number, number, number, number][] {
  const w = shape.cols * PITCH_X;
  const d = shape.rows * PITCH_Z;
  const left = -w / 2;
  const back = -d / 2;
  const lines: [number, number, number, number][] = [];
  for (let c = 0; c <= shape.cols; c++) {
    const x = left + c * PITCH_X;
    lines.push([x, back, x, back + d]);
  }
  for (let r = 0; r <= shape.rows; r++) {
    const z = back + r * PITCH_Z;
    lines.push([left, z, left + w, z]);
  }
  return lines;
}

/** Ease in-out (cubic), for the rise, the sink and the refresh. */
export function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Motion (spec §6.7). */
export const RISE_MS = 600;
export const RISE_STAGGER_MS = 12;
export const SINK_MS = 250;
export const TAB_RISE_MS = 250;
export const REFRESH_MS = 600;

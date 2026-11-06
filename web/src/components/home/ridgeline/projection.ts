/**
 * One geometry, one camera (spec §6.4.3). The server poster, the client
 * poster, the reading layer and the WebGL scene all take their numbers from
 * this module, so the hand-over from poster to canvas can't be seen.
 *
 * Isomorphic and pure: no DOM and NO three.js import. three's ESM build
 * barely tree-shakes, so even one Matrix4 here would pull its core into the
 * home page's first-load JS (plan W1 task 1). The scene builds its
 * PerspectiveCamera from the constants below; $R/checks/W1/projection-check.mjs
 * checks that both projections agree within 0.05 viewBox units.
 *
 * Determinism: the server and every browser must print identical poster
 * coordinates, or hydration would see different `d` attributes. Only
 * +, −, ×, ÷ and sqrt are used here (IEEE 754 requires them to be correctly
 * rounded, so every engine gets the same bits); the one transcendental value,
 * tan(fov / 2), is written out as a literal.
 *
 * World units:
 * - x = −7 + 14·k/(N−1) for calendar index k (a year ago at −7, the latest
 *   date at +7);
 * - y = 1.5 × pct / A, so ±A fills ±1.5;
 * - slot s (0 front … 5 back) sits at z = −1.1·s;
 * - every ridge body runs down to y = −5, below the frame for every slot and
 *   parallax position.
 */

/** The poster's viewBox: "0 0 1400 400" (7:2). */
export const VIEW_W = 1400;
export const VIEW_H = 400;

/** The scene camera at rest (spec §6.4.3). */
export const CAMERA = {
  /** Vertical field of view, degrees. */
  fov: 17,
  /** 7:2, the figure's fixed aspect ratio. */
  aspect: 3.5,
  near: 1,
  far: 60,
  position: [1.2, 3.0, 14.0],
  target: [0, 0, -2.2],
} as const;

/**
 * tan(17° / 2), the value three.js computes as
 * Math.tan(DEG2RAD * 0.5 * fov) in V8 (checked by projection-check.mjs).
 */
export const TAN_HALF_FOV = 0.1494510013491278;

/** x runs from −X_HALF (a year ago) to +X_HALF (the latest date). */
export const X_HALF = 7;
/** ±A (the scale, in %) maps to ±Y_HALF world units. */
export const Y_HALF = 1.5;
/** Depth between slots: slot s sits at z = −SLOT_DEPTH·s. */
export const SLOT_DEPTH = 1.1;
/** Every ridge body runs down to this y (projects below the frame). */
export const BODY_FLOOR = -5;
/** At most six ridges (spec §6.4.1). */
export const MAX_RIDGES = 6;
/** Pointer parallax: the camera moves at most this far from rest (scene only). */
export const PARALLAX_X = 0.25;
export const PARALLAX_Y = 0.12;
/** The reference lines sit just in front of the front slot. */
export const REF_LINE_Z = 0.01;

export function worldX(k: number, n: number): number {
  return n > 1 ? -X_HALF + (2 * X_HALF * k) / (n - 1) : 0;
}

export function worldY(pct: number, scale: number): number {
  return (Y_HALF * pct) / scale;
}

export function slotZ(slot: number): number {
  return -SLOT_DEPTH * slot;
}

/**
 * A camera pose: the camera's axes (three.js Matrix4.lookAt with up = +y)
 * and its position. `makeView(dx, dy)` is the rest pose moved by a parallax
 * offset, still aimed at the target.
 */
export interface View {
  readonly xx: number;
  readonly xy: number;
  readonly xz: number;
  readonly yx: number;
  readonly yy: number;
  readonly yz: number;
  readonly zx: number;
  readonly zy: number;
  readonly zz: number;
  readonly ex: number;
  readonly ey: number;
  readonly ez: number;
}

export function makeView(dx = 0, dy = 0): View {
  const ex = CAMERA.position[0] + dx;
  const ey = CAMERA.position[1] + dy;
  const ez = CAMERA.position[2];
  // z axis: eye − target, normalised.
  let zx = ex - CAMERA.target[0];
  let zy = ey - CAMERA.target[1];
  let zz = ez - CAMERA.target[2];
  let l = Math.sqrt(zx * zx + zy * zy + zz * zz);
  zx /= l;
  zy /= l;
  zz /= l;
  // x axis: up × z with up = (0, 1, 0), normalised.
  let xx = zz;
  const xy = 0;
  let xz = -zx;
  l = Math.sqrt(xx * xx + xz * xz);
  xx /= l;
  xz /= l;
  // y axis: z × x.
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return { xx, xy, xz, yx, yy, yz, zx, zy, zz, ex, ey, ez };
}

/** The camera at rest (no parallax). */
export const REST_VIEW: View = makeView(0, 0);

const FX = 1 / (CAMERA.aspect * TAN_HALF_FOV);
const FY = 1 / TAN_HALF_FOV;

/** Projects a world point to the poster's viewBox (x 0–1400, y 0–400 down). */
export function project(
  v: View,
  x: number,
  y: number,
  z: number,
): [number, number] {
  const dx = x - v.ex;
  const dy = y - v.ey;
  const dz = z - v.ez;
  const cx = dx * v.xx + dy * v.xy + dz * v.xz;
  const cy = dx * v.yx + dy * v.yy + dz * v.yz;
  const w = -(dx * v.zx + dy * v.zy + dz * v.zz);
  return [
    ((FX * cx) / w + 1) * 0.5 * VIEW_W,
    (1 - (FY * cy) / w) * 0.5 * VIEW_H,
  ];
}

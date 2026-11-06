/**
 * The Ridgeline's camera and vertices (spec §6.4.3, §6.4.7), built from the
 * same constants and world mapping as the poster (projection.ts), so the
 * scene and the SVG poster draw one picture.
 *
 * Plain three.js with named imports only: this module is part of the lazy
 * scene chunk and never of the page's first-load JS.
 */
import { BufferAttribute, BufferGeometry, PerspectiveCamera } from 'three';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { RidgeModel } from '@/components/home/ridgeline/model';
import {
  BODY_FLOOR,
  CAMERA,
  X_HALF,
  worldX,
  worldY,
} from '@/components/home/ridgeline/projection';

/** The scene camera at rest: PerspectiveCamera(17, 3.5, 1, 60) at the §6.4.3 pose. */
export function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(
    CAMERA.fov,
    CAMERA.aspect,
    CAMERA.near,
    CAMERA.far,
  );
  placeCamera(camera, 0, 0);
  return camera;
}

/** Moves the camera by a parallax offset from rest, still aimed at the target. */
export function placeCamera(
  camera: PerspectiveCamera,
  dx: number,
  dy: number,
): void {
  camera.position.set(
    CAMERA.position[0] + dx,
    CAMERA.position[1] + dy,
    CAMERA.position[2],
  );
  camera.lookAt(CAMERA.target[0], CAMERA.target[1], CAMERA.target[2]);
  camera.updateMatrixWorld();
}

/**
 * Writes line i's body: two vertices per calendar date, the top at the
 * close (rebased) and the bottom at y = BODY_FLOOR, z = 0 (the group's z
 * places the slot).
 */
export function writeBody(
  out: Float32Array,
  model: RidgeModel,
  i: number,
): void {
  const n = model.dates.length;
  const pct = model.lines[i].pct;
  for (let k = 0; k < n; k++) {
    const x = worldX(k, n);
    const o = k * 6;
    out[o] = x;
    out[o + 1] = worldY(pct[k], model.scale);
    out[o + 2] = 0;
    out[o + 3] = x;
    out[o + 4] = BODY_FLOOR;
    out[o + 5] = 0;
  }
}

/** A body strip: 2 vertices per date, 2 triangles per step (counter-clockwise towards the camera). */
export function bodyGeometry(model: RidgeModel, i: number): BufferGeometry {
  const n = model.dates.length;
  const positions = new Float32Array(n * 6);
  writeBody(positions, model, i);
  const index = new Uint16Array(Math.max(0, n - 1) * 6);
  for (let k = 0; k < n - 1; k++) {
    const t0 = 2 * k;
    const b0 = t0 + 1;
    const t1 = t0 + 2;
    const b1 = t0 + 3;
    const o = k * 6;
    index[o] = t0;
    index[o + 1] = b0;
    index[o + 2] = t1;
    index[o + 3] = b0;
    index[o + 4] = b1;
    index[o + 5] = t1;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setIndex(new BufferAttribute(index, 1));
  return g;
}

/** Rewrites a body's vertices in place (same date count). */
export function updateBody(g: BufferGeometry, model: RidgeModel, i: number): void {
  const attr = g.getAttribute('position') as BufferAttribute;
  writeBody(attr.array as Float32Array, model, i);
  attr.needsUpdate = true;
}

/** Line i's top polyline as LineGeometry points [x, y, 0, …]. */
function edgePoints(model: RidgeModel, i: number): Float32Array {
  const n = model.dates.length;
  const pct = model.lines[i].pct;
  const out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    out[k * 3] = worldX(k, n);
    out[k * 3 + 1] = worldY(pct[k], model.scale);
  }
  return out;
}

/** The edge: a Line2 geometry through the top vertices. */
export function edgeGeometry(model: RidgeModel, i: number): LineGeometry {
  const g = new LineGeometry();
  g.setPositions(edgePoints(model, i));
  return g;
}

/**
 * Rewrites an edge's segments in place (same date count). LineGeometry
 * keeps segment pairs [p0, p1, p1, p2, …] in one interleaved buffer;
 * replacing it with setPositions() would orphan the old GPU buffer.
 */
export function updateEdge(g: LineGeometry, model: RidgeModel, i: number): void {
  const pts = edgePoints(model, i);
  const start = g.getAttribute('instanceStart') as unknown as {
    data: { array: Float32Array; needsUpdate: boolean };
  };
  const seg = start.data.array;
  const n = pts.length / 3;
  for (let k = 0; k < n - 1; k++) {
    seg[k * 6] = pts[k * 3];
    seg[k * 6 + 1] = pts[k * 3 + 1];
    seg[k * 6 + 2] = 0;
    seg[k * 6 + 3] = pts[(k + 1) * 3];
    seg[k * 6 + 4] = pts[(k + 1) * 3 + 1];
    seg[k * 6 + 5] = 0;
  }
  start.data.needsUpdate = true;
}

/** A reference line across the full width at `pct` (on the front plane; the object's z adds REF_LINE_Z). */
export function refGeometry(model: RidgeModel, pct: number): LineGeometry {
  const y = worldY(pct, model.scale);
  const g = new LineGeometry();
  g.setPositions(new Float32Array([-X_HALF, y, 0, X_HALF, y, 0]));
  return g;
}

/** Moves a reference line to `pct` in place. */
export function updateRef(g: LineGeometry, model: RidgeModel, pct: number): void {
  const y = worldY(pct, model.scale);
  const start = g.getAttribute('instanceStart') as unknown as {
    data: { array: Float32Array; needsUpdate: boolean };
  };
  start.data.array.set([-X_HALF, y, 0, X_HALF, y, 0]);
  start.data.needsUpdate = true;
}

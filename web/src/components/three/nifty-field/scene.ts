/**
 * The Nifty Field's WebGL scene (spec §6.7). A plain three.js module, loaded
 * by NiftyField with a plain `import()` only after the reader presses "View
 * in 3D" (no next/dynamic, no React inside). The shared runtime is W1's
 * (components/three/core): the demand loop, the frame monitor and disposal.
 *
 *   const scene = mountNiftyField(host, { items, colors, onGiveUp });
 *   await scene.ready;              // compiled; nothing drawn yet
 *   scene.reveal(true);             // the rise, on the next frame (false: full height at once)
 *   scene.setItems(items, 'refresh')// heights, colours and places ease over 600 ms ('tab': sink, then rise)
 *   scene.setOutline('HDFCBANK')    // the hovered block, or the list's highlighted row
 *   scene.pick(x, y) / anchor(sym)  // CSS px in the canvas
 *   scene.dispose()                 // frees everything, the context included
 *
 * - One InstancedMesh of BoxGeometry(0.9, 1, 0.9) with a MeshStandardMaterial
 *   (roughness 1, metalness 0) and per-instance colours; the 12 × 6.5 plane
 *   in --sv-surface-2 at 0.55 opacity with depthWrite off (fallers show
 *   beneath it); a --sv-line cell grid; one ink outline. At most 4 draw
 *   calls; no fog, post-processing or textures.
 * - Lights: a HemisphereLight (sky #FFFFFF, ground #E6E5DF) and one
 *   DirectionalLight from (4, 10, 6), their intensities set so the top faces
 *   render at their heat token (checked in the gallery; the sides are
 *   darker).
 * - Camera: PerspectiveCamera(28, 2, 1, 60) at (0, 9.0, 14.0), looking at
 *   (0, −0.2, 0.4), on a 2:1 canvas. Parallax on fine pointers only: ±6°
 *   yaw and ±3° pitch around the target, damped with λ 6.
 * - Draws on demand: at rest nothing is drawn (0 fps). The frame monitor
 *   lowers the pixel ratio, then gives up ('slow'); a lost context gives
 *   up ('context-lost'), an error while drawing ('error'). The caller
 *   disposes and returns to the grid.
 */
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  EdgesGeometry,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { disposeObject, disposeRenderer, watchContextLoss } from '@/components/three/core/dispose';
import { createLoop } from '@/components/three/core/loop';
import { createMonitor, pixelRatioCap } from '@/components/three/core/monitor';
import {
  BLOCK,
  PLANE_D,
  PLANE_W,
  REFRESH_MS,
  RISE_MS,
  RISE_STAGGER_MS,
  SINK_MS,
  TAB_RISE_MS,
  easeInOut,
  gridLines,
  layoutField,
  type FieldShape,
} from './layout';

export type HeatBinKey = 'n3' | 'n2' | 'n1' | '0' | 'p1' | 'p2' | 'p3';
export type FieldItem = { symbol: string; pct: number; bin: HeatBinKey };
export type FieldColors = {
  bins: Record<HeatBinKey, string>;
  /** --sv-surface-2 */
  plane: string;
  /** --sv-line */
  line: string;
  /** --sv-ink */
  outline: string;
  /** --sv-surface (the card behind the canvas) */
  clear: string;
};
export type GiveUpReason = 'slow' | 'context-lost' | 'error';
export type SetHow = 'refresh' | 'tab' | 'instant';

export interface NiftyFieldScene {
  /** Resolves once the shaders are compiled (nothing is drawn before reveal). */
  ready: Promise<void>;
  /** Starts drawing: with `rise`, the blocks rise by rank (600 ms, 12 ms stagger). */
  reveal(rise: boolean): void;
  setItems(items: FieldItem[], how: SetHow): void;
  setColors(colors: FieldColors): void;
  setOutline(symbol: string | null): void;
  /** Fine pointers: −1..1 across the canvas; null returns to rest. */
  setPointer(nx: number | null, ny: number | null): void;
  /** The block under a point (CSS px from the canvas's top-left). */
  pick(x: number, y: number): string | null;
  /** A block's projected top centre (CSS px from the canvas's top-left). */
  anchor(symbol: string): { x: number; y: number } | null;
  /** Moves the canvas into another host (a remount keeps the scene). */
  attach(host: HTMLElement): void;
  readonly canvas: HTMLCanvasElement;
  /**
   * Who hears a give-up. Writable, because a scene kept across a remount
   * (a tab change) reports to the component that adopted it.
   */
  onGiveUp: ((reason: GiveUpReason) => void) | null;
  dispose(): void;
  /** Gallery checks only. */
  debug: {
    /** Draws now and reads the sRGB pixel at a CSS point. */
    readPixel(x: number, y: number): [number, number, number] | null;
    frames(): number;
    calls(): number;
    /** The top face's centre of a block, in CSS px (for readPixel). */
    topFace(symbol: string): { x: number; y: number } | null;
    lights: { hemi: number; dir: number };
    setLights(hemi: number, dir: number): void;
  };
}

export interface FieldOptions {
  items: FieldItem[];
  colors: FieldColors;
  onGiveUp?: (reason: GiveUpReason) => void;
  /** `?debug3d=1` on dev builds. */
  log?: (message: string, detail?: unknown) => void;
}

/** Instances: up to 60 members, twice over during a tab change. */
const CAPACITY = 128;
const TARGET = new Vector3(0, -0.2, 0.4);
const EYE = new Vector3(0, 9.0, 14.0);
const YAW = (6 * Math.PI) / 180;
const PITCH = (3 * Math.PI) / 180;
const DAMP = 6;
const SETTLE = 1e-4;
/** Light intensities (physically based units, three r155+): tuned in the gallery. */
const HEMI_INTENSITY = 2.2;
const DIR_INTENSITY = 1.35;
const LIGHT_DIR = new Vector3(4, 10, 6);
/** The plane sits a hair above y = 0 so a faller's top face never z-fights it. */
const PLANE_Y = 0.002;
const GRID_Y = 0.004;

type Block = {
  symbol: string;
  bin: HeatBinKey;
  /** From and to: x, z, signed height (up > 0), colour. */
  fx: number;
  fz: number;
  fs: number;
  fc: Color;
  tx: number;
  tz: number;
  ts: number;
  tc: Color;
  /** Start (ms; −1 = the next frame), delay and duration. */
  t0: number;
  delay: number;
  dur: number;
  /** Now. */
  x: number;
  z: number;
  s: number;
  c: Color;
  /** Sinks away and is dropped. */
  leaving: boolean;
};

function signed(pct: number, h: number): number {
  return pct < 0 ? -h : h;
}

export function mountNiftyField(host: HTMLElement, o: FieldOptions): NiftyFieldScene {
  const log = o.log;
  const antialias = window.devicePixelRatio < 1.5;
  const renderer = new WebGLRenderer({ antialias, alpha: false, powerPreference: 'low-power' });
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.aspectRatio = '2 / 1';
  canvas.style.height = 'auto';
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap()));
  host.appendChild(canvas);

  let colors = o.colors;
  const binColor = (bin: HeatBinKey) => new Color().setStyle(colors.bins[bin]);
  renderer.setClearColor(new Color().setStyle(colors.clear), 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 2, 1, 60);
  camera.position.copy(EYE);
  camera.lookAt(TARGET);

  let hemiI = HEMI_INTENSITY;
  let dirI = DIR_INTENSITY;
  const hemi = new HemisphereLight(0xffffff, 0xe6e5df, hemiI);
  const sun = new DirectionalLight(0xffffff, dirI);
  sun.position.copy(LIGHT_DIR);
  sun.target.position.set(0, 0, 0);
  scene.add(hemi, sun, sun.target);

  // The blocks: one instanced mesh.
  const boxGeo = new BoxGeometry(BLOCK, 1, BLOCK);
  const boxMat = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const mesh = new InstancedMesh(boxGeo, boxMat, CAPACITY);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
  mesh.instanceColor.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // The plane (the previous close) and its cell grid.
  const planeMat = new MeshBasicMaterial({
    color: new Color().setStyle(colors.plane),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const plane = new Mesh(new PlaneGeometry(PLANE_W, PLANE_D), planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = PLANE_Y;
  scene.add(plane);
  const gridMat = new LineBasicMaterial({ color: new Color().setStyle(colors.line) });
  const grid = new LineSegments(new BufferGeometry(), gridMat);
  grid.position.y = GRID_Y;
  scene.add(grid);
  let shape: FieldShape | null = null;
  const setGrid = (next: FieldShape) => {
    if (shape && shape.cols === next.cols && shape.rows === next.rows) return;
    shape = next;
    const pts: number[] = [];
    for (const [x1, z1, x2, z2] of gridLines(next)) pts.push(x1, 0, z1, x2, 0, z2);
    grid.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
    grid.geometry.computeBoundingSphere();
  };

  // One outline, moved onto the hovered or highlighted block.
  const outlineMat = new LineBasicMaterial({ color: new Color().setStyle(colors.outline) });
  const outline = new LineSegments(new EdgesGeometry(new BoxGeometry(BLOCK, 1, BLOCK)), outlineMat);
  outline.visible = false;
  scene.add(outline);
  let outlined: string | null = null;

  // ── Blocks and their motion ────────────────────────────────────────────
  let blocks: Block[] = [];
  let revealed = false;
  const m4 = new Matrix4();
  const pos = new Vector3();
  const scl = new Vector3(1, 1, 1);
  const rot = new Quaternion();

  const place = (items: FieldItem[], how: SetHow | 'rise') => {
    const { shape: next, cells } = layoutField(items);
    setGrid(next);
    const old = new Map(blocks.filter((b) => !b.leaving).map((b) => [b.symbol, b]));
    const now = -1;
    const fresh: Block[] = [];
    if (how === 'tab') {
      // The old blocks sink (250 ms), then the new ones rise (250 ms).
      for (const b of blocks) {
        Object.assign(b, { fx: b.x, fz: b.z, fs: b.s, fc: b.c.clone(), ts: 0, t0: now, delay: 0, dur: SINK_MS, leaving: true });
        b.tx = b.x;
        b.tz = b.z;
        b.tc = b.c.clone();
      }
      for (const cell of cells) {
        const c = binColor(cell.item.bin);
        fresh.push({
          symbol: cell.item.symbol, bin: cell.item.bin,
          fx: cell.x, fz: cell.z, fs: 0, fc: c.clone(),
          tx: cell.x, tz: cell.z, ts: signed(cell.item.pct, cell.h), tc: c,
          t0: now, delay: SINK_MS, dur: TAB_RISE_MS,
          x: cell.x, z: cell.z, s: 0, c: c.clone(), leaving: false,
        });
      }
      blocks = [...blocks, ...fresh];
      return;
    }
    for (const cell of cells) {
      const c = binColor(cell.item.bin);
      const ts = signed(cell.item.pct, cell.h);
      const was = old.get(cell.item.symbol);
      if (how === 'rise') {
        fresh.push({
          symbol: cell.item.symbol, bin: cell.item.bin,
          fx: cell.x, fz: cell.z, fs: 0, fc: c.clone(), tx: cell.x, tz: cell.z, ts, tc: c,
          t0: now, delay: cell.rank * RISE_STAGGER_MS, dur: RISE_MS,
          x: cell.x, z: cell.z, s: 0, c: c.clone(), leaving: false,
        });
      } else if (how === 'instant' || !was) {
        // A remount shows full height at once; a member that is new in a
        // refresh rises at its place.
        const instant = how === 'instant';
        fresh.push({
          symbol: cell.item.symbol, bin: cell.item.bin,
          fx: cell.x, fz: cell.z, fs: instant ? ts : 0, fc: c.clone(), tx: cell.x, tz: cell.z, ts, tc: c,
          t0: now, delay: 0, dur: instant ? 0 : REFRESH_MS,
          x: cell.x, z: cell.z, s: instant ? ts : 0, c: c.clone(), leaving: false,
        });
      } else {
        fresh.push({
          symbol: cell.item.symbol, bin: cell.item.bin,
          fx: was.x, fz: was.z, fs: was.s, fc: was.c.clone(), tx: cell.x, tz: cell.z, ts, tc: c,
          t0: now, delay: 0, dur: REFRESH_MS,
          x: was.x, z: was.z, s: was.s, c: was.c.clone(), leaving: false,
        });
        old.delete(cell.item.symbol);
      }
    }
    // Members that left (a refresh without them) sink where they stand.
    const leaving: Block[] = [];
    if (how !== 'instant') {
      for (const b of old.values()) {
        Object.assign(b, { fx: b.x, fz: b.z, fs: b.s, fc: b.c.clone(), tx: b.x, tz: b.z, ts: 0, tc: b.c.clone(), t0: now, delay: 0, dur: REFRESH_MS, leaving: true });
        leaving.push(b);
      }
    }
    blocks = [...fresh, ...leaving];
  };

  const writeInstances = () => {
    let i = 0;
    for (const b of blocks) {
      if (i >= CAPACITY) break;
      const h = Math.max(Math.abs(b.s), 1e-4);
      pos.set(b.x, b.s / 2, b.z);
      scl.set(1, h, 1);
      m4.compose(pos, rot, scl);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, b.c);
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = null;
  };

  const placeOutline = () => {
    const b = outlined ? blocks.find((x) => !x.leaving && x.symbol === outlined) : undefined;
    if (!b || Math.abs(b.s) < 1e-3) {
      outline.visible = false;
      return;
    }
    outline.visible = true;
    outline.position.set(b.x, b.s / 2, b.z);
    outline.scale.set(1.012, Math.abs(b.s) + 0.012, 1.012);
  };

  // ── Camera: parallax around the target ─────────────────────────────────
  const base = new Spherical().setFromVector3(EYE.clone().sub(TARGET));
  const sph = new Spherical();
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  const placeCamera = () => {
    sph.copy(base);
    sph.theta = base.theta + YAW * cx;
    sph.phi = base.phi - PITCH * cy;
    camera.position.setFromSpherical(sph).add(TARGET);
    camera.lookAt(TARGET);
  };

  // ── Size ───────────────────────────────────────────────────────────────
  let cssW = 0;
  let cssH = 0;
  let currentHost = host;
  const resize = () => {
    const w = Math.max(1, Math.round(currentHost.clientWidth));
    const h = Math.max(1, Math.round(w / 2));
    if (w === cssW && h === cssH) return;
    cssW = w;
    cssH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    monitor.reset();
  };

  // ── The frame ──────────────────────────────────────────────────────────
  const frame = (now: number, dt: number): boolean => {
    const t0 = log ? performance.now() : 0;
    resize();
    let moving = false;
    if (revealed) {
      let dropped = false;
      for (const b of blocks) {
        if (b.t0 < 0) b.t0 = now;
        const p = b.dur <= 0 ? 1 : Math.min(1, Math.max(0, (now - b.t0 - b.delay) / b.dur));
        const e = easeInOut(p);
        b.x = b.fx + (b.tx - b.fx) * e;
        b.z = b.fz + (b.tz - b.fz) * e;
        b.s = b.fs + (b.ts - b.fs) * e;
        b.c.copy(b.fc).lerp(b.tc, e);
        if (p < 1) moving = true;
        else if (b.leaving) dropped = true;
      }
      if (dropped) blocks = blocks.filter((b) => !(b.leaving && now - b.t0 - b.delay >= b.dur));
      writeInstances();
      placeOutline();
    }
    if (cx !== tx || cy !== ty) {
      const k = 1 - Math.exp(-DAMP * dt);
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      if (Math.abs(tx - cx) < SETTLE && Math.abs(ty - cy) < SETTLE) {
        cx = tx;
        cy = ty;
      } else {
        moving = true;
      }
      placeCamera();
    }
    renderer.render(scene, camera);
    if (log) {
      log(`frame ${(performance.now() - t0).toFixed(2)} ms cpu, ${renderer.info.render.calls} calls, moving ${moving}`);
    }
    return moving;
  };

  let disposed = false;
  let giveUp = (reason: GiveUpReason) => {
    giveUp = () => {};
    log?.(`give up: ${reason}`);
    api.onGiveUp?.(reason);
  };

  const monitor = createMonitor({
    getPixelRatio: () => renderer.getPixelRatio(),
    setPixelRatio: (ratio) => {
      renderer.setPixelRatio(ratio);
      cssW = 0;
      resize();
      loop.invalidate();
    },
    giveUp: () => giveUp('slow'),
    log,
  });

  // The loop follows the canvas, so a remount into another host keeps it.
  const loop = createLoop({
    target: canvas,
    frame,
    onBurstFrame: (gap) => monitor.sample(gap),
    onError: (error) => {
      log?.('render error', error);
      giveUp('error');
    },
  });

  const unwatchLoss = watchContextLoss(canvas, () => {
    loop.dispose();
    giveUp('context-lost');
  });

  let ro: ResizeObserver | null = null;
  const observe = (el: HTMLElement) => {
    ro?.disconnect();
    if (typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver(() => {
      if (disposed) return;
      resize();
      loop.invalidate();
    });
    ro.observe(el);
  };
  observe(host);

  place(o.items, 'rise');
  resize();
  placeCamera();

  const ready = (async () => {
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      /* compileAsync is an optimisation; the first render compiles anyway */
    }
  })();

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const tmp = new Vector3();

  const api: NiftyFieldScene = {
    ready,
    canvas,
    onGiveUp: o.onGiveUp ?? null,
    reveal(rise) {
      if (disposed) return;
      if (!rise) {
        for (const b of blocks) {
          b.fs = b.ts;
          b.s = b.ts;
          b.dur = 0;
        }
      }
      revealed = true;
      loop.invalidate();
    },
    setItems(items, how) {
      if (disposed) return;
      place(items, how);
      if (!revealed && how === 'instant') revealed = true;
      loop.invalidate();
    },
    setColors(next) {
      if (disposed) return;
      colors = next;
      renderer.setClearColor(new Color().setStyle(next.clear), 1);
      planeMat.color.setStyle(next.plane);
      gridMat.color.setStyle(next.line);
      outlineMat.color.setStyle(next.outline);
      // A palette switch is instant: every block takes its new bin colour.
      for (const b of blocks) {
        const c = binColor(b.bin);
        b.tc.copy(c);
        b.fc.copy(c);
        b.c.copy(c);
      }
      writeInstances();
      loop.invalidate();
    },
    setOutline(symbol) {
      if (disposed || symbol === outlined) return;
      outlined = symbol;
      placeOutline();
      loop.invalidate();
    },
    setPointer(nx, ny) {
      if (disposed) return;
      tx = nx === null ? 0 : Math.max(-1, Math.min(1, nx));
      ty = ny === null ? 0 : Math.max(-1, Math.min(1, ny));
      loop.invalidate();
    },
    pick(x, y) {
      if (disposed || !cssW || !cssH || !mesh.count) return null;
      ndc.set((x / cssW) * 2 - 1, -(y / cssH) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      mesh.computeBoundingSphere();
      const hit = raycaster.intersectObject(mesh, false)[0];
      const id = hit?.instanceId;
      if (id === undefined) return null;
      const b = blocks[id];
      return b && !b.leaving ? b.symbol : null;
    },
    anchor(symbol) {
      const b = blocks.find((x) => !x.leaving && x.symbol === symbol);
      if (!b || !cssW) return null;
      tmp.set(b.x, Math.max(b.s, 0), b.z).project(camera);
      return { x: ((tmp.x + 1) / 2) * cssW, y: ((1 - tmp.y) / 2) * cssH };
    },
    attach(next) {
      if (disposed) return;
      currentHost = next;
      next.appendChild(canvas);
      observe(next);
      cssW = 0;
      resize();
      loop.invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loop.dispose();
      ro?.disconnect();
      unwatchLoss();
      disposeObject(scene);
      disposeRenderer(renderer);
    },
    debug: {
      readPixel(x, y) {
        if (disposed || !cssW) return null;
        renderer.render(scene, camera);
        const gl = renderer.getContext();
        const ratio = renderer.getPixelRatio();
        const px = Math.round(x * ratio);
        const py = Math.round((cssH - y) * ratio);
        const out = new Uint8Array(4);
        gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
        return [out[0], out[1], out[2]];
      },
      frames: () => loop.frames,
      calls: () => renderer.info.render.calls,
      topFace(symbol) {
        const b = blocks.find((x) => !x.leaving && x.symbol === symbol);
        if (!b || !cssW || b.s <= 0) return null;
        tmp.set(b.x, b.s, b.z).project(camera);
        return { x: ((tmp.x + 1) / 2) * cssW, y: ((1 - tmp.y) / 2) * cssH };
      },
      get lights() {
        return { hemi: hemiI, dir: dirI };
      },
      setLights(h, d) {
        hemiI = h;
        dirI = d;
        hemi.intensity = h;
        sun.intensity = d;
        loop.invalidate();
      },
    },
  };
  return api;
}

/**
 * The home Ridgeline's WebGL scene (spec §6.4.7). A plain module, loaded by
 * HeroStage with a plain `import()` on capable devices only (no next/dynamic
 * and no React tree inside). It draws exactly the poster's picture (one
 * geometry, one camera: projection.ts) with depth and parallax added; the
 * reading layer (bead, marks, labels) stays HTML in ReadingOverlay.
 *
 *   const scene = mountRidgeline(host, { data, order, onFrame, onGiveUp });
 *   await scene.ready;          // compiled, first frame drawn at opacity 0
 *   await scene.reveal();       // 320 ms fade over the identical poster; parallax on
 *   scene.setOrder(order, true) // selection: ridges move between slots over 320 ms
 *   scene.setTip(model)         // new tips, scale or calendar
 *   scene.setPointer(nx, ny)    // fine pointers, -1..1 over the figure; null = leave
 *   scene.dispose()             // frees everything, context included
 *
 * - Per series one Group (z from its slot): an opaque body strip and a
 *   Line2 edge. Two reference lines on the front plane. Nothing else: at
 *   most 14 draw calls and about 12,000 triangles.
 * - Draws on demand (core/loop.ts): at rest it draws nothing.
 * - The frame monitor (core/monitor.ts) lowers the pixel ratio, then gives
 *   up (onGiveUp('slow')); a lost context calls onGiveUp('context-lost');
 *   an error while rendering calls onGiveUp('error'). The caller disposes.
 */
import { Group, Mesh, Scene, WebGLRenderer } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import type { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { MeshBasicMaterial } from 'three';
import { createLoop } from '@/components/three/core/loop';
import { createMonitor, pixelRatioCap } from '@/components/three/core/monitor';
import {
  disposeObject,
  disposeRenderer,
  watchContextLoss,
} from '@/components/three/core/dispose';
import { slotsFor, type RidgeModel } from '@/components/home/ridgeline/model';
import { EASE_IN_OUT, SELECT_MS } from '@/components/home/ridgeline/layout';
import {
  PARALLAX_X,
  PARALLAX_Y,
  REF_LINE_Z,
  makeView,
  slotZ,
  type View,
} from '@/components/home/ridgeline/projection';
import {
  bodyGeometry,
  edgeGeometry,
  makeCamera,
  placeCamera,
  refGeometry,
  updateBody,
  updateEdge,
  updateRef,
} from './geometry';
import {
  applySlot,
  bodyMaterial,
  edgeMaterial,
  palette,
  readTokens,
  refMaterial,
  type RidgeTokens,
} from './materials';

export type GiveUpReason = 'slow' | 'context-lost' | 'error';

export interface RidgelineOptions {
  /** The resolved ridges (tips applied): resolveRidges(data, tips). */
  data: RidgeModel;
  /** Series indices, front to back. */
  order: readonly number[];
  /** The committed day (calendar index); the scene only redraws for it. */
  day?: number;
  /** Token colours; read from `host` when left out. */
  tokens?: RidgeTokens;
  /** After every rendered frame: the camera pose and each series' slot (fractional while moving). */
  onFrame?: (view: View, slots: readonly number[]) => void;
  onGiveUp?: (reason: GiveUpReason) => void;
  /** Log frame costs and monitor decisions (dev builds with ?debug3d=1). */
  debug?: boolean;
}

export interface RidgelineDebug {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  frames: number;
  pixelRatio: number;
  /** renderer.info.memory right after the scene's objects were disposed. */
  afterDispose: { geometries: number; textures: number } | null;
}

export interface RidgelineScene {
  /** Resolves once shaders are compiled and the first frame is drawn (canvas still at opacity 0). */
  readonly ready: Promise<void>;
  setOrder(order: readonly number[], animate: boolean): void;
  setDay(day: number): void;
  setTip(data: RidgeModel): void;
  setPointer(nx: number | null, ny?: number): void;
  /** Fades the canvas in over 320 ms; parallax starts when it has. */
  reveal(): Promise<void>;
  /** Fades the canvas out over 320 ms (before a give-up dispose). */
  fadeOut(): Promise<void>;
  dispose(): void;
  debug(): RidgelineDebug;
}

const FADE_MS = 320;
const SETTLE = 1e-4;

/** Mounts the scene into `host` (positioned; the canvas fills it). Throws if WebGL fails. */
export function mountRidgeline(
  host: HTMLElement,
  o: RidgelineOptions,
): RidgelineScene {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity ${FADE_MS}ms cubic-bezier(.22,1,.36,1)`;
  host.appendChild(canvas);

  const antialias = window.devicePixelRatio < 1.5;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias,
      alpha: false,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: true,
    });
  } catch (error) {
    canvas.remove();
    throw error;
  }

  const log =
    o.debug && process.env.NODE_ENV !== 'production'
      ? (msg: string, detail?: unknown) =>
          detail === undefined ? console.info(`[3d] ${msg}`) : console.info(`[3d] ${msg}`, detail)
      : undefined;

  const pal = palette(o.tokens ?? readTokens(host));
  renderer.setClearColor(
    `rgb(${pal.paper[0]}, ${pal.paper[1]}, ${pal.paper[2]})`,
    1,
  );
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap()));

  const scene = new Scene();
  const camera = makeCamera();

  let model = o.data;
  let n = model.lines.length;
  let slots: number[] = slotsFor(o.order, n);
  let from: number[] = slots.slice();
  let to: number[] = slots.slice();
  let animStart = -1;

  type Ridge = {
    group: Group;
    body: Mesh;
    bodyMat: MeshBasicMaterial;
    edge: Line2;
    edgeMat: LineMaterial;
  };
  let ridges: Ridge[] = [];

  const buildRidges = () => {
    for (const r of ridges) disposeObject(r.group);
    ridges = model.lines.map((_, i) => {
      const bodyMat = bodyMaterial();
      const edgeMat = edgeMaterial(antialias);
      const body = new Mesh(bodyGeometry(model, i), bodyMat);
      const edge = new Line2(edgeGeometry(model, i), edgeMat);
      body.frustumCulled = false;
      edge.frustumCulled = false;
      const group = new Group();
      group.add(body, edge);
      scene.add(group);
      return { group, body, bodyMat, edge, edgeMat };
    });
  };

  const zeroLine = new Line2(refGeometry(model, 0), refMaterial(pal, 'zero'));
  const secondLine = new Line2(
    refGeometry(model, model.refPct),
    refMaterial(pal, 'second'),
  );
  for (const line of [zeroLine, secondLine]) {
    line.position.z = REF_LINE_Z;
    line.renderOrder = 10;
    line.frustumCulled = false;
    scene.add(line);
  }
  buildRidges();

  const applySlots = () => {
    ridges.forEach((r, i) => {
      const s = slots[i] ?? 0;
      r.group.position.z = slotZ(s);
      applySlot(pal, r.bodyMat, r.edgeMat, s);
    });
  };
  applySlots();

  // Line widths are CSS px: resolution is the canvas's CSS size.
  let cssW = 0;
  let cssH = 0;
  const resize = () => {
    const r = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === cssW && h === cssH) return false;
    cssW = w;
    cssH = h;
    renderer.setSize(w, h, false);
    for (const r2 of ridges) r2.edgeMat.resolution.set(w, h);
    (zeroLine.material as LineMaterial).resolution.set(w, h);
    (secondLine.material as LineMaterial).resolution.set(w, h);
    return true;
  };
  resize();

  // Parallax: offset from rest, damped (λ 6) towards the pointer's target.
  let revealed = false;
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;

  let disposed = false;
  let afterDispose: RidgelineDebug['afterDispose'] = null;

  const frame = (now: number, dt: number): boolean => {
    const t0 = log ? performance.now() : 0;
    let moving = false;
    if (animStart >= 0) {
      const t = Math.min(1, Math.max(0, (now - animStart) / SELECT_MS));
      const e = EASE_IN_OUT(t);
      slots = from.map((f, i) => f + ((to[i] ?? f) - f) * e);
      applySlots();
      if (t >= 1) {
        animStart = -1;
        slots = to.slice();
      } else {
        moving = true;
      }
    }
    if (cx !== tx || cy !== ty) {
      const k = 1 - Math.exp(-6 * dt);
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      if (Math.abs(tx - cx) < SETTLE && Math.abs(ty - cy) < SETTLE) {
        cx = tx;
        cy = ty;
      } else {
        moving = true;
      }
      placeCamera(camera, cx, cy);
    }
    renderer.render(scene, camera);
    if (log) {
      log(`frame ${(performance.now() - t0).toFixed(2)} ms cpu, ${renderer.info.render.calls} calls, moving ${moving}`);
    }
    o.onFrame?.(makeView(cx, cy), slots);
    return moving;
  };

  let giveUp = (reason: GiveUpReason) => {
    giveUp = () => {};
    log?.(`give up: ${reason}`);
    o.onGiveUp?.(reason);
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

  const loop = createLoop({
    target: host,
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

  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (resize()) {
            monitor.reset();
            loop.invalidate();
          }
        })
      : null;
  ro?.observe(host);

  // Shaders compile before the first visible frame (spec §6.4.8), then the
  // first frame is drawn into the canvas while it is still transparent.
  const ready = (async () => {
    await renderer.compileAsync(scene, camera);
    if (disposed) return;
    resize();
    if (frame(performance.now(), 0)) loop.invalidate();
  })();

  const fade = (value: '0' | '1') =>
    new Promise<void>((resolve) => {
      if (disposed) return resolve();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        canvas.removeEventListener('transitionend', finish);
        resolve();
      };
      canvas.addEventListener('transitionend', finish);
      // transitionend never fires if nothing changes or the tab is hidden.
      window.setTimeout(finish, FADE_MS + 80);
      canvas.style.opacity = value;
    });

  return {
    ready,
    setOrder(order, animate) {
      if (disposed) return;
      const next = slotsFor(order, n);
      if (next.every((s, i) => s === to[i]) && animStart < 0) return;
      if (animate) {
        from = slots.slice();
        to = next;
        animStart = performance.now();
      } else {
        animStart = -1;
        from = next.slice();
        to = next.slice();
        slots = next.slice();
        applySlots();
      }
      loop.invalidate();
    },
    setDay() {
      loop.invalidate();
    },
    setTip(data) {
      if (disposed || data === model) return;
      const rebuild =
        data.dates.length !== model.dates.length || data.lines.length !== n;
      model = data;
      if (rebuild) {
        n = model.lines.length;
        const order = to
          .map((slot, i) => [slot, i] as const)
          .sort((a, b) => a[0] - b[0])
          .map(([, i]) => i);
        slots = slotsFor(order, n);
        from = slots.slice();
        to = slots.slice();
        animStart = -1;
        buildRidges();
        for (const r of ridges) r.edgeMat.resolution.set(cssW, cssH);
        applySlots();
      } else {
        model.lines.forEach((_, i) => {
          updateBody(ridges[i].body.geometry, model, i);
          updateEdge(ridges[i].edge.geometry as LineGeometry, model, i);
        });
      }
      updateRef(zeroLine.geometry as LineGeometry, model, 0);
      updateRef(secondLine.geometry as LineGeometry, model, model.refPct);
      loop.invalidate();
    },
    setPointer(nx, ny = 0) {
      if (disposed || !revealed) return;
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      tx = nx === null ? 0 : clamp(nx) * PARALLAX_X;
      ty = nx === null ? 0 : -clamp(ny) * PARALLAX_Y;
      loop.invalidate();
    },
    async reveal() {
      await ready;
      await fade('1');
      if (!disposed) revealed = true;
    },
    fadeOut() {
      revealed = false;
      return fade('0');
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revealed = false;
      loop.dispose();
      ro?.disconnect();
      unwatchLoss();
      disposeObject(scene);
      ridges = [];
      const mem = renderer.info.memory;
      afterDispose = { geometries: mem.geometries, textures: mem.textures };
      disposeRenderer(renderer);
    },
    debug() {
      const info = renderer.info;
      return {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        frames: loop.frames,
        pixelRatio: renderer.getPixelRatio(),
        afterDispose,
      };
    },
  };
}

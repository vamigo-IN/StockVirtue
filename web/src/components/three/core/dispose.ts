/**
 * Lifecycle, failure and disposal for the 3D scenes (spec §6.6.4). Type-only
 * three.js imports, so this module adds nothing to a bundle by itself.
 *
 * - `disposeObject(root)`: disposes every geometry, material and texture
 *   under `root` (LineGeometry and LineMaterial included). Afterwards
 *   `renderer.info.memory` reports 0 geometries and 0 textures.
 * - `disposeRenderer(renderer)`: disposes the renderer, calls
 *   `forceContextLoss()` so the browser frees the WebGL context at once,
 *   and removes the canvas.
 * - `watchContextLoss(canvas, onLost)`: `webglcontextlost` → onLost. There
 *   is no restore attempt in v1. Remove it (call the returned function)
 *   before disposing, or the scene's own forceContextLoss() would report
 *   itself.
 * - `set3DOff()`: `sessionStorage['sv:3d'] = 'off'`, so no scene loads again
 *   in this tab (after a lost context or a give-up). `can3D()` reads it.
 * - `watch3DConditions(onChange)`: calls back when the 3D media query
 *   ("min-width: 768px and min-height: 600px") or the reduced-motion
 *   preference changes; the caller re-checks `can3D()` and disposes a
 *   running scene when 3D is no longer allowed.
 */
import type {
  BufferGeometry,
  Material,
  Object3D,
  Texture,
  WebGLRenderer,
} from 'three';

function disposeMaterial(m: Material): void {
  for (const value of Object.values(m)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) {
      (value as Texture).dispose();
    }
  }
  // ShaderMaterials (LineMaterial) keep textures in uniforms.
  const uniforms = (m as Material & { uniforms?: Record<string, { value: unknown }> })
    .uniforms;
  if (uniforms) {
    for (const u of Object.values(uniforms)) {
      const v = u?.value as Texture | undefined;
      if (v && typeof v === 'object' && v.isTexture) v.dispose();
    }
  }
  m.dispose();
}

/** Disposes every geometry, material and texture under `root`, and detaches it. */
export function disposeObject(root: Object3D): void {
  root.traverse((node) => {
    const o = node as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    o.geometry?.dispose();
    if (Array.isArray(o.material)) o.material.forEach(disposeMaterial);
    else if (o.material) disposeMaterial(o.material);
  });
  root.removeFromParent();
  root.clear();
}

/** Frees the renderer and its WebGL context at once, and removes its canvas. */
export function disposeRenderer(renderer: WebGLRenderer): void {
  const canvas = renderer.domElement;
  renderer.dispose();
  renderer.forceContextLoss();
  canvas.remove();
}

/** `webglcontextlost` → onLost (once). Returns the function that removes the listener. */
export function watchContextLoss(
  canvas: HTMLCanvasElement,
  onLost: () => void,
): () => void {
  const handler = () => {
    canvas.removeEventListener('webglcontextlost', handler);
    onLost();
  };
  canvas.addEventListener('webglcontextlost', handler);
  return () => canvas.removeEventListener('webglcontextlost', handler);
}

/** No scene loads again in this tab (spec §6.6.4). */
export function set3DOff(): void {
  try {
    window.sessionStorage.setItem('sv:3d', 'off');
  } catch {
    /* storage blocked: 3D stays off for this page only */
  }
}

/** The media conditions of the 3D gate (spec §6.6.1) that can change while a scene runs. */
const CONDITIONS = [
  '(min-width: 768px) and (min-height: 600px)',
  '(prefers-reduced-motion: reduce)',
];

/**
 * Calls `onChange` whenever the 3D media query or the reduced-motion
 * preference changes. Returns the function that stops watching.
 */
export function watch3DConditions(onChange: () => void): () => void {
  const lists = CONDITIONS.map((q) => window.matchMedia(q));
  const handler = () => onChange();
  for (const l of lists) {
    if (l.addEventListener) l.addEventListener('change', handler);
    else l.addListener?.(handler);
  }
  return () => {
    for (const l of lists) {
      if (l.removeEventListener) l.removeEventListener('change', handler);
      else l.removeListener?.(handler);
    }
  };
}

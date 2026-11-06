/**
 * The 3D gate (spec §6.6.1): whether this browser may run a WebGL scene
 * (the home Ridgeline, the Nifty Field).
 *
 * Call it only in effects after hydration, never during render: it reads
 * the viewport, the device and sessionStorage. Phones (under 768 px wide or
 * 600 px tall) never get 3D and so never download WebGL code.
 *
 * The media conditions are read on every call, because a window can be
 * resized or a tablet rotated; only the WebGL probe is cached, once per
 * page view. The probe asks for WebGL 2 with failIfMajorPerformanceCaveat
 * (which refuses software rendering) and releases its context at once with
 * WEBGL_lose_context, so it never holds one of the browser's few contexts.
 *
 * sessionStorage['sv:3d'] = 'off' (set after a lost context or a give-up,
 * spec §6.6.4) keeps 3D off for the rest of the tab's session.
 */
let webgl2: boolean | undefined;

export function can3D(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.sessionStorage.getItem('sv:3d') === 'off') return false;
  } catch {
    /* storage blocked */
  }
  const m = (q: string) => window.matchMedia(q).matches;
  const n = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (
    !m('(min-width: 768px) and (min-height: 600px)') ||
    m('(prefers-reduced-motion: reduce)') ||
    n.connection?.saveData ||
    /(^|-)2g$/.test(n.connection?.effectiveType ?? '') ||
    (n.deviceMemory ?? 8) < 4 ||
    (n.hardwareConcurrency ?? 8) < 4
  ) {
    return false;
  }
  if (webgl2 === undefined) {
    try {
      const gl = document
        .createElement('canvas')
        .getContext('webgl2', { failIfMajorPerformanceCaveat: true });
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      webgl2 = !!gl;
    } catch {
      webgl2 = false;
    }
  }
  return webgl2;
}

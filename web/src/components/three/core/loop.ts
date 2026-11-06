/**
 * The demand render loop shared by the 3D scenes (spec §6.6.2): the home
 * Ridgeline and the Nifty Field. It replaces React Three Fiber's
 * frameloop="demand"; no three.js import, so it costs nothing on its own.
 *
 * - `invalidate()` asks for one frame. Nothing happens while the loop is
 *   stopped or a frame is already pending; otherwise it calls
 *   requestAnimationFrame once.
 * - Each frame calls `frame(now, dt)`, which updates the scene's damped and
 *   timed values, renders, and returns whether anything is still moving.
 *   While something is, the loop asks for the next frame itself (a burst).
 *   When nothing moves it stops asking, so at rest the scene draws nothing.
 * - The loop stops while `target` is off screen (IntersectionObserver) or
 *   the tab is hidden (visibilitychange), and draws one frame when it
 *   comes back.
 * - `onBurstFrame(gapMs)` receives the gap between two consecutive frames of
 *   a burst, and only those: the first frame of a burst, single frames
 *   caused by input or data, and anything across a stop are never reported.
 *   That is what the frame monitor samples (./monitor.ts, spec §6.6.3).
 *
 * Usage:
 *   const loop = createLoop({ target: host, frame: (now, dt) => { …; return moving; } });
 *   loop.invalidate();   // after any change
 *   loop.dispose();      // cancels the pending frame, disconnects observers
 */

/** Updates and renders one frame; returns whether anything is still moving. */
export type FrameFn = (now: number, dt: number) => boolean;

export interface LoopOptions {
  /** The element whose visibility starts and stops the loop (the canvas or its host). */
  target: Element;
  frame: FrameFn;
  /** The gap (ms) before each frame that a burst scheduled; see above. */
  onBurstFrame?: (gapMs: number) => void;
  /** Called when the target goes off screen (false) or comes back (true). */
  onScreenChange?: (onScreen: boolean) => void;
  /** Called when `frame` throws; the loop has stopped by then. */
  onError?: (error: unknown) => void;
}

export interface Loop {
  /** Asks for one frame (coalesced: at most one is ever pending). */
  invalidate(): void;
  /** Whether frames can run now (on screen, tab visible, not disposed). */
  readonly active: boolean;
  /** Frames drawn so far (for debugging and the at-rest check). */
  readonly frames: number;
  dispose(): void;
}

/** The longest step a damped value takes in one frame, in seconds. */
const MAX_DT = 0.1;
/** The step of a frame that isn't part of a burst (nothing to measure it from). */
const IDLE_DT = 1 / 60;

export function createLoop(o: LoopOptions): Loop {
  let raf = 0;
  let last = 0;
  // The pending frame was scheduled because the previous one still moved.
  let burst = false;
  let onScreen = true;
  let pageVisible =
    typeof document === 'undefined' || document.visibilityState !== 'hidden';
  let disposed = false;
  let frames = 0;

  const canRun = () => !disposed && onScreen && pageVisible;

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    burst = false;
  };

  const tick = (now: number) => {
    raf = 0;
    const continuing = burst && last > 0;
    burst = false;
    const dt = continuing ? Math.min((now - last) / 1000, MAX_DT) : IDLE_DT;
    if (continuing) o.onBurstFrame?.(now - last);
    last = now;
    frames++;
    let moving: boolean;
    try {
      moving = o.frame(now, dt);
    } catch (error) {
      stop();
      o.onError?.(error);
      return;
    }
    if (moving && canRun() && !raf) {
      burst = true;
      raf = requestAnimationFrame(tick);
    }
  };

  const invalidate = () => {
    if (disposed) return;
    if (!canRun() || raf) return;
    raf = requestAnimationFrame(tick);
  };

  const resume = () => {
    if (!canRun()) {
      stop();
      return;
    }
    // Draw one frame on return: a resize or a data change may have
    // happened while the loop was stopped.
    invalidate();
  };

  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      const now = e.isIntersecting;
      if (now === onScreen) return;
      onScreen = now;
      if (now) resume();
      else stop();
      o.onScreenChange?.(now);
    });
    io.observe(o.target);
  }

  const onVisibility = () => {
    const visible = document.visibilityState !== 'hidden';
    if (visible === pageVisible) return;
    pageVisible = visible;
    if (visible) resume();
    else stop();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    invalidate,
    get active() {
      return canRun();
    },
    get frames() {
      return frames;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

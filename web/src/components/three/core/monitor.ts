/**
 * The frame monitor (spec §6.6.3), which replaces drei's PerformanceMonitor.
 * No three.js import.
 *
 * A demand loop is idle most of the time, so frames per second over
 * wall-clock time would read as near zero and punish a healthy device. The
 * monitor therefore measures frame cost only inside bursts: the loop
 * (./loop.ts) reports the gap before each frame that a burst scheduled, and
 * nothing else.
 *
 * - A sample is that gap, clamped to 250 ms. The last 60 are kept.
 * - Every 30 new samples it takes the 75th percentile of the kept samples:
 *   - above 22 ms (under about 45 fps) while the pixel ratio is above 1, the
 *     pixel ratio drops to 1 for the rest of the page view (remounts too:
 *     see `pixelRatioCap()`), and sampling restarts;
 *   - above 40 ms (under 25 fps) at pixel ratio 1, the scene gives up
 *     (spec §6.6.4).
 * - The thresholds are absolute, so a browser that caps frames at 30 Hz to
 *   save power gets pixel ratio 1 but is never given up.
 */

const KEEP = 60;
const EVERY = 30;
const CLAMP_MS = 250;
const LOWER_MS = 22;
const GIVE_UP_MS = 40;

/** Set once a scene had to drop to pixel ratio 1; lasts for the page view. */
let lowered = false;

/** The highest pixel ratio a scene may use now: 2, or 1 after a drop. */
export function pixelRatioCap(): number {
  return lowered ? 1 : 2;
}

export interface MonitorOptions {
  getPixelRatio(): number;
  setPixelRatio(ratio: number): void;
  giveUp(): void;
  /** Debug logging (`?debug3d=1` on dev builds). */
  log?: (message: string, detail?: unknown) => void;
}

export interface FrameMonitor {
  /** One burst frame's gap in ms (from the loop's onBurstFrame). */
  sample(gapMs: number): void;
  /** Forget the kept samples (after a resize or a pixel-ratio change). */
  reset(): void;
  /** The kept samples, oldest first (debugging). */
  readonly samples: readonly number[];
}

function p75(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.ceil(0.75 * sorted.length) - 1);
  return sorted[Math.max(0, i)] ?? 0;
}

export function createMonitor(o: MonitorOptions): FrameMonitor {
  let kept: number[] = [];
  let fresh = 0;
  let done = false;

  return {
    sample(gapMs: number) {
      if (done || !(gapMs >= 0)) return;
      kept.push(Math.min(gapMs, CLAMP_MS));
      if (kept.length > KEEP) kept.shift();
      fresh++;
      if (fresh < EVERY) return;
      fresh = 0;
      const p = p75(kept);
      const ratio = o.getPixelRatio();
      o.log?.(`monitor: p75 ${p.toFixed(1)} ms over ${kept.length} samples at pixel ratio ${ratio}`, kept.slice());
      if (ratio > 1 && p > LOWER_MS) {
        lowered = true;
        o.log?.('monitor: pixel ratio -> 1');
        o.setPixelRatio(1);
        kept = [];
      } else if (ratio <= 1 && p > GIVE_UP_MS) {
        done = true;
        o.log?.('monitor: giving up');
        o.giveUp();
      }
    },
    reset() {
      kept = [];
      fresh = 0;
    },
    get samples() {
      return kept;
    },
  };
}

import type {
  CandlestickSeriesPartialOptions,
  ChartOptions,
  DeepPartial,
  IChartApi,
  Time,
} from 'lightweight-charts';
import { PALETTE_EVENT } from '@/lib/palette';
import { fmtPrice } from './format';

/**
 * The lightweight-charts set-up shared by the article chart widgets
 * (charts.tsx) and the market module PriceChart (spec §3.10, §4.10).
 *
 * Colours are read from the tokens on the chart's own element at mount
 * (`getComputedStyle`), so a chart follows the surface it sits on, the
 * blue/orange palette and the portal's dark mode:
 * - candles: --sv-up / --sv-down;
 * - compare lines: --sv-series-1…4 (series 1 is ink; on a dark card, where
 *   ink can't be seen, it is the card's text colour instead);
 * - axis text: the area's --muted-foreground (= --sv-text-3 on the public
 *   site), grid: --border (= --sv-line), crosshair: the text colour at 40%.
 * `watchChartColors` re-reads them when the palette switches (the
 * `sv:palette` event, or data-palette changing on #sv-public) or the OS
 * colour scheme changes (the portal's dark mode), and hands them back to be
 * applied. Browser only: call these from effects.
 *
 * The library module itself is loaded with a dynamic import() on first use,
 * so it never sits in a page's first-load JavaScript.
 */

export type ChartApi = IChartApi;
export type LwModule = typeof import('lightweight-charts');

export interface ChartColors {
  up: string;
  down: string;
  /** Compare-chart lines, never green or red. */
  series: [string, string, string, string];
  /** The chart's own text colour. */
  text: string;
  axis: string;
  grid: string;
  crosshair: string;
}

let ctx2d: CanvasRenderingContext2D | null | undefined;
const SENTINEL = '#010203';

/**
 * Any CSS colour as rgba(). lightweight-charts parses hex and rgb() only,
 * while the portal's colours are oklch(); painting one pixel lets the
 * browser convert it. Null when the colour is empty or can't be parsed.
 */
function toRgba(color: string, alpha = 1): string | null {
  const value = color.trim();
  if (!value) return null;
  if (ctx2d === undefined) {
    ctx2d = document
      .createElement('canvas')
      .getContext('2d', { willReadFrequently: true });
  }
  const ctx = ctx2d;
  if (!ctx) return null;
  ctx.fillStyle = SENTINEL;
  ctx.fillStyle = value; // left as is when the browser can't parse it
  if (ctx.fillStyle === SENTINEL && value.toLowerCase() !== SENTINEL) {
    return null;
  }
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const alphaOut = Math.round((a / 255) * alpha * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alphaOut})`;
}

/** Relative luminance (WCAG) of an rgba() string. */
function luminance(rgba: string): number {
  const [r, g, b] = (rgba.match(/[\d.]+/g) ?? ['0', '0', '0'])
    .slice(0, 3)
    .map((n) => Number(n) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The chart colours for `el`, read from the tokens where it sits. */
export function readChartColors(el: HTMLElement): ChartColors {
  const cs = getComputedStyle(el);
  const token = (name: string) => cs.getPropertyValue(name);
  const text = toRgba(cs.color) ?? 'rgba(17, 23, 20, 1)';
  const pick = (name: string, fallback: string) =>
    toRgba(token(name)) ?? fallback;
  // Light text means a dark card (the portal's dark mode), where an ink line
  // would vanish: series 1 then takes the text colour.
  const onDark = luminance(text) > 0.5;
  return {
    up: pick('--sv-up', 'rgba(15, 122, 59, 1)'),
    down: pick('--sv-down', 'rgba(192, 38, 45, 1)'),
    series: [
      onDark ? text : pick('--sv-series-1', text),
      pick('--sv-series-2', 'rgba(37, 86, 200, 1)'),
      pick('--sv-series-3', 'rgba(163, 92, 0, 1)'),
      pick('--sv-series-4', 'rgba(122, 62, 157, 1)'),
    ],
    text,
    axis: pick('--muted-foreground', text),
    grid: pick('--border', 'rgba(223, 221, 213, 1)'),
    crosshair: toRgba(cs.color, 0.4) ?? 'rgba(17, 23, 20, 0.4)',
  };
}

/** The colour parts of the chart options (also re-applied on a switch). */
function colorOptions(c: ChartColors): DeepPartial<ChartOptions> {
  return {
    layout: { textColor: c.axis },
    grid: { vertLines: { visible: false }, horzLines: { color: c.grid } },
    crosshair: {
      vertLine: { color: c.crosshair, labelBackgroundColor: c.text },
      horzLine: { color: c.crosshair, labelBackgroundColor: c.text },
    },
  };
}

/** Candle colours: up and down from the tokens, no borders. */
export function candleColors(c: ChartColors): CandlestickSeriesPartialOptions {
  return {
    upColor: c.up,
    downColor: c.down,
    borderVisible: false,
    wickUpColor: c.up,
    wickDownColor: c.down,
  };
}

/** Re-applies the chart-level colours (axis, grid, crosshair). */
export function applyChartColors(chart: ChartApi, c: ChartColors): void {
  chart.applyOptions(colorOptions(c));
}

/**
 * Creates a chart in `el` with the site's look: Archivo axis labels at
 * 11 px (the only 11 px text on the site), no vertical grid, a magnet
 * crosshair, Indian number format, and the TradingView attribution logo,
 * which the library's licence requires.
 */
export async function createLwChart(
  el: HTMLElement,
  o: { height: number; percent?: boolean },
): Promise<{ lc: LwModule; chart: ChartApi; colors: ChartColors }> {
  const lc = await import('lightweight-charts');
  const colors = readChartColors(el);
  const base = colorOptions(colors);
  const chart = lc.createChart(el, {
    ...base,
    height: o.height,
    autoSize: true,
    layout: {
      ...base.layout,
      background: { color: 'transparent' },
      fontFamily: getComputedStyle(el).fontFamily,
      fontSize: 11,
      attributionLogo: true,
    },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: { ...base.crosshair, mode: lc.CrosshairMode.Magnet },
    localization: {
      priceFormatter: o.percent
        ? (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p).toFixed(2)}%`
        : (p: number) => fmtPrice(p),
    },
  });
  return { lc, chart, colors };
}

/**
 * Calls `apply` with fresh colours whenever the palette switches or the OS
 * colour scheme changes. Returns the clean-up.
 */
export function watchChartColors(
  el: HTMLElement,
  apply: (c: ChartColors) => void,
): () => void {
  let frame = 0;
  const run = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (el.isConnected) apply(readChartColors(el));
    });
  };
  window.addEventListener(PALETTE_EVENT, run);
  const root = document.getElementById('sv-public');
  const observer = root ? new MutationObserver(run) : null;
  if (root && observer) {
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-palette'],
    });
  }
  const scheme =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  scheme?.addEventListener?.('change', run);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener(PALETTE_EVENT, run);
    observer?.disconnect();
    scheme?.removeEventListener?.('change', run);
  };
}

const IST_SECONDS = 330 * 60;

/**
 * A candle's time for the chart: daily candles as business days
 * ("2026-11-03"), intraday ones as IST wall-clock seconds, so the axis reads
 * India time wherever the reader is.
 */
export function candleTime(t: number, daily: boolean): Time {
  if (daily) {
    return new Date(t + IST_SECONDS * 1000).toISOString().slice(0, 10) as Time;
  }
  return (Math.floor(t / 1000) + IST_SECONDS) as Time;
}

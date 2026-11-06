/**
 * MiniChart (server-safe SVG) and its client variant MiniChartLive (plan
 * M0.7; spec §4.10). The SVG lives in mini-chart-core.tsx so the client
 * variant can import it without a cycle through this file.
 */
export { MiniChart, type MiniChartSize, type MiniChartStamp } from './mini-chart-core';
export { MiniChartLive } from './MiniChartLive';

import type { ComponentType } from 'react';

/** The three teaching diagrams (spec §6.8). W2 builds them. */
export type DiagramId = 'market-or-limit' | 'stop-loss' | 'margin-blocks';

/**
 * Starts the Web Animations for the marks inside `root` (the element holding
 * the drawing) and returns them. Timings come from getTotalLength() /
 * getPointAtLength(), never from hand-set delays. Use `fill: 'backwards'`
 * (DiagramPlayer sets it if you don't), so a paused animation shows its first
 * keyframe and a finished one leaves the drawing exactly as the server
 * rendered it. Put every mark's final position in the drawing itself.
 */
export type DiagramAnimate = (root: HTMLElement) => Animation[];

/**
 * One entry of the server catalog (`catalog.ts`, W2, NO 'use client'):
 * everything here renders on the server, so no function crosses to the
 * client. The animation lives apart, in `animations.ts`, keyed by id.
 */
export type DiagramEntry = {
  id: DiagramId;
  name: string;
  /** Equal for Diagrams 1 and 2; Diagram 3 differs (spec §6.8, §9.6.2). */
  captions: { features: string; learn: string };
  /**
   * The FINAL frame, server-rendered: SVG marks and HTML labels. Labels
   * never move or fade; only marks animate.
   */
  Drawing: ComponentType;
};

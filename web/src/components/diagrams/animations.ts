import { animateMarginBlocks, animateMarketOrLimit, animateStopLoss } from './animate';
import type { DiagramAnimate, DiagramId } from './types';

/**
 * The teaching diagrams' animations, keyed by id: the only diagram code that
 * ships to the browser (DiagramPlayer imports this; the drawings stay on the
 * server).
 *
 * W2 owns the entries (W6 created the empty registry, 5 Nov 2026). Each
 * animate function comes from animate.ts, which reads geometry.ts and never
 * imports a drawing, so no drawing is pulled into the client bundle. An id
 * without an entry still renders its final frame; it just never plays and
 * shows no Replay.
 */
export const DIAGRAM_ANIMATIONS: Partial<Record<DiagramId, DiagramAnimate>> = {
  'market-or-limit': animateMarketOrLimit,
  'stop-loss': animateStopLoss,
  'margin-blocks': animateMarginBlocks,
};

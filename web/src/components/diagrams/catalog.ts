import { MarginBlocksDrawing } from './MarginBlocks';
import { MarketOrLimitDrawing } from './MarketOrLimit';
import { StopLossDrawing } from './StopLoss';
import type { DiagramEntry, DiagramId } from './types';

/**
 * The three teaching diagrams (spec §6.8, captions §9.6.2), for /features
 * (Diagrams 1 and 2 in the Orders chapter, 3 in F&O) and Learn
 * (`/news/education`). Server catalog: NO 'use client'. Pages render
 *   <Diagram entry={DIAGRAMS['stop-loss']} page="features" />
 * and the player finds each animation by id in animations.ts.
 *
 * The names, labels and captions stay in code (W7 addendum §1.2: shared with
 * Learn and fact-bound). Diagrams 1 and 2 have one caption on both pages;
 * Diagram 3 has two, because /features states the margin rates only in its
 * fact file and the diagram prints no numbers.
 */
export const DIAGRAMS: Record<DiagramId, DiagramEntry> = {
  'market-or-limit': {
    id: 'market-or-limit',
    name: 'Market or limit?',
    // F2
    captions: {
      features:
        'A market order fills straight away at the next price. A limit order waits until the price reaches your limit, and may not fill at all.',
      learn:
        'A market order fills straight away at the next price. A limit order waits until the price reaches your limit, and may not fill at all.',
    },
    Drawing: MarketOrLimitDrawing,
  },
  'stop-loss': {
    id: 'stop-loss',
    name: 'Where a stop-loss sits',
    // F2
    captions: {
      features:
        "A stop-loss sends a sell order once the price falls through it, so a losing trade is closed even when you're not watching. In a fast fall the fill can be a little below the stop.",
      learn:
        "A stop-loss sends a sell order once the price falls through it, so a losing trade is closed even when you're not watching. In a fast fall the fill can be a little below the stop.",
    },
    Drawing: StopLossDrawing,
  },
  'margin-blocks': {
    id: 'margin-blocks',
    name: 'What margin blocks',
    // F6
    captions: {
      features:
        "A futures buy blocks part of the contract's value as margin: less for an index future than for a stock future. The app uses fixed rates, listed in the account summary at the top of the page; a broker's margin changes with each contract and with volatility.",
      learn:
        "A futures buy blocks part of the contract's value as margin. In the StockVirtue app that is a fixed 12% for an index future and 20% for a stock future; a broker's margin changes with each contract and with volatility.",
    },
    Drawing: MarginBlocksDrawing,
  },
};

/** The order they appear in on Learn (§9.6.2) and in the gallery. */
export const DIAGRAM_ORDER: readonly DiagramId[] = ['market-or-limit', 'stop-loss', 'margin-blocks'];

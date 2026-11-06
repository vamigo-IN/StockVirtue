import { MOL } from './geometry';
import { DiagramBox, mark, type DiagramLabel } from './parts';

/**
 * Diagram 1, "Market or limit?" (spec §6.8): the final frame, server-rendered.
 * A freehand price path from x 40 to 560, a dashed limit line at y 150 below
 * the starting price, the market order's dot at x 80 (it fills at the next
 * price) and the limit order's dot where the path first reaches the line
 * (x 420). animate.ts draws the path in 1,600 ms and brings each dot in when
 * the drawn length reaches it. No prices, no axis numbers.
 */

const LABELS: DiagramLabel[] = [
  { key: 'limit-line', text: 'Your limit price', at: { x: 40, y: 158 }, disc: { x: 52, y: 180 } },
  {
    key: 'market',
    text: 'Market order: fills at the next price',
    at: { x: 70, y: 74, valign: 'above' },
    disc: { x: 80, y: 60 },
  },
  {
    key: 'limit-order',
    text: 'Limit order: waits for your price',
    at: { x: 420, y: 166, align: 'center' },
    disc: { x: 420, y: 186 },
  },
];

export function MarketOrLimitDrawing() {
  return (
    <DiagramBox labels={LABELS} keyed>
      <line className={mark.level} x1={MOL.lineFrom} x2={MOL.lineTo} y1={MOL.limitY} y2={MOL.limitY} />
      <path data-mark="path" className={mark.ink} d={MOL.path} />
      <circle data-mark="market" className={mark.dot} cx={MOL.market.x} cy={MOL.market.y} r={MOL.dotR} />
      <circle data-mark="limit" className={mark.ring} cx={MOL.limit.x} cy={MOL.limit.y} r={MOL.dotR} />
    </DiagramBox>
  );
}

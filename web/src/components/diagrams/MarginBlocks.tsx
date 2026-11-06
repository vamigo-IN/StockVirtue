import { MB } from './geometry';
import { DiagramBox, mark, type DiagramLabel } from './parts';

/**
 * Diagram 3, "What margin blocks" (spec §6.8): the final frame,
 * server-rendered. Two full-width bars, an index future and a stock future,
 * each labelled "Contract value", with the share a futures buy blocks as
 * margin shaded from the left, drawn to scale (12% and 20%, F6). No number
 * is printed. animate.ts grows each segment from the left (600 ms each, 200
 * ms apart).
 *
 * Its labels sit outside the bars (the name and "Contract value" above,
 * "Blocked as margin" under the segment), clear of every mark at every
 * width, so unlike Diagrams 1 and 2 it needs no numbered discs on phones.
 */

const [INDEX, STOCK] = MB.bars;
const END = MB.barX + MB.barW;

const LABELS: DiagramLabel[] = [
  { key: 'index-name', text: 'Index future', at: { x: MB.barX, y: INDEX.y - 6, valign: 'above' } },
  { key: 'index-value', text: 'Contract value', at: { x: END, y: INDEX.y - 6, align: 'end', valign: 'above' } },
  { key: 'index-blocked', text: 'Blocked as margin', at: { x: MB.barX, y: INDEX.y + MB.barH + 6 } },
  { key: 'stock-name', text: 'Stock future', at: { x: MB.barX, y: STOCK.y - 6, valign: 'above' } },
  { key: 'stock-value', text: 'Contract value', at: { x: END, y: STOCK.y - 6, align: 'end', valign: 'above' } },
  { key: 'stock-blocked', text: 'Blocked as margin', at: { x: MB.barX, y: STOCK.y + MB.barH + 6 } },
];

export function MarginBlocksDrawing() {
  return (
    <DiagramBox labels={LABELS} keyed={false}>
      {MB.bars.map((b) => (
        <g key={b.key}>
          <rect
            data-mark={`blocked-${b.key}`}
            className={mark.blocked}
            x={MB.barX}
            y={b.y}
            width={MB.barW * b.share}
            height={MB.barH}
          />
          <rect className={mark.bar} x={MB.barX} y={b.y} width={MB.barW} height={MB.barH} />
        </g>
      ))}
    </DiagramBox>
  );
}

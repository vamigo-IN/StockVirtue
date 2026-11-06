import { cn } from '@/lib/utils';
import { SL } from './geometry';
import { DiagramBox, mark, type DiagramLabel } from './parts';

/**
 * Diagram 2, "Where a stop-loss sits" (spec §6.8): the final frame,
 * server-rendered. The entry dot at (100, 90), a dashed --sv-down stop line
 * at y 165, the price path falling through it at x 380, where a square marks
 * the sale, and a static bracket from the entry level to the stop level.
 * animate.ts draws the path in 1,800 ms and brings the square in when the
 * drawn length reaches the stop. No prices, no axis numbers.
 */

const LABELS: DiagramLabel[] = [
  {
    key: 'entry',
    text: 'You buy here',
    at: { x: SL.entry.x, y: 74, align: 'center', valign: 'above' },
    disc: { x: SL.entry.x, y: 60 },
  },
  { key: 'stop', text: 'Stop-loss', at: { x: 40, y: 173 }, disc: { x: 52, y: 189 } },
  {
    key: 'trigger',
    text: 'The stop triggers a sale',
    at: { x: 368, y: 175, align: 'end' },
    disc: { x: 350, y: 193 },
  },
  {
    key: 'bracket',
    text: 'The most you planned to lose',
    at: { x: SL.bracketX - 14, y: (SL.entry.y + SL.stopY) / 2, align: 'end', valign: 'middle' },
    disc: { x: SL.bracketX + 32, y: (SL.entry.y + SL.stopY) / 2 },
  },
];

export function StopLossDrawing() {
  const { entry, cross, bracketX, tick, stopY, square } = SL;
  return (
    <DiagramBox labels={LABELS} keyed>
      <line className={cn(mark.level, mark.stop)} x1={SL.lineFrom} x2={SL.lineTo} y1={stopY} y2={stopY} />
      <line className={mark.guide} x1={SL.guideFrom} x2={bracketX - tick} y1={entry.y} y2={entry.y} />
      <path
        className={mark.ink}
        d={`M${bracketX - tick} ${entry.y} H${bracketX} V${stopY} H${bracketX - tick}`}
      />
      <path data-mark="path" className={mark.ink} d={SL.path} />
      <circle className={mark.dot} cx={entry.x} cy={entry.y} r={SL.dotR} />
      <rect
        data-mark="trigger"
        className={mark.square}
        x={cross.x - square / 2}
        y={cross.y - square / 2}
        width={square}
        height={square}
      />
    </DiagramBox>
  );
}

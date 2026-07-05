/**
 * A compact 5×5 depth ladder. Bars grow inward and "breathe" via CSS
 * keyframes (staggered, frozen under reduced motion in globals.css). Widths
 * are fixed (deterministic) so it's SSR-safe. Presentational only.
 */
const BIDS = [
  { px: '24,318.10', w: 92 },
  { px: '24,317.85', w: 74 },
  { px: '24,317.40', w: 58 },
  { px: '24,316.95', w: 66 },
  { px: '24,316.50', w: 44 },
];
const ASKS = [
  { px: '24,318.55', w: 88 },
  { px: '24,318.90', w: 61 },
  { px: '24,319.35', w: 70 },
  { px: '24,319.80', w: 49 },
  { px: '24,320.25', w: 55 },
];

export function OrderBook() {
  return (
    <div className="orderbook" aria-hidden="true">
      <div>
        {BIDS.map((b, i) => (
          <div className="ob-row bid" key={b.px}>
            <span
              className="bar"
              style={{ width: `${b.w}%`, animationDelay: `${i * 0.18}s` }}
            />
            <span className="px">{b.px}</span>
            <span>{(120 - i * 14).toString()}</span>
          </div>
        ))}
      </div>
      <div>
        {ASKS.map((a, i) => (
          <div className="ob-row ask" key={a.px}>
            <span
              className="bar"
              style={{ width: `${a.w}%`, animationDelay: `${i * 0.22}s` }}
            />
            <span className="px">{a.px}</span>
            <span>{(96 + i * 11).toString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

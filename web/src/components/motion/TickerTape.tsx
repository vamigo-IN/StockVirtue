'use client';

export type Tick = {
  sym: string;
  px: string;
  chg: string;
  up: boolean;
};

/**
 * Always-running symbol tape. Renders the row twice so the -50% translate
 * loops seamlessly. Green ▲ up-ticks / red ▼ down-ticks; `note` (the prices'
 * label and time) leads each loop. Frozen under reduced motion via
 * globals.css.
 */
export function TickerTape({
  items,
  speed = 42,
  reverse = false,
  className,
  note,
}: {
  items: Tick[];
  speed?: number;
  reverse?: boolean;
  className?: string;
  note?: string;
}) {
  const group = (
    <div className="ticker-group">
      {note && (
        <span className="tk">
          <span className="sym">{note}</span>
        </span>
      )}
      {items.map((t, i) => (
        <span className={`tk ${t.up ? 'up' : 'down'}`} key={`${t.sym}-${i}`}>
          <span className="sym">{t.sym}</span>
          <span className="px">{t.px}</span>
          <span className="chg">
            {t.up ? '▲' : '▼'} {t.chg}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div className={`ticker${className ? ` ${className}` : ''}`} aria-hidden="true">
      <div
        className={`ticker-track${reverse ? ' rtl' : ''}`}
        style={{ animationDuration: `${speed}s` }}
      >
        {group}
        {group}
      </div>
    </div>
  );
}

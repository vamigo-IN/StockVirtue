import { clsx } from 'clsx';
import { moversFootnote } from '@/components/market/copy';
import { delayFor } from '@/components/market/gate';
import { Stamp } from '@/components/market/Stamp';
import { LabelPill } from '@/components/widgets/frame';
import { fmtPct } from '@/components/widgets/format';
import { tone } from './parts';
import { CHART, fmt2, type DeskMove, type DeskQuote, type RealDesk } from './desk-model';
import e from './et.module.css';

const rupees = (n: number) => `₹${fmt2(n)}`;

/** The ticket's line under its button; the link's description. */
const TICKET_NOTE_ID = 'sv-desk-ticket-note';

/**
 * The trading desk beside the hero's text (Emerald Terminal), on the
 * terminal ground: real prices only (desk-model.ts), each block with its
 * Stamp. Server component: no client JS.
 *
 * - The chart (a year of daily closes with the snapshot's tip) carries the
 *   hero Stamp (`data-hero-stamp`, which widgets-e2e reads); the watchlist
 *   ends with the snapshot's Stamp and attribution.
 * - The order ticket: the first watchlist stock at its last price, 20
 *   shares and the order's value. "Place buy order" opens the app's Play
 *   listing: orders are placed in the app, as the line under it says.
 * - "Biggest moves": the large caps' top gainers and losers, else the
 *   curated indices, with their Stamp.
 *
 * Phones get the chart and the watchlist; the ticket and the moves come
 * from 640 px.
 */
export function Desk({ desk, playUrl }: { desk: RealDesk; playUrl: string }) {
  const both = !!desk.ticket && !!desk.moves;
  return (
    <div
      // The editor's fold meter (PreviewMeasure) measures the chart panel's share above the fold.
      id="sv-hero-figure"
      className={clsx('sv-terminal', e.desk)}
      role="group"
      aria-label="The trading desk, with real market prices"
      data-desk="real"
    >
      <div className={e.deskBar}>
        <span className={e.search} aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search NSE, BSE and MCX
        </span>
      </div>

      <div className={e.deskGrid}>
        <div className={e.panel} data-plate="">
          <DeskChart desk={desk} />
        </div>

        <div className={e.panel}>
          <div className={e.panelHead}>
            <h3 className={e.panelTitle}>Watchlist</h3>
            <span className={e.panelMeta}>{desk.watch.length} symbols</span>
          </div>
          <ul className={e.rows}>
            {desk.watch.map((q) => (
              <li key={q.symbol} className={e.row}>
                <span className={e.rowName} title={q.name}>
                  {q.symbol}
                  {q.label !== desk.watchStamp.label ? (
                    <>
                      {' '}
                      <LabelPill label={q.label} />
                    </>
                  ) : null}
                </span>
                <span>{fmt2(q.ltp)}</span>
                <span className={tone(q.changePct)}>{fmtPct(q.changePct)}</span>
              </li>
            ))}
          </ul>
          <Stamp
            label={desk.watchStamp.label}
            asOf={desk.watchStamp.asOf}
            attribution={desk.attribution}
            delay={delayFor(desk.right, desk.delayMinutes)}
            className={e.stamp}
          />
        </div>
      </div>

      {desk.ticket || desk.moves ? (
        <div className={clsx(e.lower, !both && e.lowerOne)}>
          {desk.ticket ? <Ticket desk={desk} ticket={desk.ticket} playUrl={playUrl} /> : null}
          {desk.moves ? <Moves desk={desk} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The order ticket at the stock's last price; its button opens the app's listing. */
function Ticket({
  desk,
  ticket,
  playUrl,
}: {
  desk: RealDesk;
  ticket: NonNullable<RealDesk['ticket']>;
  playUrl: string;
}) {
  return (
    <div className={clsx(e.panel, e.ticket)}>
      <div className={e.panelHead}>
        <h3 className={e.panelTitle}>
          Order ticket <span className={e.panelMeta}>{ticket.exchange}</span>
        </h3>
      </div>
      <div className={e.side} aria-hidden="true">
        <span className={e.buy}>BUY</span>
        <span>SELL</span>
      </div>
      <dl className={e.fields}>
        <div>
          <dt>Symbol</dt>
          <dd className={e.mono} title={ticket.name}>
            {ticket.symbol}
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>Limit, delivery</dd>
        </div>
        <div>
          <dt>Qty</dt>
          <dd className={e.mono}>{ticket.qty}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd className={clsx(e.mono, e.focus)}>{rupees(ticket.ltp)}</dd>
        </div>
      </dl>
      <dl className={e.sums}>
        <div>
          <dt>Order value</dt>
          <dd>{rupees(ticket.ltp * ticket.qty)}</dd>
        </div>
      </dl>
      <a href={playUrl} target="_blank" rel="noopener" className={e.place} aria-describedby={TICKET_NOTE_ID}>
        Place buy order<span className="sr-only"> in the app, on Google Play</span>
      </a>
      <p id={TICKET_NOTE_ID} className={e.note}>
        Orders are placed in the app.
      </p>
      <Stamp
        label={ticket.label}
        asOf={ticket.asOf}
        attribution={null}
        delay={delayFor(desk.right, desk.delayMinutes)}
        className={e.stamp}
      />
    </div>
  );
}

function MoveRow({ q }: { q: DeskMove | DeskQuote }) {
  return (
    <li className={e.row}>
      <span className={e.rowName} title={q.name}>
        {q.symbol}
      </span>
      <span>{fmt2(q.ltp)}</span>
      <span className={tone(q.changePct)}>{fmtPct(q.changePct)}</span>
    </li>
  );
}

/** "Biggest moves" among the large caps, else the indices the chart doesn't show. */
function Moves({ desk }: { desk: RealDesk }) {
  const m = desk.moves;
  if (!m) return null;
  const stamp = (
    <Stamp
      label={m.label}
      asOf={m.asOf}
      attribution={null}
      delay={delayFor(desk.right, desk.delayMinutes)}
      className={e.stamp}
    />
  );
  if (m.kind === 'indices') {
    return (
      <div className={e.panel}>
        <div className={e.panelHead}>
          <h3 className={e.panelTitle}>Indices</h3>
        </div>
        <ul className={e.rows}>
          {m.rows.map((q) => (
            <MoveRow key={q.symbol} q={q} />
          ))}
        </ul>
        {stamp}
      </div>
    );
  }
  return (
    <div className={e.panel}>
      <div className={e.panelHead}>
        <h3 className={e.panelTitle}>
          Biggest moves <span className={e.panelMeta}>Large caps</span>
        </h3>
      </div>
      {m.gainers.length ? (
        <>
          <h4 className={e.group}>Gainers</h4>
          <ul className={e.rows}>
            {m.gainers.map((q) => (
              <MoveRow key={q.symbol} q={q} />
            ))}
          </ul>
        </>
      ) : null}
      {m.losers.length ? (
        <>
          <h4 className={e.group}>Losers</h4>
          <ul className={e.rows}>
            {m.losers.map((q) => (
              <MoveRow key={q.symbol} q={q} />
            ))}
          </ul>
        </>
      ) : null}
      <p className={e.note}>{moversFootnote('largecap')}</p>
      {stamp}
    </div>
  );
}

function DeskChart({ desk }: { desk: RealDesk }) {
  const { chart } = desk;
  const m = chart.model;
  const stroke = m.up ? 'var(--sv-up)' : 'var(--sv-down)';
  return (
    <>
      <div className={e.panelHead}>
        <h3 className={e.panelTitle}>
          {chart.name} <span className={e.panelMeta}>{chart.meta}</span>
        </h3>
      </div>
      <p className={e.quote}>
        {fmt2(chart.ltp)} <small className={tone(chart.changePct)}>{fmtPct(chart.changePct)}</small>
      </p>
      <svg className={e.chart} viewBox={`0 0 ${CHART.w} ${CHART.h}`} role="img" aria-label={`${chart.name}, daily closes over the last year`}>
        {m.grid.map((g) => (
          <g key={g.label}>
            <path d={`M0 ${g.y}H${CHART.right}`} stroke="var(--sv-term-line)" strokeWidth="1" />
            <text x={CHART.right + 6} y={g.y + 3.5} fontSize="10" fill="var(--sv-fg-3)">
              {g.label}
            </text>
          </g>
        ))}
        <path d={m.area} fill={stroke} fillOpacity="0.12" />
        <path d={m.line} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <rect x={CHART.right + 2} y={m.last.y - 8} width={CHART.w - CHART.right - 2} height="16" rx="3" fill="var(--sv-on-term)" />
        <text x={(CHART.right + CHART.w) / 2 + 1} y={m.last.y + 3.5} fontSize="9.5" fontWeight="600" textAnchor="middle" fill="var(--sv-term)">
          {m.last.label.replace(/\.\d+$/, '')}
        </text>
        {m.xLabels.map((l) => (
          <text key={`${l.x}-${l.label}`} x={l.x} y={CHART.h - 8} fontSize="10" fill="var(--sv-fg-3)" textAnchor={l.anchor}>
            {l.label}
          </text>
        ))}
      </svg>
      <Stamp
        label={chart.label}
        asOf={chart.asOf}
        attribution={null}
        delay={delayFor(desk.right, desk.delayMinutes)}
        heroStamp
        className={e.stamp}
      />
    </>
  );
}

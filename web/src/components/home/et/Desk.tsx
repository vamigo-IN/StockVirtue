import { clsx } from 'clsx';
import { delayFor } from '@/components/market/gate';
import { Stamp } from '@/components/market/Stamp';
import { LabelPill } from '@/components/widgets/frame';
import { fmtPct } from '@/components/widgets/format';
import { SampleTag, tone } from './parts';
import {
  CHART,
  SAMPLE_POSITIONS,
  SAMPLE_SCALE,
  SAMPLE_TICKET,
  SAMPLE_WATCH,
  fmt2,
  sampleCandles,
  sampleY,
  type RealDesk,
} from './desk-model';
import e from './et.module.css';

const rupees = (n: number) => `₹${fmt2(n)}`;
const signedRupees = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}₹${fmt2(Math.abs(n))}`;

/**
 * The trading desk beside the hero's text (Emerald Terminal), on the
 * terminal ground. Server component: no client JS.
 *
 * - `real` (the site-prices gate is on and the data is there): the chart
 *   (a year of Nifty 50 closes with the snapshot's tip) and the watchlist
 *   (snapshot rows) are real, each with its Stamp; the chart's carries
 *   `data-hero-stamp` (widgets-e2e reads it). The order ticket is labelled
 *   "Example order" (its limit price is derived from the first watchlist
 *   price) and the positions "Sample".
 * - `real` null: the whole desk is a "Sample screen" with round numbers.
 *
 * Phones get the chart and the watchlist; the ticket, the positions and
 * the decorative "order placed" float come from 640 px (the float 1024).
 */
export function Desk({ real }: { real: RealDesk | null }) {
  const ticket = real ? real.ticket : SAMPLE_TICKET;
  const value = ticket.price * ticket.qty;
  return (
    <div
      // The editor's fold meter (PreviewMeasure) measures the chart panel's share above the fold.
      id="sv-hero-figure"
      className={clsx('sv-terminal', e.desk)}
      role="group"
      aria-label={real ? 'Trading desk: real prices, with an example order and sample positions' : 'Sample screen of the trading desk'}
      data-desk={real ? 'real' : 'sample'}
    >
      <div className={e.deskBar}>
        <span className={e.search} aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          Search NSE, BSE and MCX
        </span>
        {real ? null : <SampleTag>Sample screen</SampleTag>}
      </div>

      <div className={e.deskGrid}>
        <div className={e.panel} data-plate="">
          {real ? <RealChart desk={real} /> : <SampleChart />}
        </div>

        <div className={e.panel}>
          <div className={e.panelHead}>
            <h3 className={e.panelTitle}>Watchlist</h3>
            {real ? <span className={e.panelMeta}>{real.watch.length} symbols</span> : <SampleTag>Sample</SampleTag>}
          </div>
          <ul className={e.rows}>
            {real
              ? real.watch.map((q) => (
                  <li key={q.symbol} className={e.row}>
                    <span className={e.rowName} title={q.name}>
                      {q.symbol}
                      {q.label !== real.watchStamp.label ? (
                        <>
                          {' '}
                          <LabelPill label={q.label} />
                        </>
                      ) : null}
                    </span>
                    <span>{fmt2(q.ltp)}</span>
                    <span className={tone(q.changePct)}>{fmtPct(q.changePct)}</span>
                  </li>
                ))
              : SAMPLE_WATCH.map((q) => (
                  <li key={q.symbol} className={e.row}>
                    <span className={e.rowName}>{q.symbol}</span>
                    <span>{fmt2(q.ltp)}</span>
                    <span className={tone(q.changePct)}>{fmtPct(q.changePct)}</span>
                  </li>
                ))}
          </ul>
          {real ? (
            <Stamp
              label={real.watchStamp.label}
              asOf={real.watchStamp.asOf}
              attribution={real.attribution}
              delay={delayFor(real.right, real.delayMinutes)}
              className={e.stamp}
            />
          ) : null}
        </div>
      </div>

      <div className={e.lower}>
        <div className={clsx(e.panel, e.ticket)}>
          <div className={e.panelHead}>
            <h3 className={e.panelTitle}>
              Order ticket <span className={e.panelMeta}>{ticket.exchange}</span>
            </h3>
            <SampleTag>{real ? 'Example order' : 'Sample'}</SampleTag>
          </div>
          <div className={e.side} aria-hidden="true">
            <span className={e.buy}>BUY</span>
            <span>SELL</span>
          </div>
          <dl className={e.fields}>
            <div>
              <dt>Symbol</dt>
              <dd className={e.mono} title={`${ticket.symbol} · ${ticket.exchange}`}>
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
              <dd className={clsx(e.mono, e.focus)}>{rupees(ticket.price)}</dd>
            </div>
          </dl>
          <dl className={e.sums}>
            <div>
              <dt>Order value</dt>
              <dd>{rupees(value)}</dd>
            </div>
          </dl>
          <span className={e.place} aria-hidden="true">
            Place buy order
          </span>
          <p className={e.note}>
            {real
              ? 'An example, not a real order: its price is set a little under the last price above.'
              : 'Sample figures. In the app, orders fill against real prices.'}
          </p>
        </div>

        <div className={e.panel}>
          <div className={e.panelHead}>
            <h3 className={e.panelTitle}>Positions</h3>
            <SampleTag>Sample</SampleTag>
          </div>
          <ul className={e.rows}>
            {SAMPLE_POSITIONS.map((p) => (
              <li key={p.symbol} className={e.row}>
                <span className={e.rowName}>
                  {p.symbol} <span className={e.flat}>{p.qty}</span>
                </span>
                <span aria-hidden="true" />
                <span className={tone(p.pnl)}>{signedRupees(p.pnl)}</span>
              </li>
            ))}
          </ul>
          <div className={e.total}>
            <span>Day P&amp;L (sample)</span>
            <span className={tone(1)}>{signedRupees(SAMPLE_POSITIONS.reduce((a, p) => a + p.pnl, 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The decorative "order placed" toast beside the desk (from 1024 px; part of the example). */
export function DeskFloat({ real }: { real: RealDesk | null }) {
  const t = real ? real.ticket : SAMPLE_TICKET;
  return (
    <div className={e.float} aria-hidden="true">
      <span className={e.floatTick}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span>
        <b>{real ? 'Example order placed' : 'Sample order placed'}</b>
        <span>
          BUY {t.qty} {t.symbol} · LMT {fmt2(t.price)}
        </span>
      </span>
    </div>
  );
}

function RealChart({ desk }: { desk: RealDesk }) {
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

function SampleChart() {
  const candles = sampleCandles();
  const lineY = sampleY(SAMPLE_TICKET.price);
  return (
    <>
      <div className={e.panelHead}>
        <h3 className={e.panelTitle}>
          HDFCBANK <span className={e.panelMeta}>NSE · 15m</span>
        </h3>
        <SampleTag>Sample</SampleTag>
      </div>
      <p className={e.quote}>
        {fmt2(1600)} <small className={tone(1)}>{fmtPct(1)}</small>
      </p>
      <svg className={e.chart} viewBox={`0 0 ${CHART.w} ${CHART.h}`} aria-hidden="true">
        {SAMPLE_SCALE.ticks.map((t) => (
          <g key={t}>
            <path d={`M0 ${sampleY(t)}H${CHART.right}`} stroke="var(--sv-term-line)" strokeWidth="1" />
            <text x={CHART.right + 6} y={sampleY(t) + 3.5} fontSize="10" fill="var(--sv-fg-3)">
              {fmt2(t).replace(/\.00$/, '')}
            </text>
          </g>
        ))}
        {candles.map((c) => (
          <g key={c.x} stroke={c.up ? 'var(--sv-up)' : 'var(--sv-down)'} fill={c.up ? 'var(--sv-up)' : 'var(--sv-down)'}>
            <path d={`M${c.x.toFixed(1)} ${c.h.toFixed(1)}V${c.l.toFixed(1)}`} strokeWidth="1.4" />
            <rect x={(c.x - 4.5).toFixed(1)} y={Math.min(c.o, c.c).toFixed(1)} width="9" height={Math.max(1.5, Math.abs(c.o - c.c)).toFixed(1)} stroke="none" />
          </g>
        ))}
        <path d={`M0 ${lineY}H${CHART.right}`} stroke="var(--sv-neon)" strokeWidth="1.2" strokeDasharray="5 4" />
        <text x={CHART.right - 4} y={lineY - 5} fontSize="10" textAnchor="end" fill="var(--sv-neon)">
          BUY LMT · {SAMPLE_TICKET.qty}
        </text>
        <g fontSize="10" fill="var(--sv-fg-3)">
          <text x="4" y={CHART.h - 8}>
            9:15
          </text>
          <text x={CHART.right / 2} y={CHART.h - 8} textAnchor="middle">
            12:00
          </text>
          <text x={CHART.right} y={CHART.h - 8} textAnchor="end">
            15:00
          </text>
        </g>
      </svg>
    </>
  );
}

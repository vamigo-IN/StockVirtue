import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { contractMonth, RowStamp } from '@/components/market/parts';
import { delayFor, isVolatilityIndex } from '@/components/market/gate';
import { Stamp } from '@/components/market/Stamp';
import { FactText } from '@/components/site-content/FactText';
import { Change } from '@/components/widgets/frame';
import { fmtDate, fmtPrice, stampOf } from '@/components/widgets/format';
import { withFacts } from '@/content/app';
import type { HomeContent, HomeTradeCard } from '@/content/site/types';
import type { MarketQuote, MiniOptionChain, OptionChainData, Snapshot } from '@/market/types';
import { SectionHead } from './parts';
import e from './et.module.css';

const TRADE_TITLE_ID = 'home-trade-title';
const FEATURES_TITLE_ID = 'home-features-title';

/* Interface strings built from the facts (code, not content). */
const ORDER_TYPES = withFacts(['F2'], ['Market', 'Limit', 'Stop-loss', 'Stop-loss limit', 'Trailing stop'], null);
const PRODUCTS = withFacts(['F3'], 'Intraday · Delivery', null);
const DERIVATIVES = withFacts(['F4'], ['Index futures', 'Stock futures', 'Index options', 'Stock options'], null);
const COMMODITIES = withFacts(['F8'], ['Gold', 'Silver', 'Crude oil', 'Natural gas', 'Copper', 'Zinc'], null);
const BY_UNIT = withFacts(['F7'], 'By the unit · No margin', null);
const CHAIN_IN_APP = withFacts(['F4'], 'The app has the option chain for every expiry.', null);

/** Rows in each card's live list. */
const STOCKS = 3;
const MCX_ROWS = 6;
/** The F&O card's indices when there is no option chain. */
const FNO_INDICES = ['NSE:NIFTY', 'NSE:BANKNIFTY', 'NSE:FINNIFTY'];

const f2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const strikeFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

/** What the cards draw with prices: the snapshot (gate on, not OFF) and the chain. */
type TradeData = { snapshot: Snapshot; chain: OptionChainData | null };

function Chips({ items, label }: { items: string[] | null; label: string }) {
  return items ? (
    <ul className={e.chips} aria-label={label}>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  ) : null;
}

/** The snapshot's Stamp for a set of its rows. */
function SnapStamp({ rows, snapshot }: { rows: MarketQuote[]; snapshot: Snapshot }) {
  const s = stampOf(rows);
  return (
    <Stamp
      label={s.label}
      asOf={s.asOf}
      attribution={snapshot.attribution}
      delay={delayFor(snapshot.right, snapshot.delayMinutes)}
      className={e.miniStamp}
    />
  );
}

/**
 * A compact price table (name, last price, % change) on the card's white
 * box, from snapshot rows. A row whose label or time differs from the
 * list's carries its own pill (stampOf), so no price borrows another's stamp.
 */
function MiniTable({
  rows,
  caption,
  head,
  second,
}: {
  rows: MarketQuote[];
  caption: string;
  head: string;
  second?: (q: MarketQuote) => string | null;
}) {
  const stamp = stampOf(rows);
  return (
    <table className={e.mini}>
      <caption className="sr-only">{caption}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{head}</th>
          <th scope="col">Last</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((q) => {
          const sub = second?.(q);
          return (
            <tr key={q.ref}>
              <th scope="row">
                {q.name}
                {sub ? <span className={e.miniSub}>{sub}</span> : null}
                {stamp.own(q) ? <RowStamp label={q.label} asOf={q.asOf} /> : null}
              </th>
              <td>{fmtPrice(q.ltp, q.kind)}</td>
              <td>
                <Change change={null} pct={q.changePct} showAbs={false} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The real NIFTY chain: five strikes around the money, the spot between them. */
function Chain({ chain, data }: { chain: MiniOptionChain; data: OptionChainData }) {
  const rows: ReactNode[] = [];
  const spotRow = (
    <tr key="spot" className={e.spot}>
      <td colSpan={3}>
        {chain.underlying} {f2.format(chain.spot)}
      </td>
    </tr>
  );
  let placed = false;
  chain.strikes.forEach((r) => {
    if (!placed && r.strike > chain.spot) {
      rows.push(spotRow);
      placed = true;
    }
    rows.push(
      <tr key={r.strike}>
        <td className={r.strike < chain.spot ? e.itm : undefined}>{r.call === null ? '—' : f2.format(r.call)}</td>
        <td className={e.strike}>{strikeFmt.format(r.strike)}</td>
        <td className={r.strike > chain.spot ? e.itm : undefined}>{r.put === null ? '—' : f2.format(r.put)}</td>
      </tr>,
    );
  });
  if (!placed) rows.push(spotRow);
  return (
    <div className={e.chainBox}>
      <div className={e.chainHead}>
        <span>{chain.underlying} options</span>
        <span className={e.chainExpiry}>Expiry {fmtDate(chain.expiry)}</span>
      </div>
      <table className={e.chain}>
        <caption className="sr-only">
          {`${chain.name} options expiring ${fmtDate(chain.expiry)}: last prices of calls and puts at the strikes around the index level`}
        </caption>
        <thead>
          <tr>
            <th scope="col">CALL LTP</th>
            <th scope="col" className={e.strike}>
              STRIKE
            </th>
            <th scope="col">PUT LTP</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
      <div className={e.chainNote}>
        <p>Shaded prices are in the money.</p>
        <Stamp label={data.label} asOf={data.asOf} attribution={data.attribution} className={e.miniStamp} />
      </div>
    </div>
  );
}

/** Each trade card's fixed panel and foot line, by its fixed id. */
function TradePanel({ id, data }: { id: string; data: TradeData | null }) {
  const snap = data?.snapshot ?? null;
  switch (id) {
    case 'equity': {
      const stocks = snap ? snap.instruments.filter((q) => q.kind === 'STOCK' && q.ltp > 0).slice(0, STOCKS) : [];
      return (
        <>
          {snap && stocks.length ? (
            <div className={e.miniBox}>
              <MiniTable rows={stocks} caption="Large-cap shares on NSE: last price and change" head="Share" />
              <SnapStamp rows={stocks} snapshot={snap} />
            </div>
          ) : null}
          <Chips items={ORDER_TYPES} label="Order types" />
          {PRODUCTS ? (
            <div className={e.cardFoot}>
              <span>NSE · BSE</span>
              <span>{PRODUCTS}</span>
            </div>
          ) : null}
        </>
      );
    }
    case 'derivatives': {
      const chain = data?.chain?.data ?? null;
      const indices = snap
        ? FNO_INDICES.map((ref) => snap.instruments.find((q) => q.ref === ref)).filter(
            (q): q is MarketQuote => !!q && q.ltp > 0 && !isVolatilityIndex(q.ref),
          )
        : [];
      return (
        <>
          {data?.chain && chain ? (
            <Chain chain={chain} data={data.chain} />
          ) : snap && indices.length ? (
            <div className={e.miniBox}>
              <MiniTable rows={indices} caption="The indices behind index futures and options" head="Index" />
              {CHAIN_IN_APP ? <p className={e.miniNote}>{CHAIN_IN_APP}</p> : null}
              <SnapStamp rows={indices} snapshot={snap} />
            </div>
          ) : (
            <Chips items={DERIVATIVES} label="Futures and options" />
          )}
          <div className={e.cardFoot}>
            <span>NSE F&amp;O</span>
            <span>Calls · Puts · Futures</span>
          </div>
        </>
      );
    }
    case 'commodities': {
      const mcx = snap ? snap.instruments.filter((q) => q.kind === 'COMMODITY' && q.ltp > 0).slice(0, MCX_ROWS) : [];
      return (
        <>
          {snap && mcx.length ? (
            <div className={e.miniBox}>
              <MiniTable
                rows={mcx}
                caption="MCX futures, nearest expiry: last price per the unit shown, and change"
                head="Commodity"
                second={(q) => {
                  const month = contractMonth(q.contract);
                  return [q.unit, month ? `${month} future` : null].filter(Boolean).join(' · ') || null;
                }}
              />
              <SnapStamp rows={mcx} snapshot={snap} />
            </div>
          ) : (
            <Chips items={COMMODITIES} label="Some of the MCX commodities" />
          )}
          <div className={e.cardFoot}>
            <span>MCX</span>
            {BY_UNIT ? <span>{BY_UNIT}</span> : null}
          </div>
        </>
      );
    }
    default:
      return null;
  }
}

function TradeCard({ card, n, data }: { card: HomeTradeCard; n: number; data: TradeData | null }) {
  return (
    <li className={e.tradeCard}>
      <div className={e.cardTop}>
        <Icon id={card.id} />
        <span className={e.index}>{String(n).padStart(2, '0')}</span>
      </div>
      <div>
        <h3 className={e.h3}>{card.title}</h3>
        <FactText as="p" field={card.body} className={e.body} />
      </div>
      <TradePanel id={card.id} data={data} />
    </li>
  );
}

const ICONS: Record<string, ReactNode> = {
  equity: <path d="M7 3v4M7 17v4M17 3v3M17 15v6M4.5 7h5v10h-5zM14.5 6h5v9h-5z" />,
  derivatives: <path d="M3 7h7l3 5h8M3 17h7l3-5M18 9l3 3-3 3" />,
  commodities: <path d="M3 19h18l-2.5-6h-13zM7.5 13 9.5 8h5l2 5M12 4v1.5" />,
  'live-data': <path d="M3 17l5-5 4 4 8-8M15 8h5v5" />,
  'order-types': <path d="M4 6h16M4 12h10M4 18h6M17 15l3 3-3 3" />,
  charges: <path d="M7 4h10v16l-2.5-1.5L12 20l-2.5-1.5L7 20zM9.5 9h5M9.5 13h5" />,
  'fno-mcx': <path d="M4 18 9 9l4 6 3-4 4 7zM15 5h5v5" />,
  academy: <path d="M3 9l9-5 9 5-9 5zM7 11.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5" />,
  rooms: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />,
};
function Icon({ id }: { id: string }) {
  return (
    <span className={e.icon} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[id] ?? <circle cx="12" cy="12" r="7" />}
      </svg>
    </span>
  );
}

/**
 * "What you can trade" (Emerald Terminal): equity, F&O and MCX in three
 * cards on white. With prices on (the gate on and a snapshot whose licence
 * isn't OFF), each card shows real prices with its Stamp: three large-cap
 * shares; the NIFTY option chain at the nearest expiry (LIVE licence; else
 * the F&O indices); the MCX commodities with their units. With prices off,
 * the cards show words only (order types, contracts, commodities): never a
 * made-up figure. Server component.
 */
export function TradeCards({
  content,
  snapshot,
  chain,
}: {
  content: HomeContent['trade'];
  /** The snapshot with the gate on and the licence not OFF; null otherwise. */
  snapshot: Snapshot | null;
  /** getOptionChain('NIFTY') under LIVE with the gate on; null otherwise. */
  chain: OptionChainData | null;
}) {
  const data: TradeData | null = snapshot ? { snapshot, chain } : null;
  return (
    <section className={clsx(e.section, e.white)} aria-labelledby={TRADE_TITLE_ID}>
      <div className="sv-container">
        <SectionHead
          id={TRADE_TITLE_ID}
          label={content.label}
          title={content.title}
          lead={<FactText field={content.lead} />}
        />
        <ul className={e.cards3}>
          {content.cards.map((c, i) => (
            <TradeCard key={c.id} card={c} n={i + 1} data={data} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The grid of six features (Emerald Terminal), each with its icon. Server component. */
export function FeatureGrid({ content }: { content: HomeContent['features'] }) {
  return (
    <section className={clsx(e.section, e.mint)} aria-labelledby={FEATURES_TITLE_ID}>
      <div className="sv-container">
        <SectionHead id={FEATURES_TITLE_ID} label={content.label} title={content.title} />
        <ul className={e.features}>
          {content.items.map((f) => (
            <li key={f.id} className={e.feature}>
              <Icon id={f.id} />
              <h3 className={e.h3}>{f.title}</h3>
              <FactText as="p" field={f.body} className={e.body} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

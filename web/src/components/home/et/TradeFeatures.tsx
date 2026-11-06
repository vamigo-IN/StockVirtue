import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { FactText } from '@/components/site-content/FactText';
import { withFacts } from '@/content/app';
import type { HomeContent, HomeTradeCard } from '@/content/site/types';
import { SampleTag, SectionHead } from './parts';
import e from './et.module.css';

const TRADE_TITLE_ID = 'home-trade-title';
const FEATURES_TITLE_ID = 'home-features-title';

/* Interface strings built from the facts (code, not content). */
const ORDER_TYPES = withFacts(['F2'], ['Market', 'Limit', 'Stop-loss', 'Stop-loss limit', 'Trailing stop'], null);
const PRODUCTS = withFacts(['F3'], 'Intraday · Delivery', null);
const COMMODITIES = withFacts(['F8'], ['Gold', 'Silver', 'Crude oil', 'Natural gas', 'Copper', 'Zinc'], null);
const BY_UNIT = withFacts(['F7'], 'By the unit · No margin', null);

/**
 * A labelled sample option chain (never real prices): a made-up underlying
 * on round strikes, so it can't be read as today's chain. Calls in the
 * money are shaded below the spot, puts above it.
 */
const CHAIN = [
  { strike: 980, call: 31.5, put: 4.2 },
  { strike: 990, call: 23.0, put: 6.1 },
  { strike: 1000, call: 15.8, put: 9.4 },
  { strike: 1010, call: 10.1, put: 14.2 },
  { strike: 1020, call: 6.0, put: 20.6 },
];
const SPOT = 1004.5;
const f2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function SampleChain() {
  const rows: ReactNode[] = [];
  CHAIN.forEach((r, i) => {
    if (i > 0 && CHAIN[i - 1].strike < SPOT && r.strike > SPOT) {
      rows.push(
        <tr key="spot" className={e.spot}>
          <td colSpan={3}>SPOT {f2.format(SPOT)} (SAMPLE)</td>
        </tr>,
      );
    }
    rows.push(
      <tr key={r.strike}>
        <td className={r.strike < SPOT ? e.itm : undefined}>{f2.format(r.call)}</td>
        <td className={e.strike}>{r.strike.toLocaleString('en-IN')}</td>
        <td className={r.strike > SPOT ? e.itm : undefined}>{f2.format(r.put)}</td>
      </tr>,
    );
  });
  return (
    <div className={e.chainBox}>
      <div className={e.chainHead}>
        <span>SAMPLE · Weekly</span>
        <SampleTag>Sample option chain</SampleTag>
      </div>
      <table className={e.chain}>
        <caption className="sr-only">A sample option chain with made-up prices</caption>
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
      <p className={e.chainNote}>Shaded prices are in the money. Sample figures, not a real chain.</p>
    </div>
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

/** Each trade card's fixed panel and foot line, by its fixed id. */
function TradePanel({ id }: { id: string }) {
  switch (id) {
    case 'equity':
      return (
        <>
          {ORDER_TYPES ? (
            <ul className={e.chips} aria-label="Order types">
              {ORDER_TYPES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
          {PRODUCTS ? (
            <div className={e.cardFoot}>
              <span>NSE · BSE</span>
              <span>{PRODUCTS}</span>
            </div>
          ) : null}
        </>
      );
    case 'derivatives':
      return (
        <>
          <SampleChain />
          <div className={e.cardFoot}>
            <span>Calls · Puts · Futures</span>
          </div>
        </>
      );
    case 'commodities':
      return (
        <>
          {COMMODITIES ? (
            <ul className={e.chips} aria-label="Some of the MCX commodities">
              {COMMODITIES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : null}
          <div className={e.cardFoot}>
            <span>MCX</span>
            {BY_UNIT ? <span>{BY_UNIT}</span> : null}
          </div>
        </>
      );
    default:
      return null;
  }
}

function TradeCard({ card, n }: { card: HomeTradeCard; n: number }) {
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
      <TradePanel id={card.id} />
    </li>
  );
}

/**
 * "What you can trade" (Emerald Terminal): equity, F&O and MCX in three
 * cards on white. No prices: the F&O card's option chain is a labelled
 * sample on a made-up underlying. Server component.
 */
export function TradeCards({ content }: { content: HomeContent['trade'] }) {
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
            <TradeCard key={c.id} card={c} n={i + 1} />
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

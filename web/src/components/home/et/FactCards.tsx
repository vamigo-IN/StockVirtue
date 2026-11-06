import { LabelPill } from '@/components/widgets/frame';
import { factValue } from '@/components/site-content/FactText';
import { ACADEMY_MODULES, withFacts } from '@/content/app';
import type { HomeContent, HomeFactCard } from '@/content/site/types';
import { Shield } from './parts';
import e from './et.module.css';

/** The module bar's lesson counts (F9), from the Academy's module list. */
const LESSONS = ACADEMY_MODULES.map((m) => Number.parseInt(m.value, 10) || 1);

/** Each card's small extra, by its fixed id (code, not content). */
function Extra({ id }: { id: string }) {
  switch (id) {
    case 'money': {
      /* F1: the starting balance. */
      const balance = withFacts(['F1'], '₹10,00,000.00', null);
      return balance ? (
        <div className={e.factLine}>
          <span className={e.muted}>BALANCE</span>
          <span>{balance}</span>
        </div>
      ) : null;
    }
    case 'stamped':
      return (
        <div className={e.factLine}>
          <LabelPill label="LIVE" />
          <LabelPill label="DELAYED" />
          <LabelPill label="EOD" />
        </div>
      );
    case 'lessons':
      return LESSONS.length ? (
        <div>
          <div className={e.modBar} aria-hidden="true">
            {LESSONS.map((n, i) => (
              <span key={i} style={{ flex: n }} />
            ))}
          </div>
          <div className={e.factLine} style={{ borderTop: 0, paddingTop: 8 }}>
            <span className={e.muted}>TRADING ACADEMY</span>
            <span className={e.muted}>{LESSONS.join('·')}</span>
          </div>
        </div>
      ) : null;
    case 'no-risk': {
      /* F17, word for word. */
      const line = withFacts(['F17'], 'No PAN, Aadhaar or bank details', null);
      return line ? (
        <div className={e.factShield}>
          <Shield size={16} />
          {line}
        </div>
      ) : null;
    }
    default:
      return null;
  }
}

function Card({ card }: { card: HomeFactCard }) {
  const figure = factValue(card.figure);
  const body = factValue(card.body);
  if (!figure) return null;
  return (
    <li className={e.fact}>
      <b className={e.factFigure}>{figure}</b>
      <span className={e.factTitle}>{card.title}</span>
      {body ? <span className={e.factBody}>{body}</span> : null}
      <div className={e.factExtra}>
        <Extra id={card.id} />
      </div>
    </li>
  );
}

/**
 * The four fact cards over the hero's bottom edge (Emerald Terminal). Two
 * columns on phones and tablets (without the extras below 640 px), four
 * from 1024. A card whose figure's facts aren't confirmed drops out.
 * Server component.
 */
export function FactCards({ content }: { content: HomeContent['facts'] }) {
  return (
    <div className={e.factsWrap}>
      <div className="sv-container">
        <ul className={e.facts} aria-label="StockVirtue in four facts">
          {content.cards.map((c) => (
            <Card key={c.id} card={c} />
          ))}
        </ul>
      </div>
    </div>
  );
}

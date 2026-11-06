import { MarketStatus } from '@/components/market/MarketStatus';
import { Container } from '@/components/public/Container';
import { clockTime, dayHeading } from '@/news/format';
import type { HomeSection } from '@/news/types';
import s from './front.module.css';

/**
 * The /news nameplate (spec §5.9.1, §9.6; B25): the page's visible H1
 * "StockVirtue News" and the dateline, on a white band with a 1 px rule
 * below. SERVER component.
 *
 * The dateline is built from the newest `publishedAt` in the front's
 * response, never from the clock, so a cached page never claims a day it
 * doesn't show: "Wednesday 4 November 2026 · Updated 9:12 am IST" from
 * 768 px (under the name), "4 Nov, 9:12 am IST" on phones (beside it).
 * With no stories it shows the name only. From 1024 px the MarketStatus
 * line sits on the right (it asks for the ticker only at that width).
 */

/** The H1 (spec §9.6). */
const NAME = 'StockVirtue News';

/** "4 Nov", in India time: the phone dateline's day (no year, spec §9.6). */
const SHORT_DAY = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
});

/** The newest valid `publishedAt` among every story in the response, or null. */
export function newestPublishedAt(sections: readonly HomeSection[]): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const section of sections) {
    for (const card of section.items) {
      const t = Date.parse(card.publishedAt);
      if (Number.isFinite(t) && t > bestT) {
        bestT = t;
        best = card.publishedAt;
      }
    }
  }
  return best;
}

export function Nameplate({ newest }: { newest: string | null }) {
  const time = newest ? clockTime(newest) : '';
  const long = newest ? dayHeading(newest) : '';
  const short = newest && time ? SHORT_DAY.format(new Date(newest)) : '';
  return (
    <div className={s.nameplate}>
      <Container className={s.plate}>
        <div className={s.plateText}>
          <h1 className={s.title}>{NAME}</h1>
          {newest && time && long ? (
            <p className={`t-meta ${s.dateline}`}>
              <time dateTime={newest}>
                <span className={s.dateLong}>{`${long} · Updated ${time} IST`}</span>
                <span className={s.dateShort}>{`${short}, ${time} IST`}</span>
              </time>
            </p>
          ) : null}
        </div>
        <div className={s.status}>
          <MarketStatus variant="line" media="(min-width: 1024px)" />
        </div>
      </Container>
    </div>
  );
}

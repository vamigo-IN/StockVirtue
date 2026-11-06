import Link from 'next/link';
import { clsx } from 'clsx';
import { COPY, ipoFooter } from '@/components/market/copy';
import { fmtTimes } from '@/components/market/listing-price';
import { StoryCard } from '@/components/news/StoryCard';
import { fmtDate } from '@/components/widgets/format';
import type { HomeContent } from '@/content/site/types';
import type { IpoBoard, IpoIssue } from '@/market/types';
import { dateline } from '@/news/format';
import type { NewsCard } from '@/news/types';
import { ArrowRight, SectionHead } from './parts';
import e from './et.module.css';

const IPO_TITLE_ID = 'home-ipo-title';
const NEWS_TITLE_ID = 'home-news-title';

function IpoCard({ issue, open }: { issue: IpoIssue; open: boolean }) {
  return (
    <li className={e.ipo}>
      <div className={e.ipoTop}>
        {open ? (
          <span className={clsx(e.pill, e.pillOpen)}>Open now</span>
        ) : (
          <span className={clsx(e.pill, e.pillNext)}>Opens {fmtDate(issue.openDate)}</span>
        )}
        <span className={e.seg}>{issue.segment === 'SME' ? 'SME' : 'Mainboard'}</span>
      </div>
      <h3 className={e.ipoName}>{issue.companyName}</h3>
      <dl className={e.dl}>
        {issue.priceRange ? (
          <>
            <dt>Price band</dt>
            <dd>{issue.priceRange}</dd>
          </>
        ) : null}
        <dt>{open ? 'Closes' : 'Closes on'}</dt>
        <dd>{fmtDate(issue.closeDate)}</dd>
        {open && issue.subscription !== null ? (
          <>
            <dt>Subscribed</dt>
            <dd>{fmtTimes(issue.subscription)}</dd>
          </>
        ) : null}
      </dl>
    </li>
  );
}

/**
 * IPO watch (Emerald Terminal): the IPO board's open issues (up to four),
 * then the next to open, as cards. Offer data, not prices, so no Stamp and
 * no gate: the footer is "IPO data: NSE · as of {time}", as in IpoWatch.
 * Hidden when the board is missing, unavailable or empty. Server component.
 */
export function IpoSection({ content, ipos }: { content: HomeContent['ipos']; ipos: IpoBoard | null }) {
  if (!ipos || !ipos.available) return null;
  const open = ipos.open.slice(0, 4);
  const next = ipos.upcoming.slice(0, Math.max(0, 4 - open.length));
  if (!open.length && !next.length) return null;
  return (
    <section className={clsx(e.section, e.mint)} aria-labelledby={IPO_TITLE_ID}>
      <div className="sv-container">
        <SectionHead
          id={IPO_TITLE_ID}
          label={content.label}
          title={content.title}
          lead={content.lead}
          aside={
            <Link href="/news/ipo" prefetch={false} className={e.moreLink}>
              {COPY.ipoCalendar}
              <ArrowRight />
            </Link>
          }
        />
        {/* A market module like IpoWatch's (data-market-module="ipo-watch"): the cards
            and their "IPO data: NSE · as of" line, so the stamp rule (F04) sees the
            module and its price bands ("₹292 – ₹307") read as data, not prose. */}
        <div data-market-module="ipo-watch">
          <ul className={e.ipos}>
            {open.map((i) => (
              <IpoCard key={i.symbol} issue={i} open />
            ))}
            {next.map((i) => (
              <IpoCard key={i.symbol} issue={i} open={false} />
            ))}
          </ul>
          <p className={e.foot}>{ipoFooter(ipos.attribution, dateline(ipos.fetchedAt))}</p>
        </div>
      </div>
    </section>
  );
}

/**
 * From the newsroom (Emerald Terminal): the listing's first story as the
 * lead, the next four as rows (C's StoryCard), and the link to /news. The
 * heading is `market.newsTitle`, or `market.titleGateOff` while the site
 * shows no prices. Without stories (the news API failed) the section keeps
 * only its head and link. Server component.
 */
export function NewsSection({
  content,
  gateOn,
  news,
}: {
  content: HomeContent['market'];
  gateOn: boolean;
  news: NewsCard[] | null;
}) {
  const stories = news ?? [];
  const [lead, ...rest] = stories;
  return (
    <section className={clsx(e.section, e.white)} aria-labelledby={NEWS_TITLE_ID}>
      <div className="sv-container">
        <SectionHead
          id={NEWS_TITLE_ID}
          label={content.newsLabel}
          title={gateOn ? content.newsTitle : content.titleGateOff}
          aside={
            <Link href="/news" className={e.moreLink}>
              {content.newsLink}
              <ArrowRight />
            </Link>
          }
        />
        {lead ? (
          <div className={e.news}>
            <StoryCard card={lead} variant="feature" face="sans" headingLevel="h3" standfirst="always" />
            {rest.length ? (
              <ul className={e.newsList}>
                {rest.slice(0, 4).map((card, i) => (
                  <li key={card.id}>
                    <StoryCard
                      card={card}
                      variant="row"
                      face="sans"
                      headingLevel="h3"
                      className={i === 0 ? 'border-t-0' : undefined}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

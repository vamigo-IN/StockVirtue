import type { ComponentProps } from 'react';
import { MiniChart } from '@/components/market/mini-chart-core';
import { shortSince, fmtDay } from '@/components/market/chart-utils';
import { rangeWords, sinceWords } from '@/components/market/copy';
import { Diagram } from '@/components/diagrams/Diagram';
import { DIAGRAMS } from '@/components/diagrams/catalog';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { FactFile } from '@/components/public/FactFile';
import { PhoneDisclosure } from '@/components/public/PhoneDisclosure';
import { PlayBadge, PlayTrademark } from '@/components/public/PlayBadge';
import { QuietLink } from '@/components/public/Button';
import { WontDo } from '@/components/public/WontDo';
import { factText } from '@/components/site-content/FactText';
import { fmtPrice } from '@/components/widgets/format';
import { FACT_FILE_ROWS } from '@/content/app';
import type { ScreenId } from '@/content/screens';
import { FEATURES_DEFAULT } from '@/content/site/features';
import {
  FEATURES_CHAPTER_IDS,
  type FeaturesChapter,
  type FeaturesChapterId,
  type FeaturesContent,
  type WontDoContent,
} from '@/content/site/types';
import { playStoreUrl } from '@/lib/metadata';
import type { SiteSettings } from '@/lib/settings';
import { resolveLiveValues } from '@/lib/site-content/tokens';
import { cn } from '@/lib/utils';
import type { ChartData } from '@/market/types';
import { BandHead } from '../BandHead';
import { FeatureChapter, chapterIndex } from '../FeatureChapter';
import { lowerFirst, pickScreen, screenCaption } from '../screens';
import { ScreensCarousel } from '../ScreensCarousel';
import s from '../site.module.css';

/** What /features fetches besides its content and the settings. */
export type FeaturesData = {
  /**
   * Nifty 50, 6 months, daily (getChart('NSE:NIFTY', '6M')), or null: the
   * page passes null while the site-prices gate is off (pricesOnSite), and
   * then the chart is left out with nothing in its place (spec §5.2).
   */
  chart: ChartData | null;
  /** The shared "What it won't do" item (getSharedContent('wont-do')). */
  wontDo: WontDoContent;
};

/** Each chapter's screen in SCREENS (spec §9.5.2). */
const CHAPTER_SCREEN: Record<FeaturesChapterId, ScreenId> = {
  prices: 'stock',
  orders: 'order-ticket',
  fno: 'option-chain',
  portfolio: 'portfolio',
  learning: 'room',
  account: 'sign-in',
};

/** Interface strings (addendum §1.2). */
const JUMP_LABEL = 'On this page';
const CAROUSEL_LABEL = 'Screens from the app';
const FAQ_HREF = '/faq';
/** The chart's instrument, as the market modules name it. */
const NIFTY_50 = 'Nifty 50';

/**
 * /features, "What's in the app" (spec §5.2, copy §9.5.2): a pure view of
 * the page's content (W7 addendum §11.3). The real route and the preview
 * both render it. Server component: the only client code it brings is
 * DiagramPlayer (with the diagrams' animations) and, once screens exist,
 * the phone carousel.
 *
 * Emerald Terminal (6 Nov 2026): the emerald BandHead holds the H1, the
 * summary, the numbered jump chips and, from 1024 px, the account's fact
 * file on a white card beside them. The six chapters follow on alternating
 * mint and white grounds, each with its mono number, its items as cards and
 * its extras (the Nifty 50 chart, the diagrams) on white cards. "What it
 * won't do" is a card, and the page closes on an emerald card with the
 * Play badge and the FAQ link.
 */
export function FeaturesView({
  content,
  settings,
  data,
}: {
  content: FeaturesContent;
  settings: SiteSettings;
  data: FeaturesData;
}) {
  const values = resolveLiveValues(settings);
  const playUrl = playStoreUrl(settings);
  // The six chapters always render in the fixed order with their code ids;
  // a chapter missing from the content falls back to its default.
  const chapters = FEATURES_CHAPTER_IDS.map(
    (id) =>
      content.chapters.find((c) => c.id === id) ??
      (FEATURES_DEFAULT.chapters.find((c) => c.id === id) as FeaturesChapter),
  );
  const screens = chapters.map((c, i) => pickScreen(c.screen, CHAPTER_SCREEN[FEATURES_CHAPTER_IDS[i]]));
  const frames = chapters.flatMap((c, i) => {
    const sc = screens[i];
    if (!sc) return [];
    return [
      {
        key: FEATURES_CHAPTER_IDS[i],
        label: lowerFirst(c.screenWhat || sc.alt),
        node: <DeviceFrame screen={sc} size="lg" className={s.carouselFrame} caption={screenCaption(c.screenWhat, sc)} />,
      },
    ];
  });
  const chart = drawable(data.chart) ? data.chart : null;
  // The account's fact file: on the band beside the text from 1024 px, and
  // after the band (a closed "Show …" row on phones) when narrower. Only one
  // of the two copies is ever displayed (display: none hides the other from
  // assistive tech too).
  const factFile = FACT_FILE_ROWS.length ? (
    <PhoneDisclosure variant="tail" summary={content.factFile.phoneSummary}>
      {/* Facts: FACT_FILE_ROWS[].facts (F1, F4+F8, F2, F3, F5, F6, F9, F22). */}
      <div className={cn(s.onLight, s.card, s.factCard)}>
        <FactFile
          caption={content.factFile.caption}
          rows={FACT_FILE_ROWS.map((r) => ({ label: r.label, value: r.value }))}
        />
      </div>
    </PhoneDisclosure>
  ) : null;

  return (
    <>
      <BandHead
        title={content.head.title}
        lead={factText(content.head.summary, values)}
        asideFrom="lg-only"
        aside={factFile ? <div className={s.headFacts}>{factFile}</div> : null}
      >
        <nav aria-label={JUMP_LABEL} className={s.jump}>
          <ul className={s.chips}>
            {chapters.map((c, i) => (
              <li key={FEATURES_CHAPTER_IDS[i]}>
                <a href={`#${FEATURES_CHAPTER_IDS[i]}`} className={s.chip}>
                  <span className={s.chipIndex} aria-hidden="true">
                    {chapterIndex(i)}
                  </span>
                  {c.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </BandHead>

      {factFile ? (
        <div className={s.factBelow}>
          <div className="sv-container">{factFile}</div>
        </div>
      ) : null}

      {frames.length ? <ScreensCarousel label={CAROUSEL_LABEL} frames={frames} /> : null}

      {chapters.map((c, i) => {
        const id = FEATURES_CHAPTER_IDS[i];
        return (
          <FeatureChapter
            key={id}
            id={id}
            index={i}
            chapter={c}
            screen={screens[i]}
            ground={i % 2 === 0 ? 'paper' : 'white'}
            values={values}
          >
            {id === 'prices' && chart ? <NiftyChart chart={chart} /> : null}
            {/* An array, not a fragment: each diagram gets its own card. */}
            {id === 'orders'
              ? [
                  <Diagram key="market-or-limit" entry={DIAGRAMS['market-or-limit']} page="features" />,
                  <Diagram key="stop-loss" entry={DIAGRAMS['stop-loss']} page="features" />,
                ]
              : null}
            {id === 'fno' ? <Diagram entry={DIAGRAMS['margin-blocks']} page="features" /> : null}
          </FeatureChapter>
        );
      })}

      <div className={cn(s.section, s.white)}>
        <div className="sv-container">
          <div className={s.wontDoWrap}>
            {/* M7.5 (W6) adds WontDo's `content` prop (addendum §11.2); until
                then WontDo reads WONT_DO, the same words as the default. */}
            <WontDo headingLevel="h2" {...wontDoContent(data.wontDo)} />
          </div>
        </div>
      </div>

      <div className={s.closeSection}>
        <div className="sv-container">
          <div className={cn('sv-emerald', s.close)}>
            <div className={s.closeBadge}>
              <PlayBadge href={playUrl} size="lg" />
              <PlayTrademark />
            </div>
            <p className={cn('t-body m-0', s.closeLink)}>
              <QuietLink href={FAQ_HREF}>{content.close.faqLinkLabel}</QuietLink>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The `content` prop WontDo gains in M7.5, passed through untyped until the
 * prop exists, so the page already hands over the fetched item and needs no
 * change when it lands.
 */
function wontDoContent(content: WontDoContent): Partial<ComponentProps<typeof WontDo>> {
  return { content } as unknown as Partial<ComponentProps<typeof WontDo>>;
}

/** A chart answer that can be drawn: available, 2+ candles, a label and a time. */
function drawable(c: ChartData | null | undefined): c is ChartData {
  return Boolean(c && c.available && c.data?.candles?.length >= 2 && c.label && c.asOf);
}

/**
 * The one real chart on a site page (spec §5.2; B26): Nifty 50, 6 months,
 * daily, server-rendered with its Stamp, and the chart sentence (spec §9.7)
 * as its caption. No client JS, no stream.
 */
function NiftyChart({ chart }: { chart: ChartData }) {
  const cs = chart.data.candles;
  const first = cs[0];
  const last = cs[cs.length - 1];
  const since = shortSince(cs, '6M', chart.asOf, true);
  const words = since ? `Since ${fmtDay(since)}` : rangeWords('6M', true);
  const span = since ? sinceWords(false, fmtDay(since)) : `over ${rangeWords('6M', true)}`;
  const pct = first.c ? ((last.c - first.c) / first.c) * 100 : 0;
  // "closed at" for a finished session; "was at" while the label is Live.
  const verb = chart.label === 'LIVE' ? 'was at' : 'closed at';
  const sentence = `${NIFTY_50} ${verb} ${fmtPrice(last.c)} on ${fmtDay(last.t)}, ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% ${span}.`;
  return (
    <div className={s.chart}>
      <MiniChart
        candles={cs}
        label={`${NIFTY_50} · ${words} · daily`}
        size="wide"
        range="6M"
        index
        stamp={{ label: chart.label, asOf: chart.asOf, attribution: chart.attribution }}
        caption={sentence}
      />
    </div>
  );
}

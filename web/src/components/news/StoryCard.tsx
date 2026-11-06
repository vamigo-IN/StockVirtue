import 'server-only';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { cardTime, clockTime, dateOnly } from '@/news/format';
import { newsPath } from '@/news/routes';
import type { NewsCard, NewsImage } from '@/news/types';
import { NewsImg, SIZES } from './NewsImg';
import s from './StoryCard.module.css';

/**
 * Story units (spec §4.8). SERVER ONLY: the times come from cardTime(),
 * which reads the server's clock (the year), so a client component never
 * imports this file. A client wrapper (Tabs, a carousel) receives rendered
 * cards as children instead (plan §0.9).
 *
 * Every unit is one `<article class="relative">` (StoryRankItem is the one
 * exception: it renders inside an `<li>` and has no `<article>`), with ONE
 * link, on the headline (`a.headline-link`), stretched over the whole unit
 * by its ::after, so each card is a single tab stop. The focus ring draws
 * on that stretched area. Kickers are ink (R14), times are absolute IST.
 */

export type StoryVariant = 'splash' | 'feature' | 'row' | 'brief' | 'line' | 'notice';
export type StandfirstMode = 'always' | 'tablet-up' | 'never';
export type StoryHeadingLevel = 'h2' | 'h3' | 'h4';

type KickerCard = Pick<NewsCard, 'category' | 'isBreaking'>;

const hasKicker = (card: KickerCard) => Boolean(card.category || card.isBreaking);

/**
 * The "Breaking" chip (spec §4.8): ink fill, white text 12/16 at weight
 * 650, a 6 px --sv-breaking square, radius 4. It never pulses.
 */
export function BreakingChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[4px] bg-ink px-1.5 py-0.5 align-baseline text-[12px] leading-4 font-[650] tracking-normal whitespace-nowrap text-white',
        s.breaking,
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 bg-breaking" />
      Breaking
    </span>
  );
}

/**
 * The kicker: the category name in the `label` style, in ink, sentence
 * case, after the Breaking chip when the story is flagged. Renders nothing
 * for a story with neither. A `<p>`; `inline` (additive) makes it a
 * `<span>` that runs into the headline (the `line` variant).
 */
export function Kicker({
  card,
  className,
  inline = false,
}: {
  card: KickerCard;
  className?: string;
  inline?: boolean;
}) {
  if (!hasKicker(card)) return null;
  if (inline) {
    return (
      <span className={cn(s.kicker, 'mr-2', className)}>
        {card.isBreaking ? <BreakingChip className={card.category ? 'mr-2' : undefined} /> : null}
        {card.category ? card.category.name : null}
      </span>
    );
  }
  return (
    <p className={cn(s.kicker, 'flex flex-wrap items-center gap-x-2 gap-y-1', className)}>
      {card.isBreaking ? <BreakingChip /> : null}
      {card.category ? <span>{card.category.name}</span> : null}
    </p>
  );
}

/**
 * Wraps each word of `query` (two letters or more) found in `text` in a
 * <mark>, case-insensitively. Server-side, for the search results.
 */
function highlighted(text: string, query: string | undefined): ReactNode {
  if (!query) return text;
  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 2),
    ),
  ].sort((a, b) => b.length - a.length);
  if (!terms.length) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'giu'));
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={s.mark}>
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function Headline({
  card,
  level,
  className,
  highlight,
}: {
  card: NewsCard;
  level: StoryHeadingLevel | 'p';
  className?: string;
  highlight?: string;
}) {
  const H = level;
  return (
    <H className={className}>
      <Link href={newsPath.article(card.slug)} className={cn('headline-link', s.link)}>
        {highlighted(card.title, highlight)}
      </Link>
    </H>
  );
}

/**
 * "{author} · {3 Nov, 9:12 am} · {n} min read" (`meta`, --sv-fg-3). Each
 * part keeps its words together, so a narrow column wraps only at a "·".
 */
function Meta({
  card,
  clock,
  className,
}: {
  card: NewsCard;
  clock: boolean;
  className?: string;
}) {
  const parts: ReactNode[] = [];
  if (card.author) {
    parts.push(
      <span key="author" className="whitespace-nowrap">
        {card.author.name}
      </span>,
    );
  }
  if (clock) {
    parts.push(
      <time key="time" dateTime={card.publishedAt} className="whitespace-nowrap">
        {cardTime(card.publishedAt)}
      </time>,
    );
  }
  parts.push(
    <span key="read" className="whitespace-nowrap">
      {card.readingMinutes} min read
    </span>,
  );
  return (
    <p className={cn('t-meta text-fg-3', s.meta, className)}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

function Media({
  image,
  sizes,
  priority,
  className,
}: {
  image: NewsImage;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden bg-surface-2', className)}>
      <NewsImg
        image={image}
        sizes={sizes}
        priority={priority}
        className="size-full object-cover"
      />
    </div>
  );
}

/** The standfirst's text: the card's summary, else its subtitle. */
const standfirstText = (card: NewsCard) => (card.summary || card.subtitle || '').trim();

/** CSS for a standfirst mode: 'tablet-up' hides it below 768 px. */
const shown = (mode: StandfirstMode) => (mode === 'tablet-up' ? 'max-md:hidden' : undefined);

export type StoryCardProps = {
  card: NewsCard;
  variant: StoryVariant;
  /** Loads the image eagerly at high priority (the first splash). */
  priority?: boolean;
  /** Default h3 (spec §4.8). Listings with no section head between the H1
   * and the cards pass h2; h4 (additive) for cards under an h3 heading. */
  headingLevel?: StoryHeadingLevel;
  /**
   * The summary under the headline: splash, feature, brief, line and the
   * large row. Defaults: 'always' (splash, feature, brief) and
   * 'tablet-up' (line, large row: phones never show it).
   */
  standfirst?: StandfirstMode;
  /** 'sans': Archivo 600 17/22 headlines (the home page's `line` rows). */
  face?: 'serif' | 'sans';
  /** line only: true under a DayGroups heading for the same IST date, so
   * the time column shows "9:12 am" (64 px) instead of "3 Nov, 9:12 am". */
  dayHeading?: boolean;
  /** splash only: 'horizontal' puts the image left and the text right
   * from 768 px (spec §4.8; see StoryCard.module.css for the columns). */
  orientation?: 'stacked' | 'horizontal';
  /** row only: 'lg' is the large row, a 160 px 3:2 thumbnail on the left
   * from 768 px with a head-2 headline and a 2-line standfirst. */
  size?: 'md' | 'lg';
  /** Additive. false: no clock time, only "{author} · {n} min read" (Learn
   * cards, spec §9.6); a `line` shows "{n} min read" in its time column. */
  clock?: boolean;
  /** Additive. The search query: its words are wrapped in <mark> in the
   * headline and summary (spec §5.11). */
  highlight?: string;
  className?: string;
};

/**
 * One story, in one of six variants (spec §4.8):
 * - `splash`: the lead. Image (3:2 from 768; full-bleed 16:9 on phones),
 *   kicker, `head-splash` headline, standfirst, meta. `horizontal` from
 *   768 px when a section has one item.
 * - `feature`: 3:2 image, kicker, `head-2`, a 2-line standfirst, meta.
 * - `row`: kicker, `head-3`, meta, with a 96 px square thumbnail on the
 *   right (80 below 768). `size="lg"`: see the prop.
 * - `brief`: kicker, `head-3`, a one-line summary, meta. No image.
 * - `line`: a time column, then the kicker running into the headline, a
 *   2-line summary from 768 and a 96 px thumbnail from 1024. Phones stack
 *   the time above the headline.
 * - `notice`: kicker, `head-3`, the date ("3 Nov 2026").
 * Rows, briefs, lines and notices draw a 1 px top hairline with 16 px above
 * and below; a list that wants none on its first unit passes
 * `className="border-t-0"` (or `first:border-t-0`) to it.
 * Splash and feature with no image get the typographic treatment: a 2 px
 * ink top rule, a headline one step larger and a 2-line standfirst.
 */
export function StoryCard({
  card,
  variant,
  priority = false,
  headingLevel = 'h3',
  standfirst,
  face = 'serif',
  dayHeading = false,
  orientation = 'stacked',
  size = 'md',
  clock = true,
  highlight,
  className,
}: StoryCardProps) {
  const H = headingLevel;
  const kicker = hasKicker(card);
  const summary = standfirstText(card);
  const headFace =
    face === 'sans'
      ? 'font-sans text-[17px] leading-[22px] font-semibold tracking-normal [font-stretch:100%]'
      : 't-head-3';

  switch (variant) {
    case 'splash': {
      const mode = standfirst ?? 'always';
      const img = card.image;
      const horizontal = orientation === 'horizontal' && Boolean(img);
      const media = img ? (
        <Media
          image={img}
          sizes={SIZES.splash}
          priority={priority}
          className={cn('aspect-video md:aspect-[3/2]', s.media)}
        />
      ) : null;
      const text = (
        <>
          <Kicker card={card} className={img ? (horizontal ? 'mt-4 md:mt-0' : 'mt-4') : undefined} />
          <Headline
            card={card}
            level={H}
            highlight={highlight}
            className={cn(
              img ? 't-head-splash' : 't-head-1',
              img ? s.hlLead : s.hlBig,
              'text-fg',
              kicker ? 'mt-2' : img ? (horizontal ? 'mt-4 md:mt-0' : 'mt-4') : undefined,
            )}
          />
          {summary && mode !== 'never' ? (
            <p
              className={cn(
                't-standfirst mt-3 max-w-[36em] text-fg-2',
                s.standfirst,
                !img && 'line-clamp-2',
                shown(mode),
              )}
            >
              {highlighted(summary, highlight)}
            </p>
          ) : null}
          <Meta card={card} clock={clock} className="mt-3" />
        </>
      );
      if (horizontal) {
        return (
          <article
            className={cn('relative', s.splashH, className)}
            data-variant="splash"
            data-orientation="horizontal"
          >
            <div className={s.splashMedia}>{media}</div>
            <div className={cn('min-w-0', s.splashBody)}>{text}</div>
          </article>
        );
      }
      return (
        <article
          className={cn('relative', !img && 'border-t-2 border-fg pt-3', className)}
          data-variant="splash"
        >
          {media}
          {text}
        </article>
      );
    }

    case 'feature': {
      const mode = standfirst ?? 'always';
      const img = card.image;
      return (
        <article
          className={cn('relative', !img && 'border-t-2 border-fg pt-3', className)}
          data-variant="feature"
        >
          {img ? (
            <Media
              image={img}
              sizes={SIZES.feature}
              priority={priority}
              className={cn('aspect-[3/2]', s.media)}
            />
          ) : null}
          <Kicker card={card} className={img ? 'mt-3' : undefined} />
          <Headline
            card={card}
            level={H}
            highlight={highlight}
            className={cn(
              img ? 't-head-2' : 't-head-splash',
              img ? s.hl : s.hlLead,
              'text-fg',
              kicker ? 'mt-2' : img ? 'mt-3' : undefined,
            )}
          />
          {summary && mode !== 'never' ? (
            <p className={cn('t-standfirst-s mt-2 line-clamp-2 text-fg-2', s.standfirst, shown(mode))}>
              {highlighted(summary, highlight)}
            </p>
          ) : null}
          <Meta card={card} clock={clock} className="mt-2" />
        </article>
      );
    }

    case 'row': {
      const img = card.image;
      if (size === 'lg') {
        const mode = standfirst ?? 'tablet-up';
        return (
          <article
            className={cn('relative flex items-start gap-4 border-t border-rule py-4 md:gap-6', className)}
            data-variant="row"
            data-size="lg"
          >
            {img ? (
              <Media
                image={img}
                sizes={SIZES.rowLarge}
                priority={priority}
                className={cn('order-last size-20 shrink-0 md:order-first md:aspect-[3/2] md:h-auto md:w-40', s.media)}
              />
            ) : null}
            <div className="min-h-20 min-w-0 flex-1 md:min-h-24">
              <Kicker card={card} />
              <Headline
                card={card}
                level={H}
                highlight={highlight}
                className={cn(headFace, face === 'serif' && s.rowLgHead, s.hl, 'text-fg', kicker && 'mt-1 md:mt-2')}
              />
              {summary && mode !== 'never' ? (
                <p
                  className={cn(
                    't-standfirst-s mt-2 line-clamp-2 text-fg-2 max-md:hidden',
                    s.standfirst,
                    shown(mode),
                  )}
                >
                  {highlighted(summary, highlight)}
                </p>
              ) : null}
              <Meta card={card} clock={clock} className="mt-2" />
            </div>
          </article>
        );
      }
      return (
        <article
          className={cn('relative flex items-start gap-4 border-t border-rule py-4', className)}
          data-variant="row"
        >
          <div className="min-h-20 min-w-0 flex-1 md:min-h-24">
            <Kicker card={card} />
            <Headline
              card={card}
              level={H}
              highlight={highlight}
              className={cn(headFace, s.hl, 'text-fg', kicker && 'mt-1')}
            />
            <Meta card={card} clock={clock} className="mt-2" />
          </div>
          {img ? (
            <Media
              image={img}
              sizes={SIZES.row}
              priority={priority}
              className={cn('size-20 shrink-0 md:size-24', s.media)}
            />
          ) : null}
        </article>
      );
    }

    case 'brief': {
      const mode = standfirst ?? 'always';
      return (
        <article
          className={cn('relative border-t border-rule py-4', className)}
          data-variant="brief"
        >
          <Kicker card={card} />
          <Headline
            card={card}
            level={H}
            highlight={highlight}
            className={cn(headFace, s.hl, 'text-fg', kicker && 'mt-1')}
          />
          {summary && mode !== 'never' ? (
            <p className={cn('t-small mt-1 line-clamp-1 text-fg-2', shown(mode))}>
              {highlighted(summary, highlight)}
            </p>
          ) : null}
          <Meta card={card} clock={clock} className="mt-2" />
        </article>
      );
    }

    case 'line': {
      const mode = standfirst ?? 'tablet-up';
      const img = card.image;
      const timeText = !clock
        ? `${card.readingMinutes} min read`
        : dayHeading
          ? clockTime(card.publishedAt)
          : cardTime(card.publishedAt);
      return (
        <article
          className={cn(
            'relative border-t border-rule py-4 md:grid md:items-baseline md:gap-x-4',
            dayHeading ? 'md:grid-cols-[64px_minmax(0,1fr)]' : 'md:grid-cols-[96px_minmax(0,1fr)]',
            img &&
              (dayHeading
                ? 'lg:grid-cols-[64px_minmax(0,1fr)_96px]'
                : 'lg:grid-cols-[96px_minmax(0,1fr)_96px]'),
            className,
          )}
          data-variant="line"
        >
          <p className={cn('t-num-s text-fg-3', s.time)}>
            {clock ? (
              <time dateTime={card.publishedAt}>
                {timeText}
                <span className="sr-only"> IST</span>
              </time>
            ) : (
              timeText
            )}
          </p>
          {/* The wrapper carries the headline's type too, so its line
              boxes (the kicker runs into the headline) keep head-3's
              line height. */}
          <div className={cn('mt-1 min-w-0 md:mt-0', headFace)}>
            <Kicker card={card} inline />
            <Headline
              card={card}
              level={H}
              highlight={highlight}
              className={cn(headFace, s.hl, 'inline text-fg')}
            />
            {summary && mode !== 'never' ? (
              <p className={cn('t-small mt-1 line-clamp-2 text-fg-2', shown(mode))}>
                {highlighted(summary, highlight)}
              </p>
            ) : null}
          </div>
          {img ? (
            <Media
              image={img}
              sizes={SIZES.line}
              priority={priority}
              className={cn('hidden size-24 self-start lg:block', s.media)}
            />
          ) : null}
        </article>
      );
    }

    case 'notice':
      return (
        <article
          className={cn('relative border-t border-rule py-4', className)}
          data-variant="notice"
        >
          <Kicker card={card} />
          <Headline
            card={card}
            level={H}
            highlight={highlight}
            className={cn(headFace, s.hl, 'text-fg', kicker && 'mt-1')}
          />
          <p className={cn('t-meta mt-2 text-fg-3', s.meta)}>
            <time dateTime={card.publishedAt}>{dateOnly(card.publishedAt)}</time>
          </p>
        </article>
      );

    default:
      return null;
  }
}

/**
 * One ranked story (Trending, Most read; spec §4.8): the rank numeral
 * (`numeral`, --sv-fg-3, aria-hidden: the <ol> carries the order), the
 * headline link stretched over the item, and the time. It renders the
 * INSIDE of an `<li>` and contains no `<article>`. `headingLevel`
 * (additive): 'h3' on the news front's Trending band (story headlines are
 * h3 there), null for a plain `<p>` in rails (MostRead).
 */
export function StoryRankItem({
  card,
  rank,
  headingLevel = 'h3',
  className,
}: {
  card: NewsCard;
  rank: number;
  headingLevel?: 'h3' | 'h4' | null;
  className?: string;
}) {
  return (
    <div className={cn('relative flex items-start gap-3', className)}>
      <span aria-hidden="true" className={cn('t-numeral min-w-[1ch] shrink-0 text-fg-3', s.rank)}>
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <Headline card={card} level={headingLevel ?? 'p'} className={cn('t-head-3 text-fg', s.hl)} />
        <p className={cn('t-meta mt-1 text-fg-3', s.meta)}>
          <time dateTime={card.publishedAt}>{cardTime(card.publishedAt)}</time>
        </p>
      </div>
    </div>
  );
}

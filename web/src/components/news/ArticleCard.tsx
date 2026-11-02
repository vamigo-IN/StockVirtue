import Link from 'next/link';
import { cardTime } from '@/news/format';
import { newsPath } from '@/news/routes';
import type { NewsCard } from '@/news/types';
import { cn } from '@/lib/utils';
import { NewsImg } from './NewsImg';

type Variant = 'lead' | 'standard' | 'compact' | 'headline';

/** Category kicker, plus a Breaking label when the story is flagged. */
export function Kicker({
  card,
  className,
}: {
  card: Pick<NewsCard, 'category' | 'isBreaking'>;
  className?: string;
}) {
  if (!card.category && !card.isBreaking) return null;
  return (
    <p
      className={cn(
        'flex items-center gap-2 font-mono text-[11px] font-medium tracking-[0.08em] uppercase',
        className,
      )}
    >
      {card.isBreaking && (
        <span className="inline-flex items-center gap-1 rounded-sm bg-alert/15 px-1.5 py-0.5 text-alert-strong">
          <span className="sv-live-dot size-1.5 rounded-full bg-alert" />
          Breaking
        </span>
      )}
      {card.category && (
        <span className="text-primary">{card.category.name}</span>
      )}
    </p>
  );
}

function Meta({
  card,
  author = true,
  readingTime = true,
}: {
  card: NewsCard;
  author?: boolean;
  readingTime?: boolean;
}) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      {author && card.author && (
        <>
          <span className="font-medium text-foreground/80">
            {card.author.name}
          </span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <time dateTime={card.publishedAt}>{cardTime(card.publishedAt)}</time>
      {readingTime && (
        <>
          <span aria-hidden="true">·</span>
          <span>{card.readingMinutes} min read</span>
        </>
      )}
    </p>
  );
}

/**
 * One story in a list or grid. The headline is the card's only link, and it
 * stretches over the whole card, so the card is one tab stop and one target.
 */
export function ArticleCard({
  card,
  variant = 'standard',
  priority = false,
  className,
}: {
  card: NewsCard;
  variant?: Variant;
  priority?: boolean;
  className?: string;
}) {
  const href = newsPath.article(card.slug);
  const link = (
    <Link
      href={href}
      className="headline-link after:absolute after:inset-0 after:content-['']"
    >
      {card.title}
    </Link>
  );

  if (variant === 'headline') {
    return (
      <article className={cn('relative py-3', className)}>
        <Kicker card={card} className="mb-1" />
        <h3 className="text-base leading-snug font-semibold">{link}</h3>
        <Meta card={card} author={false} />
      </article>
    );
  }

  if (variant === 'compact') {
    return (
      <article className={cn('relative flex gap-4 py-4', className)}>
        <div className="min-w-0 flex-1">
          <Kicker card={card} className="mb-1.5" />
          <h3 className="text-base leading-snug font-semibold sm:text-[17px]">
            {link}
          </h3>
          <Meta card={card} readingTime={false} />
        </div>
        {card.image && (
          <div className="aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:w-32">
            <NewsImg
              image={card.image}
              sizes="128px"
              className="size-full object-cover"
            />
          </div>
        )}
      </article>
    );
  }

  const lead = variant === 'lead';
  return (
    <article className={cn('group relative flex flex-col', className)}>
      {card.image ? (
        <div
          className={cn(
            'mb-4 aspect-[16/9] overflow-hidden bg-muted',
            lead ? 'rounded-xl' : 'rounded-lg',
          )}
        >
          <NewsImg
            image={card.image}
            sizes={
              lead
                ? '(min-width: 1024px) 760px, 100vw'
                : '(min-width: 1024px) 300px, (min-width: 640px) 50vw, 100vw'
            }
            priority={priority}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        </div>
      ) : (
        lead && <div className="mb-4 h-1 w-16 rounded-full bg-primary" />
      )}
      <Kicker card={card} className="mb-2" />
      {lead ? (
        <h2 className="text-2xl leading-tight font-bold text-balance sm:text-3xl lg:text-[2.1rem]">
          {link}
        </h2>
      ) : (
        <h3 className="text-lg leading-snug font-semibold">{link}</h3>
      )}
      {(lead || !card.image) && card.summary && (
        <p
          className={cn(
            'mt-2 text-muted-foreground',
            lead
              ? 'font-serif text-lg leading-relaxed'
              : 'line-clamp-3 text-sm',
          )}
        >
          {card.summary}
        </p>
      )}
      <Meta card={card} />
    </article>
  );
}

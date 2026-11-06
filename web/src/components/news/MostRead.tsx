import { cn } from '@/lib/utils';
import type { NewsCard } from '@/news/types';
import { StoryRankItem } from './StoryCard';
import s from './StoryCard.module.css';

/**
 * Most read (spec §4.9): a rail module. A `<div>` (never a `<section>` or
 * an `<article>`) with the 2 px ink rule of rail module tops, the `h3`
 * title in `rail-title` ("Most read", or "Most read in {category}") and an
 * `<ol>` of StoryRankItem rows with hairlines between. Renders nothing for
 * an empty list. SERVER component.
 * `headingId` (additive) is the h3's id, for the rail's
 * `aside aria-labelledby`.
 */
export function MostRead({
  title = 'Most read',
  items,
  headingId,
  className,
}: {
  title?: string;
  items: NewsCard[];
  headingId?: string;
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={cn(s.railCard, className)}>
      <h3 id={headingId} className={cn('t-rail-title text-fg', s.railHead)}>
        {title}
      </h3>
      <ol className="mt-1">
        {items.map((card, i) => (
          <li key={card.id} className="border-t border-rule py-3 first:border-t-0">
            <StoryRankItem card={card} rank={i + 1} headingLevel={null} />
          </li>
        ))}
      </ol>
    </div>
  );
}

import { cn } from '@/lib/utils';
import { dayHeading } from '@/news/format';
import type { NewsCard } from '@/news/types';
import { StoryCard } from './StoryCard';

/**
 * Stories grouped by their IST publication date (spec §4.9; /news/latest,
 * the author page, the stock page). SERVER component.
 *
 * - Each group opens with its date as a heading, always absolute and never
 *   "Today": "Wednesday 4 November 2026". An h2 by default; h3 when the
 *   groups sit under a section head (the author and stock pages). Set in
 *   `label` at 15/20 with the 2 px ink rule above.
 * - Each story is a StoryCard `line` (its own `<article>`, so `main
 *   article` counts one per story) with `dayHeading`, so its time column
 *   shows "9:12 am" only. Card headlines sit one level below the day
 *   heading.
 * - Groups follow the stories' order (newest first from the API): a run of
 *   stories from the same IST day is one group. Groups are 24 px apart on
 *   phones and 40 px from 768 px (lead decision, 5 Nov 2026).
 */
export function DayGroups({
  items,
  headingLevel = 'h2',
  className,
}: {
  items: NewsCard[];
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  const groups: { day: string; items: NewsCard[] }[] = [];
  for (const card of items) {
    const day = dayHeading(card.publishedAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(card);
    else groups.push({ day, items: [card] });
  }
  const H = headingLevel;
  const cardLevel = headingLevel === 'h2' ? 'h3' : 'h4';
  return (
    <div className={className}>
      {groups.map((g, gi) => (
        <div key={`${g.day}-${gi}`} className={cn(gi > 0 && 'mt-6 md:mt-10')}>
          {g.day ? (
            <H className="t-label border-t-2 border-fg pt-2.5 text-[15px] leading-5 text-fg">
              {g.day}
            </H>
          ) : null}
          <div className={g.day ? 'mt-1' : undefined}>
            {g.items.map((card, i) => (
              <StoryCard
                key={card.id}
                card={card}
                variant="line"
                dayHeading
                headingLevel={cardLevel}
                className={i === 0 ? 'border-t-0' : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

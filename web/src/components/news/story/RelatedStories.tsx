import { StoryCard } from '@/components/news/StoryCard';
import { Container } from '@/components/public/Container';
import { RuleHead } from '@/components/public/Heads';
import { cn } from '@/lib/utils';
import { newsPath } from '@/news/routes';
import type { NewsCard } from '@/news/types';
import l from '../listing/listing.module.css';

/** Grid columns for 1–3 cards (literal classes, so Tailwind sees them). */
const LG_COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3'] as const;

/** A two-column list whose odd last card spans both columns: no hole. */
const TWO_COLS =
  'grid gap-x-6 md:grid-cols-2 md:[&>*:last-child:nth-child(odd)]:col-span-2';

/**
 * After the story grid, across the container (spec §5.12):
 *
 * "Related stories", count-aware so no grid has a hole (the newsroom picks
 * at most six):
 * - 1 story: one row (the large row from 768 px), in the body's width;
 * - from 1024 px: 2 → two features; 3 → three features; 4–6 → three
 *   features, then the rest as briefs, one column each;
 * - below 1024 px: rows, in two columns from 768 px (an odd last row spans
 *   both).
 * The desktop features and the narrower rows are separate lists shown by
 * width (each hidden one is display: none, so it is out of the
 * accessibility tree and its images never load).
 *
 * "More in {category}": rows (at most 4, already without this story and
 * without the related ones), in two columns from 768 px, with the link
 * "More from {category}".
 *
 * Each block is a `<section>` named by its RuleHead's h2; cards are h3s.
 * SERVER component.
 */
export function RelatedStories({
  related,
  more,
  category,
  className,
}: {
  related: NewsCard[];
  more: NewsCard[];
  category: { slug: string; name: string } | null;
  className?: string;
}) {
  if (!related.length && !(category && more.length)) return null;
  return (
    <Container className={className}>
      {related.length ? (
        <section aria-labelledby="section-related" className={l.sheet}>
          <RuleHead id="related" title="Related stories" className="mb-[var(--sv-head-gap)]" />
          {related.length === 1 ? (
            <div className="lg:w-2/3">
              <StoryCard card={related[0]} variant="row" size="lg" className="border-t-0" />
            </div>
          ) : (
            <>
              <div className="max-lg:hidden">
                <div className={cn('grid gap-x-8 gap-y-8', LG_COLS[Math.min(related.length, 3)])}>
                  {related.slice(0, 3).map((c) => (
                    <StoryCard key={c.id} card={c} variant="feature" />
                  ))}
                </div>
                {related.length > 3 ? (
                  <div className={cn('mt-6 grid gap-x-8', LG_COLS[related.length - 3])}>
                    {related.slice(3).map((c) => (
                      <StoryCard key={c.id} card={c} variant="brief" />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={cn('lg:hidden', TWO_COLS)}>
                {related.map((c, i) => (
                  <StoryCard
                    key={c.id}
                    card={c}
                    variant="row"
                    className={i === 0 ? 'border-t-0' : i === 1 ? 'md:border-t-0' : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}

      {category && more.length ? (
        <section
          aria-labelledby="section-more"
          className={cn(l.sheet, related.length ? 'mt-[var(--sv-section-site)]' : undefined)}
        >
          <RuleHead
            id="more"
            title={`More in ${category.name}`}
            href={newsPath.category(category.slug)}
            linkLabel={`More from ${category.name}`}
            className="mb-[var(--sv-head-gap)]"
          />
          <div className={TWO_COLS}>
            {more.map((c, i) => (
              <StoryCard
                key={c.id}
                card={c}
                variant="row"
                className={i === 0 ? 'border-t-0' : i === 1 ? 'md:border-t-0' : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
    </Container>
  );
}

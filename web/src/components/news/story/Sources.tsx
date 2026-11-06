import { cn } from '@/lib/utils';
import type { NewsArticle } from '@/news/types';

/**
 * Who the story credits (spec §4.9; official-e2e): `<section
 * aria-labelledby="sources">` with `<h2 id="sources">Sources</h2>` (16/22,
 * 700) and a list of "{name} · {note}" in `small`, --sv-fg-2.
 * NO links, ever: readers get names, and the page never carries a source's
 * address. Nothing when the story credits no source. SERVER component.
 */
export function Sources({
  sources,
  className,
}: {
  sources: NewsArticle['sources'];
  className?: string;
}) {
  if (!sources.length) return null;
  return (
    <section aria-labelledby="sources" className={className}>
      <h2 id="sources" className="font-sans text-[16px] leading-[22px] font-bold text-fg">
        Sources
      </h2>
      <ul className={cn('t-small mt-2 space-y-1 text-fg-2')}>
        {sources.map((s, i) => (
          <li key={`${i}-${s.name}`}>
            {s.name}
            {s.note ? <> · {s.note}</> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

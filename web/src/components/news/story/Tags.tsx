import Link from 'next/link';
import { cn } from '@/lib/utils';
import { newsPath } from '@/news/routes';
import type { NewsArticle } from '@/news/types';
import s from './story.module.css';

/**
 * The story's tags (spec §4.9): "#{name}" chips, 32 px visible inside a
 * 44 px hit area, radius 4, a 1 px line, ink text, each linking to its tag
 * page. The old end-of-story stock chips are gone (the StocksStrip under
 * the byline holds the one link per stock); the tag chips stay.
 * SERVER component.
 */
export function Tags({
  tags,
  className,
}: {
  tags: NewsArticle['tags'];
  className?: string;
}) {
  if (!tags.length) return null;
  return (
    <ul aria-label="Tags" className={cn('flex flex-wrap gap-x-2', className)}>
      {tags.map((t) => (
        <li key={t.slug}>
          <Link href={newsPath.tag(t.slug)} className={s.tag}>
            <span className={cn('t-small', s.tagChip)}>#{t.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { fullTime, initials, wasUpdated } from '@/news/format';
import { newsPath } from '@/news/routes';
import type { NewsArticle } from '@/news/types';
import s from './story.module.css';
import c from '../StoryCard.module.css';

/**
 * An author's picture (40 px in the byline, 64 in the AuthorBox), or their
 * initials on green-100 in green-900. Decorative: the name is beside it.
 * SERVER component.
 */
export function Avatar({
  name,
  url,
  size,
  className,
}: {
  name: string;
  url: string | null;
  size: number;
  className?: string;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- the newsroom's own small square photo
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={cn('shrink-0 rounded-full object-cover', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        't-label inline-flex shrink-0 items-center justify-center rounded-full',
        s.avatar,
        className,
      )}
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * The byline (spec §4.9, §9.6): the avatar (40 px), then
 * `<p>By <a href="/news/author/…">{name}</a></p>` (16/22, 600; public-e2e
 * finds "By Neha Kapoor"), then the meta line
 * "{4 Nov 2026, 9:12 am IST} · Updated {4 Nov 2026, 10:42 pm IST} · {n} min read",
 * with "Updated" only when the story was edited after it went live
 * (wasUpdated: more than five minutes after it first went out). Absolute
 * times with the year and the zone, so the text never depends on the
 * reader's clock.
 *
 * Correction notes were retired on 6 Nov 2026 (owner): a fixed story shows
 * only its updated time, and nothing reads `correctionNote` (an older API
 * may still send it).
 * SERVER component.
 */
export function Byline({ article: a, className }: { article: NewsArticle; className?: string }) {
  const published = a.firstPublishedAt ?? a.publishedAt;
  const updated = wasUpdated(published, a.updatedAt);
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {a.author ? <Avatar name={a.author.name} url={a.author.avatarUrl} size={40} /> : null}
      <div className="min-w-0">
        {a.author ? (
          <p className="font-sans text-[16px] leading-[22px] font-semibold text-fg">
            By{' '}
            <Link href={newsPath.author(a.author.slug)} className="sv-quiet">
              {a.author.name}
            </Link>
          </p>
        ) : null}
        {/* Each part stays whole: on a phone the line breaks between them,
            never inside a date (at most 32 characters, ~230 px at 12 px mono). */}
        <p className={cn('t-meta mt-0.5 text-fg-2', c.meta)}>
          <time dateTime={published} className="whitespace-nowrap">
            {fullTime(published)}
          </time>
          {updated ? (
            <>
              {' · '}
              <span className="whitespace-nowrap">
                Updated <time dateTime={a.updatedAt}>{fullTime(a.updatedAt)}</time>
              </span>
            </>
          ) : null}
          {' · '}
          <span className="whitespace-nowrap">{a.readingMinutes} min read</span>
        </p>
      </div>
    </div>
  );
}

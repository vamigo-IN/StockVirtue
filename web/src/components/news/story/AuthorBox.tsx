import { Globe } from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { FacebookF, InstagramGlyph, LinkedInBug } from '@/components/public/icons';
import { cn } from '@/lib/utils';
import { newsPath } from '@/news/routes';
import type { AuthorContext } from '@/news/types';
import { Avatar } from './Byline';
import s from './story.module.css';
import c from '../StoryCard.module.css';

type Social = keyof AuthorContext['socials'];

/**
 * Social links in a fixed order, as icon plus text. X and YouTube have no
 * official glyph file yet (lead decision 4): their names stand alone.
 */
const SOCIALS: { key: Social; name: string; Glyph: ComponentType<{ size?: number; className?: string }> | null }[] = [
  { key: 'twitter', name: 'X', Glyph: null },
  { key: 'linkedin', name: 'LinkedIn', Glyph: LinkedInBug },
  { key: 'instagram', name: 'Instagram', Glyph: InstagramGlyph },
  { key: 'youtube', name: 'YouTube', Glyph: null },
  { key: 'facebook', name: 'Facebook', Glyph: FacebookF },
  { key: 'website', name: 'Website', Glyph: Globe },
];

/** Only plain web addresses become links. */
const safeUrl = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : null);

/**
 * About the author (spec §4.9): an `<aside>` on paper, radius 12, padding
 * 24: a 64 px photo (or initials), "About the author" (`label`), the name
 * (`title`, linked to the author page), the bio in Source Serif 17/27, and
 * the author's social links as icon plus text. Shown when the author has
 * a bio or a photo, as before. Never `.sv-prose`. SERVER component.
 */
export function AuthorBox({ author, className }: { author: AuthorContext; className?: string }) {
  const id = `author-${author.slug}`;
  const links = SOCIALS.flatMap((x) => {
    const href = safeUrl(author.socials?.[x.key]);
    return href ? [{ ...x, href }] : [];
  });
  return (
    <aside
      aria-labelledby={id}
      className={cn('flex gap-4 rounded-[16px] bg-paper p-6', className)}
    >
      <Avatar name={author.name} url={author.avatarUrl} size={64} />
      <div className="min-w-0">
        <p id={id} className={cn('t-label text-fg-3', c.kicker)}>
          About the author
        </p>
        <p className="t-title mt-1 text-fg">
          <Link href={newsPath.author(author.slug)} className="sv-quiet">
            {author.name}
          </Link>
        </p>
        {author.bio ? <p className={cn('mt-2 text-fg-2', s.bio)}>{author.bio}</p> : null}
        {links.length ? (
          <ul className="t-small mt-3 flex flex-wrap gap-x-4">
            {links.map((l) => (
              <li key={l.key}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sv-quiet sv-quiet-hit inline-flex items-center gap-1.5"
                >
                  {l.Glyph ? (
                    <span aria-hidden="true" className="inline-flex shrink-0">
                      <l.Glyph size={16} />
                    </span>
                  ) : null}
                  {l.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

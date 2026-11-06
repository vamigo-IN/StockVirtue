import { Globe } from 'lucide-react';
import type { ComponentType } from 'react';
import { Breadcrumbs } from '@/components/news/blocks';
import {
  FacebookF,
  InstagramGlyph,
  LinkedInBug,
  XLogo,
  YouTubeIcon,
} from '@/components/public/icons';
import { initials } from '@/news/format';
import type { AuthorContext } from '@/news/types';
import type { Crumb } from './ListingHead';
import s from './listing.module.css';

type Social = keyof AuthorContext['socials'];

/** The order and names the story's AuthorBox uses (W4). */
const SOCIALS: { key: Social; name: string; Glyph: ComponentType<{ size?: number; className?: string }> }[] = [
  { key: 'twitter', name: 'X', Glyph: XLogo },
  { key: 'linkedin', name: 'LinkedIn', Glyph: LinkedInBug },
  { key: 'instagram', name: 'Instagram', Glyph: InstagramGlyph },
  { key: 'youtube', name: 'YouTube', Glyph: YouTubeIcon },
  { key: 'facebook', name: 'Facebook', Glyph: FacebookF },
  { key: 'website', name: 'Website', Glyph: Globe },
];

/**
 * The author page's profile head (spec §5.11): on paper, a 96 px photo
 * (72 on phones; initials on --sv-green-100 when there is none), the H1
 * name, the bio in `standfirst`, and the social links as icon plus text
 * (brand icons from components/public/icons, never lucide, except the
 * website's globe; rel="noopener noreferrer me"). The breadcrumbs are the
 * only thing above the H1 (R1). Server component.
 */
export function AuthorHead({ author, crumbs }: { author: AuthorContext; crumbs: Crumb[] }) {
  const links = SOCIALS.flatMap((x) => {
    const url = author.socials[x.key];
    return url ? [{ ...x, url }] : [];
  });
  return (
    <div className={`sv-pagehead ${s.author}`} data-family="news">
      <div className="sv-container">
        <div className="sv-pagehead-crumbs">
          <Breadcrumbs items={crumbs} />
        </div>
        <div className={s.authorBody}>
          {author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={author.avatarUrl} alt="" width={96} height={96} className={s.avatar} />
          ) : (
            <span aria-hidden="true" className={`${s.avatar} t-title`}>
              {initials(author.name)}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="sv-pagehead-title t-hub-1 text-fg">{author.name}</h1>
            {author.bio ? (
              <p className="sv-pagehead-summary t-standfirst text-fg-2">{author.bio}</p>
            ) : null}
            {links.length ? (
              <ul className={s.socials} aria-label={`${author.name} elsewhere`}>
                {links.map(({ key, name, Glyph, url }) => (
                  <li key={key}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="sv-quiet t-small"
                    >
                      <span aria-hidden="true" className="inline-flex shrink-0">
                        <Glyph size={18} />
                      </span>
                      {name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

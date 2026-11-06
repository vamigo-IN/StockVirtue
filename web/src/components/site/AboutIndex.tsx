import { cn } from '@/lib/utils';
import s from './site.module.css';

/**
 * About's index (spec §5.3): anchor links, 44 px each, to the page's
 * sections. `list` is the sticky white index card at >= 1024 px, with its
 * mono "On this page" label; `row` the row of 44 px chips under the band on
 * tablets. Phones have neither (the page is one short column). The hrefs
 * are About's code ids (ABOUT_SECTION_IDS); the labels are the sections'
 * titles from the content. Server component.
 */
export function AboutIndex({
  variant,
  label,
  links,
}: {
  variant: 'list' | 'row';
  /** The nav's accessible name. */
  label: string;
  links: { id: string; label: string }[];
}) {
  const list = (
    <ul className={cn(variant === 'list' ? s.anchorList : s.anchorRow)}>
      {links.map((l) => (
        <li key={l.id}>
          <a href={`#${l.id}`}>{l.label}</a>
        </li>
      ))}
    </ul>
  );
  if (variant === 'row') return <nav aria-label={label}>{list}</nav>;
  return (
    <nav aria-label={label} className={s.indexCard}>
      <p className={s.indexLabel} aria-hidden="true">
        {label}
      </p>
      {list}
    </nav>
  );
}

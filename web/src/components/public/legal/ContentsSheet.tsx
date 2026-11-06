'use client';

import { LazyDialog } from '../ui/LazyDialog';
import styles from './legal.module.css';
import type { TocItem } from './LegalToc';

/** Jumps to a section's heading and gives it focus (after the sheet closed). */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.location.hash === `#${id}`) el.scrollIntoView();
  else window.location.hash = id;
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}

/**
 * The phone "Contents" control of the legal pages (spec §4.13): the
 * floating Contents button (48 px, bottom right, shown after 600 px of
 * scroll; LegalToc decides) and the bottom sheet it opens, a LazyDialog
 * (Radix Dialog: focus trap, Escape, scroll lock) at most 70dvh tall with
 * the same list. The Radix module loads on the button's first use
 * (prefetched on pointerenter and touchstart), never with the page.
 * Picking a section closes the sheet, jumps to its heading and moves focus
 * there; Escape or the close button return focus to the Contents button.
 */
export function ContentsSheet({
  items,
  active,
  title,
  closeLabel,
  lang,
  hidden,
}: {
  items: TocItem[];
  active: string;
  title: string;
  closeLabel: string;
  lang?: string;
  /** Hide the button (before 600 px of scroll, or with no sections). */
  hidden: boolean;
}) {
  return (
    <LazyDialog
      variant="bottom"
      title={title}
      closeLabel={closeLabel}
      lang={lang}
      triggerClassName={styles.fab}
      triggerHidden={hidden}
      trigger={
        <>
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          {title}
        </>
      }
    >
      {({ close }) => (
        <nav aria-label={title} className={styles.sheetNav}>
          <ul className={styles.list}>
            {items.map((it) => (
              <li key={it.id}>
                <a
                  href={`#${it.id}`}
                  aria-current={active === it.id ? 'true' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    close(() => jumpTo(it.id));
                  }}
                >
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </LazyDialog>
  );
}

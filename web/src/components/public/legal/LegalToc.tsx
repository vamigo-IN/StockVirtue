'use client';

import { useEffect, useRef, useState } from 'react';
import { ContentsSheet } from './ContentsSheet';
import styles from './legal.module.css';

export interface TocItem {
  id: string;
  label: string;
}

/** The floating Contents button shows after this much scroll (spec §4.13). */
const FAB_AFTER = 600;

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function Chevron() {
  return (
    <svg
      className={styles.chevron}
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function List({
  items,
  active,
  onPick,
}: {
  items: TocItem[];
  active: string;
  onPick?: () => void;
}) {
  return (
    <ul className={styles.list}>
      {items.map((it) => (
        <li key={it.id}>
          <a
            href={`#${it.id}`}
            aria-current={active === it.id ? 'true' : undefined}
            onClick={onPick}
          >
            {it.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * The section being read: the last heading whose top has passed the
 * reading line (a quarter of the way down the window), the first one while
 * none has (the top of the page), and the last one once the page can't
 * scroll further (a short last section never reaches the line). Worked out
 * from the headings' positions on every scroll, so a jump (Home, a link,
 * a fast fling) lands on the right item: an observer that only reports
 * headings entering a band kept the last-seen section highlighted after a
 * jump back to the top (the M0.2 bug).
 */
function sectionAt(heads: HTMLElement[]): string {
  const line = window.innerHeight * 0.25;
  let current = heads[0].id;
  for (const h of heads) {
    if (h.getBoundingClientRect().top <= line) current = h.id;
    else break;
  }
  const doc = document.documentElement;
  if (window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
    current = heads[heads.length - 1].id;
  }
  return current;
}

/**
 * The legal pages' contents list (spec §4.13), built after mount from the
 * h2s in `.legal-body` (ids are added only where a heading has none, so
 * existing anchors such as #cookies stay unique), with the scroll-spy that
 * marks the section being read: `--sv-fg` at 600 with a 2 px
 * `--sv-selected` (ink) rule on the left, never green.
 *
 * - >= 1024: a sticky left column, "On this page".
 * - 768–1023: a sticky "On this page" bar, collapsed by default.
 * - Below 768: an inline "Contents" disclosure at the top, and after 600 px
 *   of scroll a floating "Contents" button that opens the Contents sheet
 *   (loaded on first use). The button steps aside while the site footer is
 *   on screen, so it never covers the footer's controls.
 *
 * The first render (server and client) has no items, so hydration matches;
 * the containers render from the start, so nothing shifts when they fill.
 */
export function LegalToc({
  onThisPage,
  contents,
  close,
  lang,
}: {
  onThisPage: string;
  contents: string;
  close: string;
  lang?: string;
}) {
  const [items, setItems] = useState<TocItem[]>([]);
  const [active, setActive] = useState('');
  const [showFab, setShowFab] = useState(false);
  /** The site footer is on screen: the floating button would cover its
   *  last controls (the palette switch), and the notice is read by then. */
  const [footerSeen, setFooterSeen] = useState(false);
  const barRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const footers = document.querySelectorAll('footer.sv-footer');
    const foot = footers[footers.length - 1];
    if (!foot || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e) setFooterSeen(e.isIntersecting);
    });
    io.observe(foot);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const heads = Array.from(
      document.querySelectorAll<HTMLHeadingElement>('.legal-body h2'),
    );
    const list = heads.map((h, i) => {
      if (!h.id) {
        let id = slugify(h.textContent || '') || `section-${i + 1}`;
        for (let n = 2; document.getElementById(id); n += 1) {
          id = `${slugify(h.textContent || '') || 'section'}-${n}`;
        }
        h.id = id;
      }
      return { id: h.id, label: (h.textContent || '').trim() };
    });
    setItems(list);

    let frame = 0;
    const update = () => {
      frame = 0;
      setShowFab(window.scrollY > FAB_AFTER);
      if (heads.length) setActive(sectionAt(heads));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <nav className={styles.aside} aria-labelledby="legal-toc-title" lang={lang}>
        <p id="legal-toc-title" className={`t-label text-fg-3 ${styles.asideTitle}`}>
          {onThisPage}
        </p>
        <List items={items} active={active} />
      </nav>

      <details ref={barRef} className={styles.bar} lang={lang}>
        <summary>
          {onThisPage}
          <Chevron />
        </summary>
        <nav aria-label={onThisPage}>
          <List
            items={items}
            active={active}
            onPick={() => {
              if (barRef.current) barRef.current.open = false;
            }}
          />
        </nav>
      </details>

      <details className={styles.inline} lang={lang}>
        <summary>
          {contents}
          <Chevron />
        </summary>
        <nav aria-label={contents}>
          <List items={items} active={active} />
        </nav>
      </details>

      <ContentsSheet
        items={items}
        active={active}
        title={contents}
        closeLabel={close}
        lang={lang}
        hidden={!showFab || footerSeen || items.length === 0}
      />
    </>
  );
}

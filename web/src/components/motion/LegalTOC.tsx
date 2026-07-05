'use client';

import { useEffect, useState } from 'react';

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Auto-built "On this page" navigation for the legal pages. Reads the <h2>s in
 * the sibling `.legal-body`, gives them ids, and highlights the current
 * section as you scroll (scroll-spy). Sticky on desktop; hidden on mobile
 * (handled in globals.css). Anchor clicks ride Lenis smooth scroll.
 */
export function LegalTOC() {
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  const [active, setActive] = useState('');

  useEffect(() => {
    const heads = Array.from(
      document.querySelectorAll<HTMLHeadingElement>('.legal-body h2'),
    );
    const list = heads.map((h) => {
      if (!h.id) h.id = slugify(h.textContent || '');
      return { id: h.id, label: h.textContent || '' };
    });
    setItems(list);
    if (list.length) setActive(list[0].id);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive((e.target as HTMLElement).id);
        }
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    heads.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, []);

  if (!items.length) return null;

  return (
    <nav className="legal-toc" aria-label="On this page">
      <div className="legal-toc-title">On this page</div>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className={active === it.id ? 'active' : ''}>
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

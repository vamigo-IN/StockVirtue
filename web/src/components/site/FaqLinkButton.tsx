'use client';

import { useEffect, useState } from 'react';
import s from './site.module.css';

/**
 * The FAQ's "#" button (spec §5.4): shown on hover of its row and on focus
 * (CSS), it copies the page URL with the question's hash. `aria-label` is
 * "Link to: {question}"; a polite live region says when it's copied. Where
 * the clipboard isn't available it puts the hash in the address bar
 * instead, so the link can still be copied from there.
 *
 * It also opens its question when the page is opened at (or moved to) its
 * hash, so a shared /faq#… link lands on an open answer.
 */
export function FaqLinkButton({ id, question }: { id: string; question: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const openIfTarget = () => {
      let hash = '';
      try {
        hash = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        hash = window.location.hash.slice(1);
      }
      if (hash !== id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    openIfTarget();
    window.addEventListener('hashchange', openIfTarget);
    return () => window.removeEventListener('hashchange', openIfTarget);
  }, [id]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.history.replaceState(null, '', `#${id}`);
    }
  };

  return (
    <>
      <button type="button" className={s.faqLink} aria-label={`Link to: ${question}`} onClick={copy}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" x2="20" y1="9" y2="9" />
          <line x1="4" x2="20" y1="15" y2="15" />
          <line x1="10" x2="8" y1="3" y2="21" />
          <line x1="16" x2="14" y1="3" y2="21" />
        </svg>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </span>
    </>
  );
}

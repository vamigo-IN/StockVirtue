'use client';

import { Check, Link2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Share links (plain URLs: no third-party scripts or trackers load) plus the
 * phone's own share sheet where the browser offers one.
 */
export function ShareBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(typeof navigator !== 'undefined' && 'share' in navigator);
  }, []);

  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    },
    { label: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
    {
      label: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    },
  ];
  const pill =
    'inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-medium hover:border-foreground/40 hover:bg-muted';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Share this story"
    >
      {native && (
        <button
          type="button"
          className={pill}
          onClick={() => void navigator.share({ url, title }).catch(() => {})}
        >
          <Share2 className="size-4" /> Share
        </button>
      )}
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={pill}
        >
          <span className="sr-only">Share on </span>
          {l.label}
        </a>
      ))}
      <button type="button" className={pill} onClick={() => void copy()}>
        {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
        <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  );
}

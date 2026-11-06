'use client';

import { Check, Ellipsis, Link as LinkGlyph, Share2 } from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import s from '@/components/news/story/story.module.css';
import { FacebookF, LinkedInBug, WhatsAppGlyph } from '@/components/public/icons';
import { LazyPopover } from '@/components/public/ui/LazyPopover';
import { useHydrated } from '@/lib/hooks/useHydrated';
import { cn } from '@/lib/utils';

/** How long "Copied" shows after a copy. */
const COPIED_MS = 2000;

type Network = {
  key: 'whatsapp' | 'x' | 'linkedin' | 'facebook';
  /** The visible name (spec §9.6 "Share"). */
  name: string;
  href: string;
  /** The brand glyph from components/public/icons; X has none yet (lead decision 4). */
  Glyph: ComponentType<{ size?: number; className?: string }> | null;
};

function networks(url: string, title: string): Network[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { key: 'whatsapp', name: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}`, Glyph: WhatsAppGlyph },
    { key: 'x', name: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`, Glyph: null },
    {
      key: 'linkedin',
      name: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      Glyph: LinkedInBug,
    },
    {
      key: 'facebook',
      name: 'Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      Glyph: FacebookF,
    },
  ];
}

/** Plain intent links: no third-party script or tracker ever loads. */
const REL = 'noopener noreferrer nofollow';

/**
 * The story's ONE share bar (spec §4.9, §5.12): Share (the device's own
 * sheet), WhatsApp, X, LinkedIn, Facebook and Copy link → "Copied".
 * Exactly one "Copy link" button exists at every width.
 *
 * - Share renders only after hydration and only where `navigator.share`
 *   exists, so the server HTML and the first client render agree.
 * - The story grid places it (story.module.css): its track fills the bar's
 *   grid area and the bar is sticky inside the track, so it stays within
 *   that area in every browser. Below 1280 px it is the sticky bottom bar
 *   while the body is on screen, resting in the reserved share row after
 *   the body; from 1280 px it is the sticky icon column in c1. `className`
 *   goes on the track.
 * - Its form follows its own width (a size container): [Share] WhatsApp
 *   [Copy link] More below about 585 px, X, LinkedIn and Facebook then sit
 *   in the More popover (Radix, loaded on first use through LazyPopover);
 *   six icon + text pills once they fit; six 44 × 44 icon buttons with
 *   sr-only names ("Share on X") at >= 1280.
 * - Brand glyphs come from components/public/icons, never lucide; Share and
 *   Copy link use lucide Share2 and Link. X has no official glyph file yet,
 *   so its name (the letter X) stands in.
 */
export function ShareBar({
  url,
  title,
  className,
}: {
  /** The story's absolute canonical address. */
  url: string;
  title: string;
  className?: string;
}) {
  const hydrated = useHydrated();
  const native =
    hydrated && typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  const all = networks(url, title);
  const [whatsapp, ...rest] = all;

  return (
    <div className={cn(s.shareTrack, className)}>
      <div className={s.shareBar} role="group" aria-label="Share this story">
        <ul className={s.shareList}>
          {native ? (
            <li>
              <button
                type="button"
                className={s.shareBtn}
                onClick={() => void navigator.share({ url, title }).catch(() => undefined)}
              >
                <Pill icon={<Share2 className={s.shareIcon} aria-hidden="true" />}>Share</Pill>
              </button>
            </li>
          ) : null}
          <li>
            <NetworkLink network={whatsapp} iconOnly />
          </li>
          {rest.map((n) => (
            <li key={n.key} className={s.extra}>
              <NetworkLink network={n} />
            </li>
          ))}
          <li>
            <button type="button" className={s.shareBtn} onClick={() => void copy()}>
              <Pill
                icon={
                  copied ? (
                    <Check className={s.shareIcon} aria-hidden="true" />
                  ) : (
                    <LinkGlyph className={s.shareIcon} aria-hidden="true" />
                  )
                }
              >
                <span aria-live="polite">{copied ? 'Copied' : 'Copy link'}</span>
              </Pill>
            </button>
          </li>
          <li className={s.more}>
            <LazyPopover
              label="More ways to share"
              triggerClassName={cn(s.shareBtn, s.iconOnly)}
              side="top"
              align="end"
              className="p-1"
              trigger={
                <span className={s.sharePill}>
                  <Ellipsis className={s.shareIcon} aria-hidden="true" />
                </span>
              }
            >
              <ul className={s.moreList}>
                {rest.map((n) => (
                  <li key={n.key}>
                    <a href={n.href} target="_blank" rel={REL} className={s.moreLink}>
                      {n.Glyph ? (
                        <n.Glyph size={16} className={s.shareIcon} />
                      ) : (
                        // X has no glyph yet: keep its name in line with the others.
                        <span className={s.shareIcon} aria-hidden="true" />
                      )}
                      <span className="t-small">
                        <span className="sr-only">Share on </span>
                        {n.name}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </LazyPopover>
          </li>
        </ul>
      </div>
    </div>
  );
}

/** The visible pill: an icon and its text (hidden or shown by the bar's form). */
function Pill({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className={s.sharePill}>
      {icon}
      <span className={s.shareText}>{children}</span>
    </span>
  );
}

function NetworkLink({ network: n, iconOnly = false }: { network: Network; iconOnly?: boolean }) {
  return (
    <a
      href={n.href}
      target="_blank"
      rel={REL}
      className={cn(s.shareBtn, iconOnly && s.iconOnly)}
    >
      <span className={s.sharePill}>
        {n.Glyph ? (
          <n.Glyph size={16} className={s.shareIcon} />
        ) : (
          // The letter X, shown in the icon column only.
          <span className={s.letter} aria-hidden="true">
            {n.name}
          </span>
        )}
        <span className={s.shareText}>
          <span className="sr-only">Share on </span>
          {n.name}
        </span>
      </span>
    </a>
  );
}

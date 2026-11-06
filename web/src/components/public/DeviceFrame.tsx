import type { ReactNode } from 'react';
import type { Screen } from '@/content/screens';
import { cn } from '@/lib/utils';

/**
 * A phone frame around a REAL app screenshot (spec §4.11, §6.5; R10): a
 * CSS frame in `--sv-stage-3`, radius 32, a 10 px bezel, a 6 px camera dot
 * centred 12 px from the top, the screen at radius 22, and
 * `--sv-shadow-device` on the dark stage only. It never renders empty:
 * pass a screen from SCREENS (src/content/screens.ts) and render nothing
 * when the entry is null (the text-only layouts are complete states).
 *
 * Widths (the height follows the screenshot, 1080 × 2400 → 9:20):
 * - `sm`: 160 px (120 below 640): /download's five minutes;
 * - `md`: 220 px: the /download panel, the home Learning panel;
 * - `lg`: 260 px (200 below 1024): /features chapters, the gate-off hero;
 * - `stage`: 300 px (240 below 1024): the home stage.
 * Override the width with a `--sv-device-w` value in `className` if a
 * layout needs another (the phone carousel's 180 px).
 *
 * The image: `src` is the 1080w WebP; a `-540.webp` sibling is used for
 * 1x screens when `src` ends in `-1080.webp`. A screen that carries its own
 * `srcSet` (one picked in the admin, from the media library; W7 addendum
 * §11.2) uses that instead. `priority` loads it eagerly at high priority
 * (the stage on a desktop first screen); otherwise lazy.
 *
 * `showCallouts`: numbered 24 px white discs over the screen at the
 * screen's callout points (% of the screen), and the same numbers listed
 * under the frame as text (the discs are aria-hidden).
 * `caption` (additive): wraps it in a <figure> with a `meta` figcaption
 * ("The option chain, captured on 28 Nov 2026."). Server component.
 */
export function DeviceFrame({
  screen,
  size,
  showCallouts = false,
  priority = false,
  caption,
  className,
}: {
  screen: Screen;
  size: 'sm' | 'md' | 'lg' | 'stage';
  showCallouts?: boolean;
  priority?: boolean;
  caption?: ReactNode;
  className?: string;
}) {
  const m = /^(.*)-1080\.webp$/.exec(screen.src);
  const srcSet =
    screen.srcSet?.trim() || (m ? `${m[1]}-540.webp 540w, ${screen.src} 1080w` : undefined);
  const callouts = showCallouts ? (screen.callouts ?? []) : [];

  const frame = (
    <div className="sv-device">
      <div className="sv-device-screen">
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size WebP pair with its own srcset */}
        <img
          src={screen.src}
          srcSet={srcSet}
          sizes={srcSet ? SIZES[size] : undefined}
          width={screen.width}
          height={screen.height}
          alt={screen.alt}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
        />
        {callouts.map((c, i) => (
          <span
            key={`${c.x}-${c.y}`}
            className="sv-device-callout"
            style={{ left: `${c.x}%`, top: `${c.y}%` }}
            aria-hidden="true"
          >
            {i + 1}
          </span>
        ))}
      </div>
      <span className="sv-device-camera" aria-hidden="true" />
    </div>
  );

  const list = callouts.length ? (
    <ol className="sv-device-callouts t-meta text-fg-2">
      {callouts.map((c, i) => (
        <li key={`${c.x}-${c.y}`}>
          <span className="sv-device-num" aria-hidden="true">
            {i + 1}
          </span>
          {c.label}
        </li>
      ))}
    </ol>
  ) : null;

  if (caption) {
    return (
      <figure className={cn('sv-device-wrap', className)} data-size={size}>
        {frame}
        {list}
        <figcaption className="t-meta mt-3 text-fg-3">{caption}</figcaption>
      </figure>
    );
  }
  return (
    <div className={cn('sv-device-wrap', className)} data-size={size}>
      {frame}
      {list}
    </div>
  );
}

/** The screen's rendered width per size, for the srcset choice. */
const SIZES: Record<'sm' | 'md' | 'lg' | 'stage', string> = {
  sm: '(max-width: 639.98px) 100px, 140px',
  md: '200px',
  lg: '(max-width: 1023.98px) 180px, 240px',
  stage: '(max-width: 1023.98px) 220px, 280px',
};

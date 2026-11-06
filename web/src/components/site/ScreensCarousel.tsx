'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import s from './site.module.css';

/**
 * The phone carousel on /features (spec §4.11, §5.2): phones only (hidden
 * from 768 px by CSS). A scroll-snap row of DeviceFrames at 180 px wide with
 * the next frame peeking 24 px, and 44 px dot buttons ("Screen 2 of 6: the
 * order ticket"). No autoplay. The frames are rendered on the server and
 * arrive as nodes, so no screen code ships here. Under reduced motion a dot
 * jumps instead of scrolling smoothly. The page leaves it out entirely
 * until the screens exist.
 */
export function ScreensCarousel({
  label,
  frames,
}: {
  /** "Screens from the app". */
  label: string;
  /** One server-rendered DeviceFrame per screen, with what it shows ("the order ticket"). */
  frames: { key: string; label: string; node: ReactNode }[];
}) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const n = frames.length;

  useEffect(() => {
    const el = track.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const items = Array.from(el.children) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const i = items.indexOf(e.target as HTMLElement);
            if (i >= 0) setActive(i);
          }
        }
      },
      { root: el, threshold: [0.6] },
    );
    for (const it of items) io.observe(it);
    return () => io.disconnect();
  }, [n]);

  const go = (i: number) => {
    const item = track.current?.children[i] as HTMLElement | undefined;
    if (!item) return;
    let reduce = false;
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduce = false;
    }
    item.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
    setActive(i);
  };

  if (!n) return null;
  return (
    <div className={s.carousel} role="region" aria-label={label}>
      <ul ref={track} className={s.carouselTrack}>
        {frames.map((f) => (
          <li key={f.key}>{f.node}</li>
        ))}
      </ul>
      {n > 1 ? (
        <div className={s.carouselDots}>
          {frames.map((f, i) => (
            <button
              key={f.key}
              type="button"
              className={s.carouselDot}
              aria-label={`Screen ${i + 1} of ${n}: ${f.label}`}
              aria-current={i === active ? 'true' : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

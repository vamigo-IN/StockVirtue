'use client';

import { useEffect, useState } from 'react';
import { useStreamPulse } from './data';

/** The streamed lists a live dot can follow (the price stream's two views). */
export type StreamPath = 'snapshot' | 'ticker';

/**
 * The "Live" pill's dot (spec §4.10, §6.3). It pulses once (a ring: scale
 * 1 → 1.8, opacity .6 → 0, 400 ms; widgets.css) each time the price stream
 * changes a value in `path`'s list, and never for the stream's first
 * picture or for changes that happened before this dot mounted. The server
 * and the first client render draw a still dot, so the markup always
 * matches. Each beat remounts the dot (a new key), which restarts the
 * one-shot animation however close together the updates come. Under
 * reduced motion there is no pulse (widgets.css).
 */
export function PulseDot({ path }: { path: StreamPath }) {
  const count = useStreamPulse(path);
  // The count when this dot mounted: only later moves pulse.
  const [base, setBase] = useState<number | null>(null);
  useEffect(() => {
    setBase((b) => (b === null ? count : b));
  }, [count]);
  const beating = base !== null && count !== base;
  return (
    <span
      key={beating ? count : 'still'}
      className="sv-live-dot"
      data-beat={beating ? '' : undefined}
      aria-hidden="true"
    />
  );
}

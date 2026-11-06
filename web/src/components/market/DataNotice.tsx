import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { COPY } from './copy';
import { BOX, LockGlyph } from './parts';

/**
 * The one line a hub shows where its LIVE-only modules (movers, sectors,
 * the heatmap) can't (spec §4.10, §9.7): a lock and "Movers, sectors and
 * the heatmap need our live data licence, which the website doesn't have
 * right now." One notice in place of all three, never a pile of lock
 * boxes. An upstream failure is not a licence matter: those modules show
 * their own error line instead. Server-safe.
 */
export function DataNotice({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p className={clsx(BOX, 't-small flex items-start gap-2 text-fg-2', className)}>
      <LockGlyph />
      <span>{children ?? COPY.hubNotice}</span>
    </p>
  );
}

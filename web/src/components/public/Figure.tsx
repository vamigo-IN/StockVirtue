import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A figure with its caption (spec §4.11): the content, then a figcaption in
 * `meta`, `--sv-fg-2`, saying what it shows and when it was captured, with
 * the credit after it in `--sv-fg-3`. Server component.
 */
export function Figure({
  caption,
  credit,
  children,
  className,
}: {
  caption: ReactNode;
  credit?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn('sv-figure', className)}>
      {children}
      <figcaption className="t-meta mt-3 text-fg-2">
        {caption}
        {credit ? (
          <>
            {' '}
            <span className="text-fg-3">{credit}</span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}

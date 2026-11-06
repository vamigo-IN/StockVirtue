import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A white panel (spec §4.11): 1 px `--sv-rule`, padding 24 (phones) / 32
 * (>= 768), no shadow, 16 px corners in every family (Emerald Terminal:
 * cards and panels are 16; `family` is kept for callers and data-family).
 * Change the ground with a utility in `className` (it wins): `bg-paper` for
 * the Academy panel, `bg-surface-2` for About's "What we're not".
 * `as` (additive) picks the element; the app panels are
 * `<aside aria-label="From StockVirtue">`. Server component.
 */
export function Panel({
  family,
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  family: 'home' | 'site' | 'news';
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <Tag
      className={cn(
        'border border-rule bg-surface p-6 text-fg md:p-8',
        'rounded-[16px]',
        className,
      )}
      data-family={family}
      {...rest}
    >
      {children}
    </Tag>
  );
}

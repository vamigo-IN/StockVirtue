import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The one container for all three families (spec §3.4): full width up to
 * 1296 px (1232 of content plus the 32 px margins), centred, with the side
 * margin of the current range (16 / 24 / 32 px). It keeps the logo and the
 * content edges in the same place on the home page, site pages and news.
 * `as` picks the element (a `<section>`, a `<nav>` …); default `<div>`.
 * Server component.
 */
export function Container({
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  id?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
}) {
  return (
    <Tag className={cn('sv-container', className)} {...rest}>
      {children}
    </Tag>
  );
}

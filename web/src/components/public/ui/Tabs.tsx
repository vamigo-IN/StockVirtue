'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { clsx } from 'clsx';

/**
 * Radix Tabs, styled with the tokens (spec §4.14). Tabs are visible
 * content, so they ship in the page's initial bundle (spec §4 rule 2);
 * Popover and Dialog never do (see LazyPopover / LazyDialog).
 *
 * - Triggers are 44 px targets in the `label` type, `--sv-fg-2`; the
 *   selected one turns `--sv-fg` and grows a 2 px `--sv-selected` bar
 *   (ink on light, `--sv-on-stage` inside `.sv-stage`; R14) over
 *   `--sv-dur-2`. Under reduced motion the switch is instant (public.css).
 * - `orientation="vertical"` (on `Tabs`) turns the list into a column of
 *   left-aligned blocks with a 2 px rule on the left: the home stage's steps.
 * - `scrollable` on `TabsList` lets a long list scroll sideways on phones.
 * - Give `TabsList` an `aria-label` when no visible heading names it.
 *
 * Server content stays on the server (spec §4 rule 3): pass server-rendered
 * cards, stamps and dates in as children; never import clock-dependent
 * formatters into a tab panel.
 *
 * ```tsx
 * <Tabs defaultValue="gainers">
 *   <TabsList aria-label="Biggest moves">
 *     <TabsTrigger value="gainers">Gainers</TabsTrigger>
 *     <TabsTrigger value="losers">Losers</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="gainers">…</TabsContent>
 *   <TabsContent value="losers">…</TabsContent>
 * </Tabs>
 * ```
 */
export function Tabs({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      className={clsx(
        'data-[orientation=vertical]:flex data-[orientation=vertical]:gap-6',
        className,
      )}
      {...props}
    />
  );
}

export function TabsList({
  className,
  scrollable = false,
  ...props
}: ComponentProps<typeof TabsPrimitive.List> & {
  /** Let the triggers scroll sideways instead of wrapping (phones). */
  scrollable?: boolean;
}) {
  return (
    <TabsPrimitive.List
      className={clsx('sv-tabs-list', className)}
      data-scroll={scrollable ? '' : undefined}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={clsx('sv-tab', className)} {...props} />;
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={clsx('min-w-0', className)}
      {...props}
    />
  );
}

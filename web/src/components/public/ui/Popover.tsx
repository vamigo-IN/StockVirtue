'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import { useRef, type ReactNode, type RefObject } from 'react';
import { usePortalContainer } from '@/lib/hooks/usePortalContainer';
import { cn } from '@/lib/utils';

/**
 * The popover itself: Radix Popover, styled with the tokens. NEVER import
 * this file statically. It is the overlay module LazyPopover loads through
 * React.lazy on the trigger's first use (spec §4 rule 2), so Radix's
 * popover and @floating-ui stay out of every page's initial bundle.
 *
 * The trigger is LazyPopover's own plain <button>, outside this tree: it
 * is the popper's anchor (virtualRef), a press on it never counts as an
 * outside click, and focus goes back to it on Escape.
 */
export type PopoverSurfaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** LazyPopover's trigger: the anchor, and where focus returns. */
  anchorRef: RefObject<HTMLButtonElement | null>;
  /** The content's id (the trigger's aria-controls while open). */
  contentId: string;
  /** The popover's accessible name. */
  label: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
  lang?: string;
  children: ReactNode;
};

type Measurable = { getBoundingClientRect(): DOMRect };

export function PopoverSurface({
  open,
  onOpenChange,
  anchorRef,
  contentId,
  label,
  side = 'bottom',
  align = 'start',
  className,
  lang,
  children,
}: PopoverSurfaceProps) {
  // Portal into #sv-public (spec §4 rule 1). It is found after mount, so
  // the popover opens one frame later, straight into the right place.
  const container = usePortalContainer();
  const outside = useRef(false);

  return (
    <PopoverPrimitive.Root
      open={open && container !== null}
      onOpenChange={onOpenChange}
    >
      <PopoverPrimitive.Anchor
        virtualRef={anchorRef as unknown as RefObject<Measurable>}
      />
      <PopoverPrimitive.Portal container={container}>
        <PopoverPrimitive.Content
          id={contentId}
          aria-label={label}
          lang={lang}
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={16}
          onInteractOutside={(e) => {
            const target = e.target as Node | null;
            // A press on the trigger toggles it; it is not an outside click.
            if (target && anchorRef.current?.contains(target)) {
              e.preventDefault();
              return;
            }
            outside.current = true;
          }}
          onCloseAutoFocus={(e) => {
            // Escape or a choice inside: focus goes back to the trigger.
            // A click elsewhere leaves focus where the reader put it.
            if (!outside.current) {
              e.preventDefault();
              anchorRef.current?.focus();
            }
            outside.current = false;
          }}
          className={cn(
            'z-[70] w-max max-w-[min(320px,calc(100vw-32px))] rounded-[12px] border border-rule bg-surface p-4 text-fg [box-shadow:var(--sv-shadow-2)]',
            't-small outline-none',
            'duration-(--sv-dur-2) ease-(--sv-ease-out) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
            className,
          )}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

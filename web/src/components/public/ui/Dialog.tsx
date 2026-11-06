'use client';

import { Dialog as DialogPrimitive } from 'radix-ui';
import { useRef, type ReactNode, type RefObject } from 'react';
import { usePortalContainer } from '@/lib/hooks/usePortalContainer';
import { cn } from '@/lib/utils';

/**
 * The dialog itself: Radix Dialog, styled with the tokens (focus trap,
 * Escape, scroll lock, everything else aria-hidden while open). NEVER
 * import this file statically. It is the overlay module LazyDialog loads
 * through React.lazy on the trigger's first use (spec §4 rule 2), so
 * Radix's dialog stays out of every page's initial bundle.
 *
 * Three shapes (spec §3.5, §4.3, §4.13):
 * - "center": a centred dialog, radius 20, at most 560 px wide;
 * - "bottom": a bottom sheet, at most 70dvh tall, scrolling inside;
 * - "right": a right-hand sheet, min(88vw, 360px) wide and 100dvh tall
 *   (the phone drawer).
 * Each slides or fades over --sv-dur-3; under reduced motion it only
 * fades, in 60 ms (`.sv-overlay` in public.css; spec §6.9).
 */
export type DialogVariant = 'center' | 'bottom' | 'right';

/** What a render-function child of LazyDialog receives. */
export type DialogApi = {
  /**
   * Closes the dialog. With `after`, focus does NOT go back to the trigger:
   * `after` runs once the dialog has gone (scroll unlocked) and moves focus
   * itself, e.g. to the heading a contents list jumped to.
   */
  close: (after?: () => void) => void;
};

export type DialogSurfaceProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** LazyDialog's trigger: where focus returns on close. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** The content's id (the trigger's aria-controls while open). */
  contentId: string;
  title: ReactNode;
  /** Keep the title for screen readers only (the drawer's "Menu"). */
  hideTitle?: boolean;
  /** Shown at the start of the top row, before the title (a logo). */
  headerStart?: ReactNode;
  showClose?: boolean;
  closeLabel?: string;
  variant?: DialogVariant;
  className?: string;
  lang?: string;
  children: ReactNode | ((api: DialogApi) => ReactNode);
};

const SHAPE: Record<DialogVariant, string> = {
  center:
    'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(560px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] rounded-[20px] px-6 pb-6 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
  bottom:
    'inset-x-0 bottom-0 max-h-[70dvh] rounded-t-[20px] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
  right:
    'inset-y-0 right-0 h-dvh w-[min(88vw,360px)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
};

/** The top row stays in view while a long sheet scrolls. */
const HEAD: Record<DialogVariant, string> = {
  center: 'pt-4 pb-2',
  bottom: 'pt-2',
  right: 'pt-2',
};

export function DialogSurface({
  open,
  onOpenChange,
  triggerRef,
  contentId,
  title,
  hideTitle = false,
  headerStart,
  showClose = true,
  closeLabel = 'Close',
  variant = 'center',
  className,
  lang,
  children,
}: DialogSurfaceProps) {
  // Portal into #sv-public (spec §4 rule 1); open once it is known.
  const container = usePortalContainer();
  const after = useRef<(() => void) | null>(null);
  const api: DialogApi = {
    close: (fn) => {
      after.current = fn ?? null;
      onOpenChange(false);
    },
  };

  return (
    <DialogPrimitive.Root
      open={open && container !== null}
      onOpenChange={(next) => {
        if (next) after.current = null;
        onOpenChange(next);
      }}
    >
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay className="sv-overlay fixed inset-0 z-[60] bg-[rgb(17_23_20/0.4)] duration-(--sv-dur-3) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          id={contentId}
          lang={lang}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const fn = after.current;
            after.current = null;
            if (fn) fn();
            else triggerRef.current?.focus();
          }}
          className={cn(
            'sv-overlay fixed z-[60] flex flex-col overflow-y-auto overscroll-contain bg-surface text-fg outline-none [box-shadow:var(--sv-shadow-3)]',
            'duration-(--sv-dur-3) ease-(--sv-ease-out) data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            SHAPE[variant],
            className,
          )}
        >
          {/* sv-dialog-head: the head row's hook (the drawer's paper band
              in public.css), so no rule depends on it being the first child. */}
          <div
            className={cn(
              'sv-dialog-head sticky top-0 z-[1] flex min-h-12 shrink-0 items-center justify-between gap-3 bg-surface',
              HEAD[variant],
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              {headerStart}
              <DialogPrimitive.Title
                className={hideTitle ? 'sr-only' : 't-title text-fg'}
              >
                {title}
              </DialogPrimitive.Title>
            </div>
            {showClose ? (
              <DialogPrimitive.Close
                className="sv-icon-btn -mr-2.5"
                aria-label={closeLabel}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </DialogPrimitive.Close>
            ) : null}
          </div>
          {typeof children === 'function' ? children(api) : children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

'use client';

import { clsx } from 'clsx';
import {
  lazy,
  Suspense,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { PopoverSurfaceProps } from './Popover';

// The popover module (Radix Popover + @floating-ui) is never in a page's
// initial bundle: React.lazy loads it on the trigger's first pointerdown,
// focus or keydown, and pointerenter / touchstart prefetch it (spec §4
// rule 2). React.lazy rather than next/dynamic: the surface only renders
// after a reader acts, on the client, and next/dynamic's loader runtime
// would otherwise ride in every page's initial JS (spec §6.10). If the
// chunk can't load (offline), the trigger simply does nothing rather than
// breaking the page.
//
// The trigger's classes are joined with clsx, not tailwind-merge (about
// 8 KB gzip kept out of the initial JS), so `triggerClassName` must not
// set a cursor of its own. The panel's classes are merged inside the
// lazily loaded PopoverSurface, as before.
const load = () => import('./Popover');
const PopoverSurface = lazy<ComponentType<PopoverSurfaceProps>>(() =>
  load()
    .then((m) => ({ default: m.PopoverSurface }))
    .catch(() => ({ default: Nothing })),
);
function Nothing() {
  return null;
}

/**
 * A popover that loads on first use (spec §4 rule 2, §4.14): the ticker's
 * ⓘ, `Stamp withInfo`, the ShareBar's "More", the `LiveChip` ⓘ.
 *
 * Renders a plain `<button>` with the page (`trigger` is its content).
 * `label` is the accessible name of both the button and the popover, so
 * an icon-only trigger is named and a visible word stays in the name
 * ("More" → "More ways to share"). The button carries aria-haspopup,
 * aria-expanded and, while open, aria-controls.
 *
 * Keyboard: Enter or Space opens it (the module loads on the keydown and
 * opens as soon as it arrives), Tab moves through it, Escape closes it and
 * returns focus to the trigger. A click elsewhere closes it.
 *
 * `open` / `onOpenChange` make it controlled; otherwise it keeps its own
 * state. `children` are the popover's content (server content is fine).
 */
export function LazyPopover({
  trigger,
  label,
  children,
  side,
  align,
  triggerClassName,
  className,
  lang,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  /** Accessible name of the trigger and the popover. */
  label: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Classes for the trigger button (e.g. "sv-icon-btn"). */
  triggerClassName?: string;
  /** Classes for the popover panel. */
  className?: string;
  lang?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [wanted, setWanted] = useState(false);
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  const want = () => {
    if (!wanted) setWanted(true);
  };
  const prefetch = () => {
    void load().catch(() => undefined);
  };

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        className={clsx('cursor-pointer', triggerClassName)}
        lang={lang}
        onPointerEnter={prefetch}
        onTouchStart={prefetch}
        onPointerDown={want}
        onFocus={want}
        onKeyDown={want}
        onClick={() => {
          want();
          setOpen(!isOpen);
        }}
      >
        {trigger}
      </button>
      {wanted || isOpen ? (
        <Suspense fallback={null}>
          <PopoverSurface
            open={isOpen}
            onOpenChange={setOpen}
            anchorRef={ref}
            contentId={id}
            label={label}
            side={side}
            align={align}
            className={className}
            lang={lang}
          >
            {children}
          </PopoverSurface>
        </Suspense>
      ) : null}
    </>
  );
}

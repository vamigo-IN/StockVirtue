'use client';

import {
  lazy,
  Suspense,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import type { DialogApi, DialogSurfaceProps, DialogVariant } from './Dialog';

export type { DialogApi, DialogVariant } from './Dialog';

// The dialog module (Radix Dialog, its focus scope and scroll lock) is
// never in a page's initial bundle: React.lazy loads it on the trigger's
// first pointerdown, focus or keydown, and pointerenter / touchstart
// prefetch it (spec §4 rule 2). React.lazy rather than next/dynamic: the
// surface only renders after a reader acts, on the client, and next/dynamic's
// loader runtime would otherwise ride in every page's initial JS (spec
// §6.10). If the chunk can't load (offline), the trigger does nothing
// rather than breaking the page.
//
// No class merging here: DialogSurface merges its own classes with
// `className`, so this file stays free of tailwind-merge (about 8 KB gzip
// that would otherwise sit in the initial JS of every public page).
const load = () => import('./Dialog');
const DialogSurface = lazy<ComponentType<DialogSurfaceProps>>(() =>
  load()
    .then((m) => ({ default: m.DialogSurface }))
    .catch(() => ({ default: Nothing })),
);
function Nothing() {
  return null;
}

/**
 * A dialog or sheet that loads on first use (spec §4 rule 2, §4.14): the
 * phone drawer (`variant="right"`), the legal Contents sheet
 * (`variant="bottom"`), any centred dialog (`variant="center"`).
 *
 * Renders a plain `<button>` with the page (`trigger` is its content;
 * `triggerLabel` names an icon-only one). It has aria-haspopup="dialog",
 * aria-expanded and, only while open, aria-controls. The dialog module
 * loads on the first pointerdown, focus or keydown and opens as soon as it
 * arrives; its content mounts only while open.
 *
 * Radix gives the focus trap, Escape, the scroll lock and aria-hidden on
 * the rest of the page; on close, focus returns to the trigger, unless the
 * content closed it with `close(after)`, in which case `after` moves focus.
 *
 * `children` may be a function of `{ close }` (client callers only:
 * functions can't come from a server component). `open` / `onOpenChange`
 * make it controlled (the drawer closes itself on route changes).
 */
export function LazyDialog({
  trigger,
  title,
  children,
  variant = 'center',
  triggerLabel,
  triggerClassName,
  triggerHidden,
  hideTitle,
  headerStart,
  showClose,
  closeLabel,
  className,
  lang,
  open,
  onOpenChange,
}: {
  trigger: ReactNode;
  /** The dialog's title (Radix Dialog.Title); its accessible name. */
  title: ReactNode;
  children: ReactNode | ((api: DialogApi) => ReactNode);
  variant?: DialogVariant;
  /** aria-label for an icon-only trigger ("Menu"). */
  triggerLabel?: string;
  /** Classes for the trigger (default: a secondary button). */
  triggerClassName?: string;
  /** Hide the trigger (the legal Contents button before 600 px of scroll). */
  triggerHidden?: boolean;
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
  /** Shown before the title in the top row (the drawer's logo). */
  headerStart?: ReactNode;
  /** Show the close button in the top row (default true). */
  showClose?: boolean;
  /** The close button's aria-label (default "Close"). */
  closeLabel?: string;
  /** Classes for the dialog panel. */
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
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        className={triggerClassName ?? 'sv-btn sv-btn-secondary'}
        hidden={triggerHidden}
        lang={lang}
        onPointerEnter={prefetch}
        onTouchStart={prefetch}
        onPointerDown={want}
        onFocus={want}
        onKeyDown={want}
        onClick={() => {
          want();
          setOpen(true);
        }}
      >
        {trigger}
      </button>
      {wanted || isOpen ? (
        <Suspense fallback={null}>
          <DialogSurface
            open={isOpen}
            onOpenChange={setOpen}
            triggerRef={ref}
            contentId={id}
            title={title}
            hideTitle={hideTitle}
            headerStart={headerStart}
            showClose={showClose}
            closeLabel={closeLabel}
            variant={variant}
            className={className}
            lang={lang}
          >
            {children}
          </DialogSurface>
        </Suspense>
      ) : null}
    </>
  );
}

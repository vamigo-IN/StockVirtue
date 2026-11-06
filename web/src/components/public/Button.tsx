import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';
import { clsx } from 'clsx';

/**
 * Buttons and links (spec §4.6). Server-safe: no hooks and no client
 * imports, so the root 404 and any server component can use them. Links
 * are plain `<a>`; for client-side navigation put the exported class
 * names on a `next/link` instead:
 *   <Link href="/news" className={buttonClass({ variant: 'secondary' })}>…</Link>
 *   <Link href="/features#wont-do" className={quietLinkClass}>Why these limits<QuietArrow /></Link>
 *
 * Variants (the styles live in public.css, `.sv-btn*`):
 * - primary: `--sv-green-700`, white `title` text at 15/20, 640; hover
 *   `--sv-green-800`. One primary action per view (R13).
 * - secondary: white, a 1 px control border, ink text; hover surface-2.
 *   On the stage and in the footer it turns transparent with light text.
 * - stage: `--sv-green-400` with ink text, hover #6EE7A0: the only button
 *   on the dark stage.
 * Sizes: md 44 px (default), lg 48, sm 36 (still a 44 px hit area).
 * Radius 8, padding-inline 18; pressed moves 1 px; disabled is 40%.
 * Name buttons after what happens, in sentence case ("Send message").
 */
/** primary: #0B7A4B on light, neon inside .sv-emerald/.sv-terminal; stage and neon: the neon pill anywhere; secondary: the outline pill. */
export type ButtonVariant = 'primary' | 'secondary' | 'stage' | 'neon';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * The class names of a button, for a `next/link` or another element.
 * Classes are joined with clsx, not tailwind-merge (about 8 KB gzip kept
 * out of the forms' initial JS on /contact and /privacy/requests; spec
 * §6.10): the base classes are component classes, so nothing needs merging.
 */
export function buttonClass({
  variant = 'primary',
  className,
}: {
  variant?: ButtonVariant;
  className?: string;
} = {}): string {
  return clsx('sv-btn', `sv-btn-${variant}`, className);
}

type Common = {
  variant: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
};

export type ButtonLinkProps = Common & {
  href: string;
  /** Opens in a new tab with rel="noopener" (the Play Store). */
  external?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>;

export type ButtonProps =
  | (Common & {
      href?: undefined;
      external?: never;
    } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'>)
  | ButtonLinkProps;

/**
 * A `<button>` (default `type="button"`), or, with `href`, a ButtonLink.
 */
export function Button(props: ButtonProps) {
  if (props.href !== undefined) return <ButtonLink {...props} />;
  const { variant, size = 'md', className, children, type, ...rest } = props;
  return (
    <button
      type={type ?? 'button'}
      className={buttonClass({ variant, className })}
      data-size={size === 'md' ? undefined : size}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A link styled as a button. `external` adds target="_blank" rel="noopener". */
export function ButtonLink({
  variant,
  size = 'md',
  href,
  external = false,
  className,
  children,
  target,
  rel,
  ...rest
}: ButtonLinkProps) {
  return (
    <a
      href={href}
      className={buttonClass({ variant, className })}
      data-size={size === 'md' ? undefined : size}
      target={external ? '_blank' : target}
      rel={external ? (rel ?? 'noopener') : rel}
      {...rest}
    >
      {children}
    </a>
  );
}

/** The quiet link's class names (ink text, a 2 px green underline). */
export const quietLinkClass = 'sv-quiet';

/**
 * The quiet link's arrow: lucide ArrowRight at 14 px, aria-hidden, glued
 * to the last word by a word joiner so it never wraps onto a line alone.
 */
export function QuietArrow() {
  return (
    <span className="sv-quiet-tail">
      {'⁠'}
      <svg
        className="sv-quiet-arrow"
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </span>
  );
}

/**
 * A quiet link (spec §4.6): ink text with a 2 px `--sv-green-700`
 * underline 4 px below (3 px on hover), and an arrow unless `arrow` is
 * false. For "Read the news", "More from Markets", "Why these limits" and
 * in-content links. `external` opens a new tab (rel="noopener").
 */
export function QuietLink({
  href,
  arrow = true,
  external = false,
  className,
  children,
  target,
  rel,
  ...rest
}: {
  href: string;
  arrow?: boolean;
  external?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) {
  return (
    <a
      href={href}
      // With its arrow it stands alone (a call to action, not running
      // text), so it gets the 44 px touch hit area.
      className={clsx(quietLinkClass, arrow && 'sv-quiet-hit', className)}
      target={external ? '_blank' : target}
      rel={external ? (rel ?? 'noopener') : rel}
      {...rest}
    >
      {children}
      {arrow ? <QuietArrow /> : null}
    </a>
  );
}

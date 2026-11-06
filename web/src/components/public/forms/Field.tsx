import {
  Children,
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { clsx } from 'clsx';

/**
 * Form fields (spec §4.12): contact, privacy requests, search. No hooks and
 * no client imports, so they work in server components (the GET search
 * form) and in the client forms alike. The global 2 px `--sv-focus`
 * outline is the focus style (no box-shadow ring).
 *
 * ```tsx
 * <Field id="pr-email" label="Your email address" hint="We send a code to it.">
 *   <Input type="email" name="email" autoComplete="email" inputMode="email" required />
 * </Field>
 * ```
 * Field gives its one control the id, links the hint and the error through
 * `aria-describedby` and sets `aria-invalid` with an error. Keep the
 * existing ids (#pr-email #pr-code #pr-name #pr-type #pr-details), the
 * honeypot `company` (aria-hidden, tabIndex -1) and the button labels.
 * The form-level message is a FormMessage inside the <form>. The submit
 * button is full width below 640 px: `className="w-full sm:w-auto"`.
 *
 * Classes are joined with clsx, not tailwind-merge (about 8 KB gzip kept
 * out of /contact's and /privacy/requests' initial JS; spec §6.10): the
 * base classes are component classes, so nothing needs merging.
 */

function idsFor(id: string, hint: boolean, error: boolean, own?: string): string | undefined {
  const parts = [own, hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/**
 * The label above (`small` 14/20, 640, ink), the control, the hint below
 * (`meta`, `--sv-fg-3`) and the field's own error (`meta`, `--sv-danger`).
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  /** The control's id (the label's htmlFor). */
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  /** This field's error, shown under it; the border turns `--sv-danger`. */
  error?: ReactNode;
  /** One Input, Textarea or Select. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
}) {
  const only = Children.only(children);
  const control = isValidElement(only)
    ? cloneElement(only, {
        id,
        'aria-describedby': idsFor(id, Boolean(hint), Boolean(error), only.props['aria-describedby']),
        'aria-invalid': error ? true : only.props['aria-invalid'],
      })
    : only;
  return (
    <div className={clsx('sv-field', className)}>
      <label htmlFor={id} className="sv-field-label">
        {label}
      </label>
      {control}
      {hint ? (
        <p id={`${id}-hint`} className="t-meta text-fg-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="t-meta text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A 48 px text input on white: 16 px text (no iOS zoom), radius 8. */
export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('sv-input', className)} {...props} />;
}

/** A textarea, at least 160 px tall. */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('sv-input sv-textarea', className)} {...props} />;
}

/** A native <select> with a ChevronDown (lucide's path) drawn over it. */
export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="sv-select">
      <select className={clsx('sv-input', className)} {...props}>
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}

/** A 20 px checkbox with its label beside it (additive). */
export function Checkbox({
  id,
  label,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { id: string; label: ReactNode }) {
  return (
    <div className={clsx('sv-check', className)}>
      <input id={id} type="checkbox" {...props} />
      <label htmlFor={id} className="t-small text-fg">
        {label}
      </label>
    </div>
  );
}

/**
 * The form-level message, inside the <form>:
 * - `tone="error"`: role="alert", `--sv-danger` text with lucide's
 *   CircleAlert drawn inline;
 * - `tone="success"`: role="status", a `--sv-green-050` panel with
 *   `--sv-green-900` text ("Request received." appears once).
 */
export function FormMessage({
  tone,
  children,
  className,
}: {
  tone: 'error' | 'success';
  children: ReactNode;
  className?: string;
}) {
  if (tone === 'success') {
    return (
      <div role="status" className={clsx('sv-form-ok t-body', className)}>
        {children}
      </div>
    );
  }
  return (
    <div role="alert" className={clsx('sv-form-err t-small', className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </svg>
      <div>{children}</div>
    </div>
  );
}

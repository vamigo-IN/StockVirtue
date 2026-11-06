import { createElement, type HTMLAttributes, type JSX } from 'react';
import { APP_FACTS, withFacts, type FactId } from '@/content/app';
import type { Fact, Inline, LiveValues } from '@/content/site/types';
import { inlineText, RichInline } from './RichInline';

/**
 * A fact-bearing slot (W7 addendum §1.4, §3.1): `{ value, facts, fallback? }`
 * rendered through `withFacts` (src/content/app.ts). While every tagged fact
 * is confirmed it shows `value`; otherwise `fallback`, and a null (or absent)
 * fallback renders nothing at all, the element included. An id that isn't a
 * fact (F1–F42) counts as unconfirmed.
 *
 *   <FactText as="p" className="t-lead" field={content.hero.lead} />
 *   <FactText as="h2" field={content.learning.title} />
 *   <FactText as="p" field={answer} values={values} />   // fact<inline>, tokens resolved
 *
 * A string value renders as text; an `Inline` value through RichInline.
 * Without `as` it renders a fragment and ignores the HTML attributes.
 * Server-safe.
 */

/** The value to show, or null when the slot is dropped. */
export function factValue<V>(field: Fact<V> | null | undefined): V | null {
  if (!field || typeof field !== 'object' || !('value' in field)) return null;
  const fallback = field.fallback ?? null;
  const ids: unknown[] = Array.isArray(field.facts) ? field.facts : [];
  const known = ids.every(
    (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(APP_FACTS, id),
  );
  return known ? withFacts(ids as FactId[], field.value, fallback) : fallback;
}

/** The plain text a fact slot shows (inline values flattened), or null when it is dropped. */
export function factText(
  field: Fact<string> | Fact<Inline> | null | undefined,
  values?: LiveValues | null,
): string | null {
  const v = factValue<string | Inline>(field as Fact<string | Inline> | null | undefined);
  if (v === null) return null;
  if (typeof v === 'string') return v;
  return Array.isArray(v) ? inlineText(v, values) : null;
}

export type FactTextProps = {
  field: Fact<string> | Fact<Inline> | null | undefined;
  /** The element to render; it is dropped with the slot. */
  as?: keyof JSX.IntrinsicElements;
  /** Token values for an inline value. */
  values?: LiveValues | null;
  /** A class for the links of an inline value. */
  linkClassName?: string;
} & HTMLAttributes<HTMLElement>;

export function FactText({ field, as, values, linkClassName, ...rest }: FactTextProps) {
  const v = factValue<string | Inline>(field as Fact<string | Inline> | null | undefined);
  if (v === null) return null;
  const body =
    typeof v === 'string' ? (
      v
    ) : Array.isArray(v) ? (
      <RichInline value={v} values={values} linkClassName={linkClassName} />
    ) : null;
  if (body === null) return null;
  return as ? createElement(as, rest, body) : <>{body}</>;
}

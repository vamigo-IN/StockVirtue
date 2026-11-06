/**
 * Published content over a page's built-in default (W7 addendum §3.11). The
 * API is the real validator; this only guarantees that a page never renders
 * `undefined` or a value of the wrong type, whatever arrives:
 *
 * - objects merge key by key over the DEFAULT's keys; keys the default
 *   doesn't have are ignored (so a default lists every key, optional ones
 *   as null, '' or []);
 * - a string, number or boolean is taken when it has the default's type,
 *   else the default's value is kept;
 * - a list is taken whole when it is an array of the default list's item
 *   type (objects, strings, arrays …; an empty default list takes objects),
 *   else the default list is kept. Items are not merged one by one;
 * - a `null` default (an absent screen, photo or founder letter) takes an
 *   object or null;
 * - a fact field (`{ value, facts, fallback? }`) is one unit: taken whole
 *   when its value has the default value's type, its facts are strings and
 *   its fallback is absent, null or of the value's type; else the default
 *   fact is kept (so a value is never paired with another version's tags).
 *
 * Pure; never mutates its arguments. `mergeContent(d, d)` deep-equals `d`.
 */

type Rec = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A fact field: an object with a `value` and a `facts` array. */
export function isFactField(v: unknown): v is { value: unknown; facts: unknown[]; fallback?: unknown } {
  return isPlainObject(v) && 'value' in v && Array.isArray(v.facts);
}

type Shape = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null' | 'other';

function shapeOf(v: unknown): Shape {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (isPlainObject(v)) return 'object';
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v) ? 'number' : 'other';
  return t === 'string' || t === 'boolean' ? t : 'other';
}

/** `p` is a list the default list `d` accepts whole. */
function acceptsList(d: unknown[], p: unknown): p is unknown[] {
  if (!Array.isArray(p)) return false;
  const want: Shape = d.length > 0 ? shapeOf(d[0]) : 'object';
  return p.every((item) => shapeOf(item) === want);
}

/** `p` is a fact field the default fact `d` accepts whole. */
function acceptsFact(d: { value: unknown }, p: unknown): p is { value: unknown; facts: string[]; fallback?: unknown } {
  if (!isFactField(p)) return false;
  if (!p.facts.every((f) => typeof f === 'string')) return false;
  const valueOk = Array.isArray(d.value)
    ? acceptsList(d.value, p.value)
    : shapeOf(p.value) === shapeOf(d.value);
  if (!valueOk) return false;
  const fb = p.fallback;
  if (fb === undefined || fb === null) return true;
  return Array.isArray(d.value) ? acceptsList(d.value, fb) : shapeOf(fb) === shapeOf(d.value);
}

function merge(d: unknown, p: unknown): unknown {
  if (p === undefined) return d;
  if (isFactField(d)) {
    if (!acceptsFact(d, p)) return d;
    const out: Rec = { value: p.value, facts: p.facts };
    if (p.fallback !== undefined) out.fallback = p.fallback;
    return out;
  }
  if (Array.isArray(d)) return acceptsList(d, p) ? p : d;
  if (isPlainObject(d)) {
    if (!isPlainObject(p)) return d;
    const out: Rec = {};
    for (const key of Object.keys(d)) out[key] = merge(d[key], p[key]);
    return out;
  }
  if (d === null) return p === null || isPlainObject(p) ? p : d;
  return shapeOf(p) === shapeOf(d) ? p : d;
}

/** The published content merged over `defaultValue` (see above). */
export function mergeContent<T>(defaultValue: T, published: unknown): T {
  return merge(defaultValue, published) as T;
}

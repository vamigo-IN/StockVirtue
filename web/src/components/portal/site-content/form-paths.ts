/**
 * Paths into site content, as the API names fields in its errors:
 * "hero.title", "items[2].lead", "body.content[3]" (W7 addendum §7.2). The
 * limits in src/content/site/limits.ts use the same paths with `[]` for
 * "each item" ("items[].lead").
 */

export type Seg = string | number;

export function parsePath(p: string): Seg[] {
  const out: Seg[] = [];
  for (const part of p.split('.')) {
    if (!part) continue;
    const m = /^([^[\]]*)((?:\[\d*\])*)$/.exec(part);
    if (!m) {
      out.push(part);
      continue;
    }
    if (m[1]) out.push(m[1]);
    for (const idx of m[2].match(/\[(\d*)\]/g) ?? []) {
      const n = idx.slice(1, -1);
      out.push(n === '' ? -1 : Number(n));
    }
  }
  return out;
}

export function joinPath(segs: readonly Seg[]): string {
  let s = '';
  for (const seg of segs) {
    if (typeof seg === 'number') s += seg < 0 ? '[]' : `[${seg}]`;
    else s += s ? `.${seg}` : seg;
  }
  return s;
}

/** The limits' path of a value path: every index becomes "[]". */
export function rulePath(segs: readonly Seg[]): string {
  return joinPath(segs.map((s) => (typeof s === 'number' ? -1 : s)));
}

export function getAt(obj: unknown, segs: readonly Seg[]): unknown {
  let v: unknown = obj;
  for (const s of segs) {
    if (v === null || v === undefined) return undefined;
    v = (v as Record<string | number, unknown>)[s];
  }
  return v;
}

/** A copy of `obj` with `value` at `segs` (arrays and objects copied along the way). */
export function setAt<T>(obj: T, segs: readonly Seg[], value: unknown): T {
  if (segs.length === 0) return value as T;
  const [head, ...rest] = segs;
  const cur = (obj ?? (typeof head === 'number' ? [] : {})) as Record<string | number, unknown> | unknown[];
  const next = setAt((cur as Record<string | number, unknown>)[head], rest, value);
  if (Array.isArray(cur)) {
    const copy = cur.slice();
    copy[head as number] = next;
    return copy as unknown as T;
  }
  return { ...(cur as Record<string, unknown>), [head]: next } as T;
}

/** Whether an error path is at or inside a field path. */
export function pathWithin(errorPath: string, fieldPath: string): boolean {
  return errorPath === fieldPath || errorPath.startsWith(`${fieldPath}.`) || errorPath.startsWith(`${fieldPath}[`);
}

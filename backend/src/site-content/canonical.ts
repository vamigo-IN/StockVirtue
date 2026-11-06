import { createHash } from 'node:crypto';

/**
 * Canonical JSON: object keys sorted, no whitespace, `undefined` dropped.
 * Revisions are hashed from it (no-op detection, history), and the 90 KB
 * size limit is measured on it (W7 addendum §2.3, §4.1).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** SHA-256 (hex) of the canonical JSON. */
export const contentHash = (value: unknown): string =>
  createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');

/** The canonical JSON's size in UTF-8 bytes. */
export const jsonBytes = (value: unknown): number =>
  Buffer.byteLength(canonicalJson(value), 'utf8');

/** A draft or revision may be at most this big (UTF-8 bytes of canonical JSON). */
export const MAX_CONTENT_BYTES = 90 * 1024;

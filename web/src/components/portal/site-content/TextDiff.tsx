'use client';

import { diffWords } from 'diff';
import { useMemo } from 'react';

/** A word diff of two texts: insertions green, deletions red (the article history's style). */
export function TextDiff({ before, after, empty = 'No change.' }: { before: string; after: string; empty?: string }) {
  const parts = useMemo(() => (before === after ? [] : diffWords(before, after)), [before, after]);
  if (before === after) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i} className="rounded-sm bg-success/15 text-success no-underline decoration-transparent">
            {p.value}
          </ins>
        ) : p.removed ? (
          <del key={i} className="rounded-sm bg-destructive/10 text-destructive">
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}

/** Only the changed lines of two multi-line texts, with a little context, as word diffs. */
export function ChangedLines({ before, after, max = 12 }: { before: string; after: string; max?: number }) {
  const rows = useMemo(() => {
    const a = before.split('\n');
    const b = after.split('\n');
    const out: { before: string; after: string }[] = [];
    const n = Math.max(a.length, b.length);
    if (a.length === b.length) {
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) out.push({ before: a[i] ?? '', after: b[i] ?? '' });
      return out;
    }
    // Different block counts: lines that exist on one side only.
    const setA = new Set(a);
    const setB = new Set(b);
    for (const l of a) if (l && !setB.has(l)) out.push({ before: l, after: '' });
    for (const l of b) if (l && !setA.has(l)) out.push({ before: '', after: l });
    return out;
  }, [before, after]);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No change.</p>;
  return (
    <ol className="space-y-2">
      {rows.slice(0, max).map((r, i) => (
        <li key={i} className="rounded-md border bg-muted/20 p-2">
          <TextDiff before={r.before} after={r.after} />
        </li>
      ))}
      {rows.length > max && <li className="text-xs text-muted-foreground">and {rows.length - max} more changed blocks</li>}
    </ol>
  );
}

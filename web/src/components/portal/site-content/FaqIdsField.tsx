'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { FAQ_DEFAULT } from '@/content/site/faq';
import type { FaqContent } from '@/content/site/types';
import { mergeContent } from '@/lib/site-content/merge';
import { useSiteItem } from '@/portal/queries';
import { FieldShell } from './fields';
import type { CustomFieldProps } from './SchemaForm';

/**
 * The download page's "Before you install" questions (W7 addendum §3.6):
 * FAQ question ids, picked from the published FAQ, or from its built-in
 * questions while it isn't published (a draft FAQ doesn't count: the page
 * quotes what /faq shows). A question the FAQ no longer has is flagged,
 * because the page skips it.
 */
export function FaqIdsField({ id, label, help, rule, disabled, error, locked, value, onChange }: CustomFieldProps) {
  const faq = useSiteItem('faq');
  const live = faq.data?.live?.content;
  const groups = useMemo(() => {
    const content = live ? mergeContent<FaqContent>(FAQ_DEFAULT, live) : FAQ_DEFAULT;
    return content.groups.map((g) => ({ title: g.title, items: g.items.map((q) => ({ id: q.id, question: q.question })) }));
  }, [live]);
  const known = useMemo(() => new Map(groups.flatMap((g) => g.items.map((q) => [q.id, q.question] as const))), [groups]);
  const ids = Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  const [min, max] = rule?.count ?? [1, 4];
  const off = disabled || locked;
  const missing = ids.filter((x) => !known.has(x));

  const move = (i: number, d: -1 | 1) => {
    const next = ids.slice();
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  const nextFree = groups.flatMap((g) => g.items).find((q) => !ids.includes(q.id))?.id;

  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      locked={locked}
      counter={
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {ids.length} ({min}–{max})
        </span>
      }
      aside={
        missing.length > 0 ? (
          <p className="text-xs text-warning">
            Not in the {live ? 'published' : 'built-in'} FAQ, so the page skips {missing.length === 1 ? 'it' : 'them'}:{' '}
            {missing.join(', ')}.
          </p>
        ) : null
      }
    >
      <ol className="space-y-2">
        {ids.map((qid, i) => (
          <li key={`${i}-${qid}`} className="flex items-center gap-1">
            <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <select
              id={i === 0 ? id : `${id}-${i}`}
              aria-label={`${label}: question ${i + 1}`}
              value={qid}
              disabled={off}
              onChange={(e) => onChange(ids.map((x, j) => (j === i ? e.target.value : x)))}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            >
              {!known.has(qid) && <option value={qid}>{qid} (not in the FAQ)</option>}
              {groups.map((g) => (
                <optgroup key={g.title} label={g.title}>
                  {g.items.map((q) => (
                    <option key={q.id} value={q.id} disabled={q.id !== qid && ids.includes(q.id)}>
                      {q.question}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {!off && (
              <>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move question ${i + 1} up`}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(i, 1)} disabled={i === ids.length - 1} aria-label={`Move question ${i + 1} down`}>
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onChange(ids.filter((_, j) => j !== i))}
                  disabled={ids.length <= min}
                  aria-label={`Remove question ${i + 1}`}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
      </ol>
      {!off && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => nextFree && onChange([...ids, nextFree])}
          disabled={ids.length >= max || !nextFree}
        >
          <Plus /> Add a question
        </Button>
      )}
    </FieldShell>
  );
}

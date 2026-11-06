'use client';

import { TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { LintWarning } from './copy-lint';

const isBodyPath = (p: string) => p === 'body' || p.startsWith('body.') || p.startsWith('body[');

/** The form field's element id for an API or lint path ("hero.lead" → "f-hero-lead"). */
export const fieldDomId = (path: string) => `f-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`;

/**
 * Where a lint path's control is: the field itself, or the nearest enclosing
 * field (a fact's fallback, a list item's text).
 */
function targetOf(path: string): HTMLElement | null {
  let p = path;
  while (p) {
    const el = document.getElementById(fieldDomId(p));
    if (el) return el;
    const cut = Math.max(p.lastIndexOf('.'), p.lastIndexOf('['));
    if (cut <= 0) break;
    p = p.slice(0, cut);
  }
  return null;
}

/** The copy checks under the form (W7 addendum §8.8): advisory, each linked to its field. */
export function LintPanel({ warnings }: { warnings: LintWarning[] }) {
  if (!warnings.length) {
    return <p className="text-sm text-muted-foreground">Copy checks: nothing to flag.</p>;
  }
  return (
    <Card className="gap-3 border-warning/40">
      <CardHeader>
        <CardTitle className="text-base">Copy checks ({warnings.length})</CardTitle>
        <CardDescription>Suggestions from the style guide. They never block a publish.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 text-sm">
          {warnings.slice(0, 30).map((w) => {
            const linked = !!w.path && !isBodyPath(w.path);
            return (
              <li key={`${w.path}|${w.message}`} className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  {w.message}
                  {linked && (
                    <>
                      {' '}
                      <button
                        type="button"
                        className="text-primary underline-offset-4 hover:underline"
                        onClick={() => {
                          const el = targetOf(w.path);
                          el?.scrollIntoView({ block: 'center' });
                          el?.focus?.();
                        }}
                      >
                        Go to the field
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
          {warnings.length > 30 && <li className="text-muted-foreground">and {warnings.length - 30} more</li>}
        </ul>
      </CardContent>
    </Card>
  );
}

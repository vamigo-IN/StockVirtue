'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';
import { RowsSkeleton } from '@/components/portal/common';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSourceItem } from '@/portal/queries';

/** An item's AI draft, read before anyone starts a story from it. */
export function DraftPreviewDialog({
  itemId,
  onOpenChange,
  onUse,
  busy,
}: {
  itemId: string | null;
  onOpenChange: (open: boolean) => void;
  onUse: (aiJobId: string) => void;
  busy: boolean;
}) {
  const item = useSourceItem(itemId);
  const d = item.data?.draft;
  const out = d?.output;
  const removed = d?.checks?.removed ?? [];
  return (
    <Dialog open={!!itemId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>AI draft</DialogTitle>
          <DialogDescription>
            Written by the AI from {item.data?.source.name ?? 'the source'}
            {d?.model ? ` (${d.model})` : ''}. Starting a story makes it your
            draft: check every fact against the source before sending it for
            review.
          </DialogDescription>
        </DialogHeader>
        {!item.data ? (
          <RowsSkeleton rows={4} />
        ) : !out ? (
          <p className="text-sm text-muted-foreground">
            This item has no finished AI draft.
          </p>
        ) : (
          <div className="space-y-4">
            {removed.length > 0 && (
              <Alert className="border-warning/40 bg-warning/5">
                <AlertTriangle className="text-warning" />
                <AlertDescription>
                  <p>
                    The automatic checks removed {removed.length}{' '}
                    {removed.length === 1 ? 'sentence' : 'sentences'}:
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                    {removed.map((r, i) => (
                      <li key={i}>
                        “{r.text}” —{' '}
                        {r.reason === 'figures'
                          ? `${r.figures?.join(', ')} isn’t in the source`
                          : 'wording copied from the source'}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="rounded-lg border p-4">
              <p className="font-display text-xl leading-snug font-semibold">
                {out.headline || item.data.title}
              </p>
              {out.standfirst && (
                <p className="mt-1 text-muted-foreground">{out.standfirst}</p>
              )}
              {out.keyPoints.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {out.keyPoints.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 space-y-3 text-sm leading-relaxed">
                {out.sections.map((s, i) => (
                  <div key={i} className="space-y-2">
                    {s.heading && <p className="font-semibold">{s.heading}</p>}
                    {s.paragraphs.map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {item.data.url && (
              <a
                href={item.data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
              >
                Read the original <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Close
          </Button>
          {d && (
            <Button onClick={() => onUse(d.id)} disabled={busy}>
              {busy ? 'Starting…' : 'Start a story from this draft'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

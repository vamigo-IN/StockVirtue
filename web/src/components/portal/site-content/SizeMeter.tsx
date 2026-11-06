'use client';

import { cn } from '@/lib/utils';
import { MAX_CONTENT_BYTES } from '@/portal/site-content';

/**
 * "Size 38 / 90 KB" (W7 addendum §4.1): the draft's canonical JSON in UTF-8
 * bytes against the 90 KB cap that keeps every save under the API's 100 KB
 * body limit. Amber from 80 %; Hindi text is 3 bytes a character.
 */
export function SizeMeter({ bytes }: { bytes: number }) {
  const kb = bytes / 1024;
  const share = bytes / MAX_CONTENT_BYTES;
  const over = share > 1;
  const near = !over && share >= 0.8;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span
        className={cn('tabular-nums', near && 'text-warning', over && 'font-medium text-destructive')}
        title="The page's stored size. Above 90 KB it can't be saved."
      >
        Size {kb < 10 ? kb.toFixed(1) : Math.round(kb)} / {MAX_CONTENT_BYTES / 1024} KB
      </span>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span
          className={cn('block h-full rounded-full bg-primary/60', near && 'bg-warning', over && 'bg-destructive')}
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </span>
      {over && <span className="text-destructive">Too large to save. Shorten it, or split it into two pages.</span>}
    </div>
  );
}

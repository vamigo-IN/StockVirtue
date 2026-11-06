'use client';

import { AlertCircle, Check, ExternalLink, History, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/portal/format';
import { cn } from '@/lib/utils';
import type { SaveState } from './useItemEditor';

/** "Saved · Unsaved changes · Saving… · Couldn't save. Retry" (the article editor's indicator). */
export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  switch (state.kind) {
    case 'saved':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground" title={state.at ? formatDateTime(state.at) : undefined} aria-live="polite">
          <Check className="size-3.5 text-success" /> Saved
        </span>
      );
    case 'dirty':
      return (
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Unsaved changes
        </span>
      );
    case 'saving':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </span>
      );
    case 'error':
      return (
        <button type="button" onClick={onRetry} title={state.message} className="flex items-center gap-1 text-xs text-destructive hover:underline">
          <AlertCircle className="size-3.5" /> Couldn&apos;t save. Retry
        </button>
      );
    case 'conflict':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive" aria-live="polite">
          <AlertCircle className="size-3.5" /> Changed elsewhere
        </span>
      );
  }
}

export interface StatusInfo {
  label: string;
  tone: 'default' | 'success' | 'warning' | 'muted';
}

const TONES: Record<StatusInfo['tone'], string> = {
  default: '',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  muted: 'border-border bg-muted text-muted-foreground',
};

export function StatusBadges({ items }: { items: StatusInfo[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {items.map((s) => (
        <Badge key={s.label} variant="outline" className={cn('font-medium', TONES[s.tone])}>
          {s.label}
        </Badge>
      ))}
    </span>
  );
}

/** The editor's top bar: status, save state, and the item's actions. */
export function EditorBar({
  state,
  onRetry,
  badges,
  historyHref,
  liveHref,
  children,
}: {
  state: SaveState;
  onRetry: () => void;
  badges: StatusInfo[];
  historyHref?: string;
  liveHref?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
      <StatusBadges items={badges} />
      <SaveIndicator state={state} onRetry={onRetry} />
      <div className="flex-1" />
      {historyHref && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={historyHref}>
            <History /> History
          </Link>
        </Button>
      )}
      {liveHref && (
        <Button variant="ghost" size="sm" asChild>
          <a href={liveHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> View live
          </a>
        </Button>
      )}
      {children}
    </div>
  );
}

/** "Someone else saved this page after you opened it" with "Reload the latest version". */
export function ConflictAlert({ onReload }: { onReload: () => void }) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle />
      <AlertTitle>Someone else saved this page after you opened it</AlertTitle>
      <AlertDescription>
        <p>Reload to get their changes. Anything you typed here since your last save will be lost.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onReload}>
          <RefreshCw /> Reload the latest version
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** The sticky "You have unsaved changes" bar (as in Settings and the article editor). */
export function UnsavedBar({ busy, onSave, note }: { busy: boolean; onSave: () => void; note?: string | null }) {
  return (
    <>
      {/* Room under the page, so the bar never covers its last controls. */}
      <div aria-hidden className="h-24" />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm text-muted-foreground">
            {note ? `You have unsaved changes. ${note}` : 'You have unsaved changes. They are saved as a draft in a few seconds.'}
          </p>
          <Button onClick={onSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save draft'}
          </Button>
        </div>
      </div>
    </>
  );
}

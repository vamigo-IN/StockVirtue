'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BellRing, Loader2, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/portal/api';
import { formatCount, formatDateTime } from '@/portal/format';
import { invalidateArticles, qk } from '@/portal/queries';
import type { ArticleDetail, ArticleNotification } from '@/portal/types';

/** Who gets it: the breaking-news audience (backend news-push.service.ts). */
const AUDIENCE = 'app readers with breaking news alerts on';
/** While one is on its way, look again this often (the worker sends every 30 s). */
const POLL_MS = 10_000;
const POLL_TRIES = 30;

const readers = (n: number) => `${formatCount(n)} ${n === 1 ? 'reader' : 'readers'}`;

/**
 * The Placement card's notification to app readers (owner, 6 Nov 2026: a
 * story that isn't breaking news may notify readers too). Before a story is
 * live: "Send a notification when published", kept through scheduling.
 * Once live: "Send notification now", confirmed first. Afterwards: what was
 * sent. A story sends one notification, ever; breaking news sends its own.
 */
export function NotifyControl({
  article,
  onArticle,
}: {
  article: ArticleDetail;
  onArticle: (next: ArticleDetail) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // A fresher state read while one is on its way, for this article view only.
  const [polled, setPolled] = useState<{
    from: ArticleNotification;
    view: ArticleNotification;
  } | null>(null);
  const base = article.notification;
  const view = polled && polled.from === base ? polled.view : base;

  const waiting = view?.state === 'pending' || view?.state === 'queued';
  useEffect(() => {
    if (!waiting || !base) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > POLL_TRIES) {
        clearInterval(timer);
        return;
      }
      api<ArticleNotification>(`staff/articles/${article.id}/notify`)
        .then((next) => setPolled({ from: base, view: next }))
        .catch(() => {
          // Keep showing the last state; the next look may work.
        });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, base, article.id]);

  // An API older than this control sends no notification state.
  if (!article.can.notify || !view) return null;

  async function call(
    method: 'PUT' | 'POST',
    body: Record<string, unknown> | undefined,
    done: string,
  ) {
    setBusy(true);
    try {
      const next = await api<ArticleDetail>(
        `staff/articles/${article.id}/notify`,
        { method, body },
      );
      onArticle(next);
      qc.setQueryData(qk.article(article.id), next);
      invalidateArticles(qc);
      toast.success(done);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const c = view.campaign;
  let status: string | null = null;
  switch (view.state) {
    case 'breaking':
      status = `Breaking news already sends a notification to ${AUDIENCE}, so no second one goes out.`;
      break;
    case 'pending':
      status = `Going out within a minute to ${AUDIENCE}.`;
      break;
    case 'available':
      status = view.sendUntil
        ? `Not sent. You can send one to ${AUDIENCE} until ${formatDateTime(view.sendUntil)}.`
        : 'Not sent.';
      break;
    case 'closed':
      status = article.retractedAt
        ? 'Retracted stories don’t send notifications.'
        : 'Not sent. A notification can only go out within 24 hours of a story first going live.';
      break;
    case 'queued':
      status = `Notification on its way to ${AUDIENCE}.`;
      break;
    case 'sent':
      status = c
        ? `Notification sent ${formatDateTime(c.sentAt)} to ${readers(c.recipients)}${c.kind === 'BREAKING' ? ', as a breaking news alert' : ''}.`
        : 'Notification sent.';
      break;
    case 'not_sent':
      status = `Notification not sent.${c?.note ? ` ${c.note}` : ''}`;
      break;
  }

  if (view.state === 'switch') {
    return (
      <div
        className="flex items-center justify-between gap-3"
        data-notify-state={view.state}
      >
        <Label
          htmlFor="flag-notify"
          className="flex-col items-start gap-0.5 font-normal"
        >
          Send a notification when published
          <span className="text-xs text-muted-foreground">
            {article.status === 'SCHEDULED' && article.scheduledAt
              ? `Goes once to ${AUDIENCE} when the story goes live at ${formatDateTime(article.scheduledAt)}.`
              : `Goes once to ${AUDIENCE} as soon as the story is live.`}
          </span>
        </Label>
        <Switch
          id="flag-notify"
          checked={view.notifyOnPublish}
          disabled={busy}
          onCheckedChange={(v) =>
            void call(
              'PUT',
              { notifyOnPublish: v },
              v
                ? 'A notification goes out when the story is published.'
                : 'No notification when it’s published.',
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-2" data-notify-state={view.state}>
      <div className="flex gap-2">
        <BellRing
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm">Notification to app readers</p>
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {status}
          </p>
        </div>
      </div>
      {view.state === 'available' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm(true)}
          disabled={busy}
        >
          <Send /> Send notification now
        </Button>
      )}

      <Dialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send a notification about this story?</DialogTitle>
            <DialogDescription>
              It goes to {AUDIENCE} within a minute, headed “Editors’ pick”
              with the headline. A story sends only one notification, and
              this can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{article.title}</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirm(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                void call('POST', undefined, 'Notification on its way.').then(
                  (ok) => ok && setConfirm(false),
                )
              }
              disabled={busy}
            >
              {busy && <Loader2 className="animate-spin" />}
              Send notification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

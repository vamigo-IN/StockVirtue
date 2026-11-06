'use client';

import {
  Archive,
  CalendarClock,
  Check,
  ChevronDown,
  CircleSlash,
  Loader2,
  MessageSquareWarning,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ArticleDetail } from '@/portal/types';

export type Act = (
  path: string,
  extra?: Record<string, unknown>,
  success?: string,
) => Promise<boolean>;

type Ask =
  | { kind: 'approve' | 'request-changes' | 'reject' | 'unpublish' }
  | { kind: 'retract' }
  | { kind: 'schedule' }
  | {
      kind: 'confirm';
      path: string;
      title: string;
      body: string;
      label: string;
      success: string;
      destructive?: boolean;
    }
  | null;

/** datetime-local value for "in an hour", in the browser's time zone. */
function inAnHour() {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TEXTS: Record<
  'approve' | 'request-changes' | 'reject' | 'unpublish' | 'retract',
  {
    title: string;
    body: string;
    label: string;
    field: string;
    required: boolean;
    success: string;
  }
> = {
  approve: {
    title: 'Approve this article?',
    body: 'It moves to Approved, ready to publish or schedule.',
    label: 'Approve',
    field: 'Note for the writer (optional)',
    required: false,
    success: 'Approved.',
  },
  'request-changes': {
    title: 'Ask for changes',
    body: 'The writer gets the article back with your note.',
    label: 'Send back to writer',
    field: 'What should change?',
    required: true,
    success: 'Sent back to the writer.',
  },
  reject: {
    title: 'Reject this article?',
    body: "It won't run. The writer can reopen it as a new draft later.",
    label: 'Reject',
    field: 'Why won’t it run?',
    required: true,
    success: 'Rejected.',
  },
  unpublish: {
    title: 'Take this article down?',
    body: 'It disappears from the site and goes back to Draft, so it is reviewed again before it returns.',
    label: 'Unpublish',
    field: 'Reason (kept in the audit log, optional)',
    required: false,
    success: 'Taken down. The article is a draft again.',
  },
  retract: {
    title: 'Retract this article?',
    body: 'Retracted stories stay online with a prominent notice explaining why. This can’t be undone from the portal.',
    label: 'Retract',
    field: 'Retraction notice for readers',
    required: true,
    success: 'Article retracted.',
  },
};

export function WorkflowActions({
  article,
  busy,
  act,
  onDelete,
}: {
  article: ArticleDetail;
  busy: boolean;
  act: Act;
  onDelete: () => Promise<void>;
}) {
  const c = article.can;
  // "Send a notification when published" is on (NotifyControl): say so in
  // the publish and schedule confirmations, so the publisher knows.
  const notifies =
    article.notification?.state === 'switch' &&
    article.notification.notifyOnPublish;
  const notifyLine = notifies
    ? ' A notification goes to app readers with breaking news alerts on when it’s live.'
    : '';
  const publishBody = `It goes live on the website immediately.${notifyLine}`;
  const [ask, setAsk] = useState<Ask>(null);
  const [text, setText] = useState('');
  const [when, setWhen] = useState(inAnHour);
  const [error, setError] = useState<string | null>(null);

  const open = (a: Ask) => {
    setText('');
    setError(null);
    if (a?.kind === 'schedule') setWhen(inAnHour());
    setAsk(a);
  };

  // The one obvious next step for this state, then everything else.
  const primary = (() => {
    if (c.submit)
      return {
        label: 'Submit for review',
        icon: Send,
        run: () => act('submit', {}, 'Sent to the editors.'),
      };
    if (c.review)
      return {
        label: 'Approve',
        icon: Check,
        run: () => open({ kind: 'approve' }),
      };
    if (c.publish && article.status !== 'PUBLISHED') {
      return {
        label: 'Publish now',
        icon: Upload,
        run: () =>
          open({
            kind: 'confirm',
            path: 'publish',
            title: 'Publish this article now?',
            body: publishBody,
            label: 'Publish',
            success: 'Published.',
          }),
      };
    }
    if (c.reopen)
      return {
        label: 'Reopen as draft',
        icon: RotateCcw,
        run: () => act('reopen', {}, 'Reopened as a draft.'),
      };
    if (c.withdraw)
      return {
        label: 'Withdraw from review',
        icon: Undo2,
        run: () => act('withdraw', {}, 'Withdrawn. You can edit it again.'),
      };
    // A live story has no next step: editors fix it by editing and saving,
    // and readers see its "Updated" time (correction notes were retired).
    return null;
  })();

  const more: {
    label: string;
    icon: typeof Send;
    run: () => void;
    destructive?: boolean;
  }[] = [];
  if (c.review) {
    more.push({
      label: 'Request changes',
      icon: MessageSquareWarning,
      run: () => open({ kind: 'request-changes' }),
    });
    more.push({
      label: 'Reject',
      icon: XCircle,
      run: () => open({ kind: 'reject' }),
      destructive: true,
    });
  }
  if (
    c.publish &&
    primary?.label !== 'Publish now' &&
    article.status !== 'PUBLISHED'
  ) {
    more.push({
      label: 'Publish now',
      icon: Upload,
      run: () =>
        open({
          kind: 'confirm',
          path: 'publish',
          title: 'Publish this article now?',
          body: publishBody,
          label: 'Publish',
          success: 'Published.',
        }),
    });
  }
  if (c.schedule)
    more.push({
      label: 'Schedule…',
      icon: CalendarClock,
      run: () => open({ kind: 'schedule' }),
    });
  if (c.unschedule)
    more.push({
      label: 'Unschedule',
      icon: Undo2,
      run: () =>
        void act(
          'unschedule',
          {},
          'Unscheduled. The article is approved and waiting.',
        ),
    });
  if (c.withdraw && primary?.label !== 'Withdraw from review') {
    more.push({
      label: 'Withdraw from review',
      icon: Undo2,
      run: () => void act('withdraw', {}, 'Withdrawn.'),
    });
  }
  // `correct` is the retraction capability (permission news.correct).
  if (c.correct && !article.retractedAt) {
    more.push({
      label: 'Retract…',
      icon: CircleSlash,
      run: () => open({ kind: 'retract' }),
      destructive: true,
    });
  }
  if (c.unpublish)
    more.push({
      label: 'Unpublish…',
      icon: Undo2,
      run: () => open({ kind: 'unpublish' }),
      destructive: true,
    });
  if (c.cancel) {
    more.push({
      label: 'Spike story',
      icon: CircleSlash,
      run: () =>
        open({
          kind: 'confirm',
          path: 'cancel',
          title: 'Spike this story?',
          body: "It won't run. It stays in the newsroom as Spiked and can be reopened later.",
          label: 'Spike',
          success: 'Spiked.',
          destructive: true,
        }),
    });
  }
  if (c.archive) {
    more.push({
      label: 'Archive',
      icon: Archive,
      run: () =>
        open({
          kind: 'confirm',
          path: 'archive',
          title: 'Archive this article?',
          body:
            article.status === 'PUBLISHED'
              ? 'It comes off the website and moves to the archive.'
              : 'It moves to the archive. You can reopen it later.',
          label: 'Archive',
          success: 'Archived.',
        }),
    });
  }
  if (c.delete) {
    more.push({
      label: 'Delete draft',
      icon: Trash2,
      run: () =>
        open({
          kind: 'confirm',
          path: '__delete',
          title: 'Delete this draft?',
          body: 'It and its version history are removed for good. This can’t be undone.',
          label: 'Delete',
          success: 'Deleted.',
          destructive: true,
        }),
    });
  }

  async function submitAsk() {
    if (!ask) return;
    if (ask.kind === 'confirm') {
      if (ask.path === '__delete') await onDelete();
      else if (await act(ask.path, {}, ask.success)) setAsk(null);
      return;
    }
    if (ask.kind === 'schedule') {
      const at = new Date(when);
      if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) {
        setError('Pick a time at least a minute from now.');
        return;
      }
      if (
        await act(
          'schedule',
          { scheduledAt: at.toISOString() },
          `Scheduled for ${at.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`,
        )
      ) {
        setAsk(null);
      }
      return;
    }
    const t = TEXTS[ask.kind];
    if (t.required && text.trim().length < 5) {
      setError('Write at least a few words.');
      return;
    }
    const key = ask.kind === 'retract' ? 'note' : 'comment';
    const extra = text.trim() ? { [key]: text.trim() } : {};
    if (await act(ask.kind, extra, t.success)) setAsk(null);
  }

  const textAsk =
    ask && ask.kind !== 'confirm' && ask.kind !== 'schedule'
      ? TEXTS[ask.kind]
      : null;

  return (
    <>
      <div className="flex items-center gap-2">
        {primary && (
          <Button size="sm" onClick={() => void primary.run()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <primary.icon />}
            {primary.label}
          </Button>
        )}
        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy}>
                More <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {more.map((m, i) => (
                <div key={m.label}>
                  {m.destructive && i > 0 && !more[i - 1].destructive && (
                    <DropdownMenuSeparator />
                  )}
                  <DropdownMenuItem
                    variant={m.destructive ? 'destructive' : 'default'}
                    onSelect={() => m.run()}
                  >
                    <m.icon /> {m.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={!!ask} onOpenChange={(o) => !o && !busy && setAsk(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {ask?.kind === 'confirm'
                ? ask.title
                : ask?.kind === 'schedule'
                  ? 'Schedule publication'
                  : textAsk?.title}
            </DialogTitle>
            <DialogDescription>
              {ask?.kind === 'confirm'
                ? ask.body
                : ask?.kind === 'schedule'
                  ? `The article goes live automatically at this time (your local time).${notifyLine}`
                  : textAsk?.body}
            </DialogDescription>
          </DialogHeader>
          {ask?.kind === 'schedule' && (
            <div className="space-y-2">
              <Label htmlFor="schedule-at">Publish at</Label>
              <Input
                id="schedule-at"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
          )}
          {textAsk && (
            <div className="space-y-2">
              <Label htmlFor="workflow-text">{textAsk.field}</Label>
              <Textarea
                id="workflow-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                maxLength={2000}
                autoFocus
              />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAsk(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void submitAsk()}
              disabled={busy}
              variant={
                (ask?.kind === 'confirm' && ask.destructive) ||
                ask?.kind === 'reject' ||
                ask?.kind === 'retract' ||
                ask?.kind === 'unpublish'
                  ? 'destructive'
                  : 'default'
              }
            >
              {busy && <Loader2 className="animate-spin" />}
              {ask?.kind === 'confirm'
                ? ask.label
                : ask?.kind === 'schedule'
                  ? 'Schedule'
                  : textAsk?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

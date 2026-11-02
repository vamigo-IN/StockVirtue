'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  CornerDownRight,
  Loader2,
  RotateCcw,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/portal/api';
import { formatDate, formatDateTime, initials, timeAgo } from '@/portal/format';
import {
  invalidateArticles,
  qk,
  useComments,
  useDirectory,
} from '@/portal/queries';
import type { ArticleComment, ArticleDetail } from '@/portal/types';

const ROLE_LABEL = {
  WRITER: 'Writer',
  EDITOR: 'Editor',
  REVIEWER: 'Reviewer',
} as const;
const DECISION = {
  APPROVED: { label: 'Approved', tone: 'text-success' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'text-warning' },
  REJECTED: { label: 'Rejected', tone: 'text-destructive' },
} as const;

function Assignments({
  article,
  onArticle,
}: {
  article: ArticleDetail;
  onArticle: (a: ArticleDetail) => void;
}) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const directory = useDirectory(article.can.assign);
  const [assignee, setAssignee] = useState('');
  const [role, setRole] = useState<'WRITER' | 'EDITOR' | 'REVIEWER'>('WRITER');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const open = article.assignments.filter((a) => a.status !== 'CANCELLED');

  async function assign() {
    if (!assignee) return toast.error('Pick someone to assign.');
    setBusy(true);
    try {
      const next = await api<ArticleDetail>(
        `staff/articles/${article.id}/assignments`,
        {
          method: 'POST',
          body: {
            assigneeId: assignee,
            role,
            ...(due
              ? { dueAt: new Date(`${due}T18:00:00`).toISOString() }
              : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
        },
      );
      onArticle(next);
      qc.setQueryData(qk.article(article.id), next);
      invalidateArticles(qc);
      setAssignee('');
      setNote('');
      setDue('');
      toast.success('Assigned.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: 'DONE' | 'CANCELLED' | 'OPEN') {
    try {
      const next = await api<ArticleDetail>(`staff/assignments/${id}`, {
        method: 'PATCH',
        body: { status },
      });
      onArticle(next);
      qc.setQueryData(qk.article(article.id), next);
      invalidateArticles(qc);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Assignments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {open.length === 0 && (
          <p className="text-sm text-muted-foreground">Nobody is assigned.</p>
        )}
        {open.map((a) => (
          <div
            key={a.id}
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              a.status === 'DONE' && 'opacity-70',
            )}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {a.assignee.displayName}
              </span>
              <Badge variant="outline" className="text-[10px]">
                {ROLE_LABEL[a.role]}
              </Badge>
              {a.status === 'DONE' && (
                <Badge className="bg-success/15 text-[10px] text-success">
                  Done
                </Badge>
              )}
            </div>
            {(a.note || a.dueAt) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.note}
                {a.note && a.dueAt ? ' · ' : ''}
                {a.dueAt ? `Due ${formatDate(a.dueAt)}` : ''}
              </p>
            )}
            {a.status === 'OPEN' &&
              (a.assignee.id === me.id || article.can.assign) && (
                <div className="mt-1.5 flex gap-1">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => void setStatus(a.id, 'DONE')}
                  >
                    <Check /> Mark done
                  </Button>
                  {article.can.assign && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => void setStatus(a.id, 'CANCELLED')}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              )}
          </div>
        ))}
        {article.can.assign && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <Label className="text-xs">Assign someone</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-full" aria-label="Person">
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {(directory.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName}
                    {p.roles[0] ? ` · ${p.roles[0]}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Select
                value={role}
                onValueChange={(v) => setRole(v as typeof role)}
              >
                <SelectTrigger className="w-32" aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WRITER">Writer</SelectItem>
                  <SelectItem value="REVIEWER">Reviewer</SelectItem>
                  <SelectItem value="EDITOR">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                aria-label="Due date"
              />
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={500}
            />
            <Button size="sm" onClick={() => void assign()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <UserPlus />}{' '}
              Assign
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Reviews({ article }: { article: ArticleDetail }) {
  if (article.reviews.length === 0) return null;
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Review history</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {article.reviews.map((r) => (
            <li key={r.id} className="border-l-2 pl-3 text-sm">
              <p>
                <span className={cn('font-medium', DECISION[r.decision].tone)}>
                  {DECISION[r.decision].label}
                </span>{' '}
                <span className="text-muted-foreground">
                  by {r.reviewer?.displayName ?? 'someone'}
                </span>
              </p>
              {r.comment && (
                <p className="mt-0.5 whitespace-pre-line">{r.comment}</p>
              )}
              <p
                className="text-xs text-muted-foreground"
                title={formatDateTime(r.createdAt)}
              >
                {timeAgo(r.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Comments({ article }: { article: ArticleDetail }) {
  const qc = useQueryClient();
  const comments = useComments(article.id);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<ArticleComment | null>(null);
  const [busy, setBusy] = useState(false);
  const all = comments.data ?? [];
  const roots = all.filter((c) => !c.parentId);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.comments(article.id) });
    void qc.invalidateQueries({ queryKey: ['audit'] });
  };

  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`staff/articles/${article.id}/comments`, {
        method: 'POST',
        body: {
          body: body.trim(),
          ...(replyTo ? { parentId: replyTo.id } : {}),
        },
      });
      setBody('');
      setReplyTo(null);
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function patch(c: ArticleComment, data: { resolved?: boolean }) {
    try {
      await api(`staff/comments/${c.id}`, { method: 'PATCH', body: data });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function remove(c: ArticleComment) {
    try {
      await api(`staff/comments/${c.id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const item = (c: ArticleComment, reply = false) => (
    <li key={c.id} className={cn('flex gap-2.5', reply && 'mt-2 ml-6')}>
      <Avatar className="size-7">
        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">
          {initials(c.author?.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className={cn('min-w-0 flex-1', c.resolvedAt && 'opacity-60')}>
        <p className="text-xs">
          <span className="font-medium">
            {c.author?.displayName ?? 'Someone'}
          </span>{' '}
          <span
            className="text-muted-foreground"
            title={formatDateTime(c.createdAt)}
          >
            {timeAgo(c.createdAt)}
          </span>
          {c.resolvedAt && (
            <span className="ml-1 text-success">· resolved</span>
          )}
        </p>
        <p className="mt-0.5 text-sm whitespace-pre-line break-words">
          {c.body}
        </p>
        <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
          {!reply && article.can.comment && (
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => setReplyTo(c)}
            >
              Reply
            </button>
          )}
          {!reply && (
            <button
              type="button"
              className="flex items-center gap-1 hover:text-foreground"
              onClick={() => void patch(c, { resolved: !c.resolvedAt })}
            >
              {c.resolvedAt ? (
                <RotateCcw className="size-3" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              {c.resolvedAt ? 'Reopen' : 'Resolve'}
            </button>
          )}
          {c.mine && (
            <button
              type="button"
              className="flex items-center gap-1 hover:text-destructive"
              onClick={() => void remove(c)}
            >
              <Trash2 className="size-3" /> Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Editorial comments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {roots.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Notes between writers and editors. Never shown to readers.
          </p>
        )}
        <ul className="space-y-4">
          {roots.map((c) => (
            <div key={c.id}>
              {item(c)}
              <ul>
                {all
                  .filter((r) => r.parentId === c.id)
                  .map((r) => item(r, true))}
              </ul>
            </div>
          ))}
        </ul>
        {article.can.comment && (
          <div className="space-y-2">
            {replyTo && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CornerDownRight className="size-3" /> Replying to{' '}
                {replyTo.author?.displayName}
                <button
                  type="button"
                  className="ml-1 underline"
                  onClick={() => setReplyTo(null)}
                >
                  cancel
                </button>
              </p>
            )}
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment for the desk"
              rows={2}
              maxLength={4000}
            />
            <Button
              size="sm"
              onClick={() => void post()}
              disabled={busy || !body.trim()}
            >
              {busy && <Loader2 className="animate-spin" />} Comment
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CollabPanel({
  article,
  onArticle,
}: {
  article: ArticleDetail;
  onArticle: (a: ArticleDetail) => void;
}) {
  return (
    <div className="space-y-4">
      <Assignments article={article} onArticle={onArticle} />
      <Reviews article={article} />
      <Comments article={article} />
    </div>
  );
}

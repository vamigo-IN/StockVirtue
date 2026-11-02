'use client';

import type { Editor } from '@tiptap/react';
import { Bot, Copy, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AiHistory } from '@/components/newswire/AiHistory';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { ARTICLE_STATUS_LABELS, timeAgo } from '@/portal/format';
import {
  qk,
  useAiJob,
  useAiStatus,
  useCategories,
  useSimilar,
} from '@/portal/queries';
import { useQueryClient } from '@tanstack/react-query';
import type { AiJob, AiTask, ArticleDetail, Tag } from '@/portal/types';
import {
  ChecksNote,
  draftContent,
  FindButton,
  KindBadge,
  type Outputs,
  paragraphs,
  selectQuote,
  Suggestion,
} from './ai-results';
import type { Draft } from './draft';

/** Tools whose results put AI-written text into the story (it is then labelled AI-assisted). */
const WRITES_STORY = new Set<AiTask>([
  'HEADLINES',
  'SUMMARY',
  'EXPLAINERS',
  'REWRITE_SECTION',
  'DRAFT_FROM_NOTES',
]);
/** Tools that only read the story. */
const READ_ONLY = new Set<AiTask>(['REVIEW', 'RELATED_ARTICLES']);

const TOOLS: { task: AiTask; title: string; hint: string }[] = [
  {
    task: 'HEADLINES',
    title: 'Suggest headlines',
    hint: 'Five factual alternatives.',
  },
  {
    task: 'SUMMARY',
    title: 'Write the summary and standfirst',
    hint: 'For listings, search and the app.',
  },
  {
    task: 'SEO',
    title: 'Write the SEO title and description',
    hint: 'For search results and sharing.',
  },
  {
    task: 'TAXONOMY',
    title: 'Suggest a category and tags',
    hint: 'From the newsroom’s own lists.',
  },
  {
    task: 'RELATED_STOCKS',
    title: 'Find related stocks',
    hint: 'Only NSE-listed companies.',
  },
  {
    task: 'RELATED_ARTICLES',
    title: 'Suggest related stories',
    hint: 'From published stories.',
  },
  {
    task: 'REVIEW',
    title: 'Check the draft',
    hint: 'Misleading claims, missing sources, conflicts, outdated wording.',
  },
  {
    task: 'EXPLAINERS',
    title: 'Explain the jargon',
    hint: 'Explainer boxes for terms a newcomer may not know.',
  },
  {
    task: 'REWRITE_SECTION',
    title: 'Rewrite the selected passage',
    hint: 'Select text in the story first.',
  },
  {
    task: 'DRAFT_FROM_NOTES',
    title: 'Draft from my notes',
    hint: 'Turn your facts and quotes into a first draft.',
  },
];

const REWRITES = [
  { value: '', label: 'Clearer' },
  { value: 'Make it shorter and tighter.', label: 'Shorter' },
  { value: 'Make it simpler for readers new to investing.', label: 'Simpler' },
  { value: 'Make it more formal.', label: 'More formal' },
];

/**
 * The AI tab beside the editor (spec §9). Every tool returns suggestions a
 * person chooses to use; nothing is applied automatically, and the server
 * withholds anything with figures that aren't in the story or its sources.
 */
export function AiPanel({
  article,
  draft,
  change,
  editable,
  seoEditable,
  getEditor,
  flush,
}: {
  article: ArticleDetail;
  draft: Draft;
  change: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  editable: boolean;
  seoEditable: boolean;
  getEditor: () => Editor | null;
  /** Saves pending edits, so the AI works from the latest text. */
  flush: () => Promise<void>;
}) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const mayUse = can(me, 'ai.use');
  const status = useAiStatus(mayUse);
  const categories = useCategories();
  const [runs, setRuns] = useState<Partial<Record<AiTask, string>>>({});
  const [starting, setStarting] = useState<AiTask | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rewrite, setRewrite] = useState('');
  const [passage, setPassage] = useState<{
    from: number;
    to: number;
    text: string;
  } | null>(null);
  const [similarOn, setSimilarOn] = useState(false);
  const similar = useSimilar(article.id, similarOn);

  const allowed = (task: AiTask) =>
    READ_ONLY.has(task)
      ? true
      : task === 'SEO'
        ? seoEditable || editable
        : editable;

  async function run(task: AiTask, extra: Record<string, unknown> = {}) {
    setStarting(task);
    try {
      await flush();
      const job = await api<AiJob>('staff/ai/jobs', {
        method: 'POST',
        body: { task, articleId: article.id, ...extra },
      });
      setRuns((r) => ({ ...r, [task]: job.id }));
      void qc.invalidateQueries({ queryKey: qk.aiStatus });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setStarting(null);
    }
  }

  /** Records the use; story text from the AI labels the story AI-assisted. */
  function markUsed(job: AiJob, key: string) {
    setUsed((u) => new Set(u).add(`${job.id}:${key}`));
    if (WRITES_STORY.has(job.task) && !draft.isAiGenerated)
      change('isAiGenerated', true);
    void api(`staff/ai/jobs/${job.id}/applied`, { method: 'POST' }).catch(
      (err: unknown) => toast.error(errorMessage(err)),
    );
  }
  const isUsed = (job: AiJob, key: string) => used.has(`${job.id}:${key}`);

  function insert(
    content: Record<string, unknown> | Record<string, unknown>[],
  ) {
    const editor = getEditor();
    if (!editor) return false;
    editor.chain().focus().insertContent(content).run();
    return true;
  }

  function startRewrite() {
    const editor = getEditor();
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n\n').trim();
    if (text.length < 20) {
      toast.error('Select the passage to rewrite in the story first.');
      return;
    }
    setPassage({ from, to, text });
    void run('REWRITE_SECTION', { passage: text, instruction: rewrite });
  }

  function replacePassage(job: AiJob, out: Outputs['REWRITE_SECTION']) {
    const editor = getEditor();
    if (!editor || !passage) return;
    const now = editor.state.doc
      .textBetween(
        passage.from,
        Math.min(passage.to, editor.state.doc.content.size),
        '\n\n',
      )
      .trim();
    if (now !== passage.text) {
      toast.error(
        'The passage changed since. Select it again and rerun the rewrite.',
      );
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: passage.from, to: passage.to },
        paragraphs(out.paragraphs),
      )
      .run();
    setPassage(null);
    markUsed(job, 'replace');
  }

  async function addTag(
    job: AiJob,
    t: { name: string; existingId: string | null },
  ) {
    try {
      const tag = t.existingId
        ? { id: t.existingId, name: t.name }
        : await api<Tag>('staff/tags', {
            method: 'POST',
            body: { name: t.name },
          });
      if (draft.tags.some((x) => x.id === tag.id)) return;
      if (draft.tags.length >= 15)
        return void toast.error('Up to 15 tags per article.');
      change('tags', [...draft.tags, { id: tag.id, name: tag.name }]);
      markUsed(job, `tag:${t.name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const tools = TOOLS.filter(
    (t) => status.data?.tasks.find((x) => x.task === t.task)?.enabled,
  );
  const someOff = status.data && tools.length < TOOLS.length;

  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Copy className="size-4 text-muted-foreground" /> Similar stories
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() =>
              similarOn ? void similar.refetch() : setSimilarOn(true)
            }
            disabled={similar.isFetching}
          >
            {similar.isFetching
              ? 'Checking…'
              : similarOn
                ? 'Check again'
                : 'Check'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Stories and incoming items with a similar headline, so a story isn’t
          written twice.
        </p>
        {similar.data &&
          (similar.data.stories.length + similar.data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing similar in the last 30 days.
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {similar.data.stories.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/admin/articles/${s.id}`}
                    className="font-medium hover:underline"
                  >
                    {s.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    · {ARTICLE_STATUS_LABELS[s.status] ?? s.status} ·{' '}
                    {Math.round(s.score * 100)}% alike
                  </span>
                </li>
              ))}
              {similar.data.items.map((i) => (
                <li key={i.id}>
                  {i.url ? (
                    <a
                      href={i.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {i.title}
                    </a>
                  ) : (
                    i.title
                  )}
                  <span className="text-xs text-muted-foreground">
                    {' '}
                    · incoming from {i.source} {timeAgo(i.fetchedAt)} ·{' '}
                    {Math.round(i.score * 100)}% alike
                  </span>
                </li>
              ))}
            </ul>
          ))}
      </section>

      {!mayUse ? null : !status.data ? (
        <p className="text-sm text-muted-foreground">
          Loading the AI assistant…
        </p>
      ) : !status.data.ready ? (
        <section className="rounded-xl border border-dashed p-4 text-center">
          <Bot className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 font-medium">The AI assistant is off</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.data.reason}
          </p>
          {can(me, 'ai.configure') && (
            <Button size="sm" variant="outline" className="mt-3" asChild>
              <Link href="/admin/ai">Set it up</Link>
            </Button>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" />
            {status.data.provider?.name} · {status.data.usage.mineToday} of{' '}
            {status.data.usage.dailyLimit} requests used today
          </p>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Suggestions only: nothing changes until you press Use. Figures that
            aren’t in the story or its sources are removed automatically, and
            AI-written text labels the story as AI-assisted for readers.
          </p>
          {tools.map((tool) => {
            const jobId = runs[tool.task];
            const allowedHere = allowed(tool.task);
            return (
              <div
                key={tool.task}
                className="space-y-2 rounded-xl border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{tool.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {allowedHere
                        ? tool.hint
                        : 'You can’t change this story right now.'}
                    </p>
                  </div>
                  {tool.task !== 'DRAFT_FROM_NOTES' &&
                    tool.task !== 'REWRITE_SECTION' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0"
                        disabled={!allowedHere || starting === tool.task}
                        onClick={() => void run(tool.task)}
                      >
                        {starting === tool.task ? (
                          <Loader2 className="animate-spin" />
                        ) : null}
                        {jobId ? 'Again' : 'Run'}
                      </Button>
                    )}
                </div>

                {tool.task === 'REWRITE_SECTION' && allowedHere && (
                  <div className="space-y-2">
                    <div
                      className="flex flex-wrap gap-1"
                      role="group"
                      aria-label="How to rewrite"
                    >
                      {REWRITES.map((r) => (
                        <Button
                          key={r.label}
                          size="sm"
                          variant={rewrite === r.value ? 'secondary' : 'ghost'}
                          className="h-7"
                          onClick={() => setRewrite(r.value)}
                        >
                          {r.label}
                        </Button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={starting === tool.task}
                      onClick={startRewrite}
                    >
                      Rewrite selection
                    </Button>
                  </div>
                )}
                {tool.task === 'DRAFT_FROM_NOTES' && allowedHere && (
                  <div className="space-y-2">
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      maxLength={20000}
                      placeholder="Your facts, figures and quotes. The draft uses only these."
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={
                        starting === tool.task || notes.trim().length < 30
                      }
                      onClick={() => void run('DRAFT_FROM_NOTES', { notes })}
                    >
                      Draft it
                    </Button>
                  </div>
                )}

                {jobId && (
                  <JobResult jobId={jobId}>
                    {(job) => (
                      <ToolOutput
                        job={job}
                        draft={draft}
                        change={change}
                        editable={editable}
                        seoEditable={seoEditable}
                        categoryName={(id) =>
                          categories.data?.find((c) => c.id === id)?.name ??
                          null
                        }
                        markUsed={markUsed}
                        isUsed={isUsed}
                        insert={insert}
                        getEditor={getEditor}
                        replacePassage={replacePassage}
                        addTag={addTag}
                      />
                    )}
                  </JobResult>
                )}
              </div>
            );
          })}
          {someOff && (
            <p className="text-xs text-muted-foreground">
              Some tools are switched off for the newsroom.
            </p>
          )}
          <details
            className="rounded-xl border bg-card p-3"
            onToggle={(e) => setHistoryOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-medium">
              AI requests for this story
            </summary>
            {historyOpen && (
              <div className="mt-3">
                <AiHistory filters={{ articleId: article.id }} compact />
              </div>
            )}
          </details>
        </section>
      )}
    </div>
  );
}

/** One request, polled until it finishes; slow starts point at the worker. */
function JobResult({
  jobId,
  children,
}: {
  jobId: string;
  children: (job: AiJob) => React.ReactNode;
}) {
  const job = useAiJob(jobId);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  if (job.error)
    return (
      <p className="text-sm text-destructive">{errorMessage(job.error)}</p>
    );
  const j = job.data;
  if (!j || j.status === 'QUEUED' || j.status === 'RUNNING') {
    const secs = j
      ? Math.round((Date.now() - new Date(j.createdAt).getTime()) / 1000)
      : 0;
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {j?.status === 'RUNNING'
          ? 'The AI is working on it…'
          : 'Waiting for the AI…'}{' '}
        {secs > 2 && `${secs} s`}
        {j?.status === 'QUEUED' &&
          secs > 20 &&
          ' (is the newsroom worker running?)'}
      </p>
    );
  }
  if (j.status === 'FAILED')
    return (
      <p className="text-sm text-destructive">
        {j.error ?? 'The request failed.'}
      </p>
    );
  return (
    <div className="space-y-2">
      {children(j)}
      <ChecksNote checks={j.checks} />
    </div>
  );
}

function ToolOutput({
  job,
  draft,
  change,
  editable,
  seoEditable,
  categoryName,
  markUsed,
  isUsed,
  insert,
  getEditor,
  replacePassage,
  addTag,
}: {
  job: AiJob;
  draft: Draft;
  change: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  editable: boolean;
  seoEditable: boolean;
  categoryName: (id: string) => string | null;
  markUsed: (job: AiJob, key: string) => void;
  isUsed: (job: AiJob, key: string) => boolean;
  insert: (
    content: Record<string, unknown> | Record<string, unknown>[],
  ) => boolean;
  getEditor: () => Editor | null;
  replacePassage: (job: AiJob, out: Outputs['REWRITE_SECTION']) => void;
  addTag: (
    job: AiJob,
    t: { name: string; existingId: string | null },
  ) => Promise<void>;
}) {
  const use = (key: string, fn: () => void) => () => {
    fn();
    markUsed(job, key);
  };
  switch (job.task) {
    case 'HEADLINES': {
      const out = job.output as Outputs['HEADLINES'];
      return (
        <ul className="space-y-1.5">
          {out.headlines.map((h, i) => (
            <Suggestion
              key={i}
              text={h}
              used={isUsed(job, `h${i}`)}
              disabled={!editable}
              onUse={use(`h${i}`, () => change('title', h))}
            />
          ))}
        </ul>
      );
    }
    case 'SUMMARY': {
      const out = job.output as Outputs['SUMMARY'];
      return (
        <ul className="space-y-1.5">
          {out.summary && (
            <Suggestion
              text={
                <>
                  <span className="text-xs text-muted-foreground">
                    Summary ·{' '}
                  </span>
                  {out.summary}
                </>
              }
              used={isUsed(job, 'summary')}
              disabled={!editable}
              onUse={use('summary', () => change('summary', out.summary))}
            />
          )}
          {out.standfirst && (
            <Suggestion
              text={
                <>
                  <span className="text-xs text-muted-foreground">
                    Standfirst ·{' '}
                  </span>
                  {out.standfirst}
                </>
              }
              used={isUsed(job, 'standfirst')}
              disabled={!editable}
              onUse={use('standfirst', () =>
                change('subtitle', out.standfirst),
              )}
            />
          )}
        </ul>
      );
    }
    case 'SEO': {
      const out = job.output as Outputs['SEO'];
      return (
        <ul className="space-y-1.5">
          <Suggestion
            text={
              <>
                {out.seoTitle && (
                  <span className="block font-medium">{out.seoTitle}</span>
                )}
                {out.metaDescription && (
                  <span className="block text-muted-foreground">
                    {out.metaDescription}
                  </span>
                )}
              </>
            }
            used={isUsed(job, 'seo')}
            disabled={!seoEditable && !editable}
            onUse={use('seo', () =>
              change('seo', {
                ...draft.seo,
                ...(out.seoTitle ? { title: out.seoTitle } : {}),
                ...(out.metaDescription
                  ? { description: out.metaDescription }
                  : {}),
              }),
            )}
          />
        </ul>
      );
    }
    case 'TAXONOMY': {
      const out = job.output as Outputs['TAXONOMY'];
      const cat = out.categoryId ? categoryName(out.categoryId) : null;
      return (
        <ul className="space-y-1.5">
          {cat && (
            <Suggestion
              text={
                <>
                  <span className="text-xs text-muted-foreground">
                    Category ·{' '}
                  </span>
                  {cat}
                </>
              }
              used={isUsed(job, 'cat') || draft.categoryId === out.categoryId}
              disabled={!editable}
              onUse={use('cat', () => change('categoryId', out.categoryId))}
            />
          )}
          {out.tags.map((t) => (
            <Suggestion
              key={t.name}
              text={
                <>
                  {t.name}{' '}
                  {!t.existingId && (
                    <Badge variant="outline" className="ml-1">
                      new tag
                    </Badge>
                  )}
                </>
              }
              used={
                isUsed(job, `tag:${t.name}`) ||
                draft.tags.some((x) => x.id === t.existingId)
              }
              disabled={!editable}
              label="Add tag"
              onUse={() => void addTag(job, t)}
            />
          ))}
          {out.sectors.map((s) => (
            <Suggestion
              key={s}
              text={
                <>
                  <span className="text-xs text-muted-foreground">
                    Sector ·{' '}
                  </span>
                  {s}
                </>
              }
              used={isUsed(job, `sector:${s}`) || draft.sectors.includes(s)}
              disabled={!editable}
              label="Add"
              onUse={use(`sector:${s}`, () =>
                change('sectors', [...new Set([...draft.sectors, s])]),
              )}
            />
          ))}
          {!cat && out.tags.length === 0 && out.sectors.length === 0 && (
            <p className="text-sm text-muted-foreground">No suggestions.</p>
          )}
        </ul>
      );
    }
    case 'RELATED_STOCKS': {
      const stocks = (job.output as Outputs['RELATED_STOCKS']).stocks ?? [];
      return (
        <ul className="space-y-1.5">
          {stocks.map((s) => {
            const have = draft.stocks.some(
              (x) => x.exchange === s.exchange && x.symbol === s.symbol,
            );
            return (
              <Suggestion
                key={s.symbol}
                text={
                  <>
                    <Badge variant="secondary">{s.symbol}</Badge> {s.name}
                    {s.reason && (
                      <span className="block text-xs text-muted-foreground">
                        {s.reason}
                      </span>
                    )}
                  </>
                }
                used={have || isUsed(job, s.symbol)}
                disabled={!editable}
                label="Add"
                onUse={use(s.symbol, () =>
                  change('stocks', [
                    ...draft.stocks,
                    { exchange: s.exchange, symbol: s.symbol, name: s.name },
                  ]),
                )}
              />
            );
          })}
        </ul>
      );
    }
    case 'RELATED_ARTICLES': {
      const out = job.output as Outputs['RELATED_ARTICLES'];
      if (out.picks.length === 0)
        return (
          <p className="text-sm text-muted-foreground">
            No published story is close enough.
          </p>
        );
      return (
        <ul className="space-y-1.5">
          {out.picks.map((p) => (
            <Suggestion
              key={p.id}
              text={
                <>
                  {p.title}
                  {p.reason && (
                    <span className="block text-xs text-muted-foreground">
                      {p.reason}
                    </span>
                  )}
                </>
              }
              used={
                isUsed(job, p.id) || draft.related.some((r) => r.id === p.id)
              }
              disabled={!editable}
              label="Add"
              onUse={use(p.id, () =>
                change('related', [
                  ...draft.related,
                  { id: p.id, title: p.title, slug: p.slug },
                ]),
              )}
            />
          ))}
        </ul>
      );
    }
    case 'REVIEW': {
      const out = job.output as Outputs['REVIEW'];
      if (out.findings.length === 0)
        return <p className="text-sm text-success">No problems found.</p>;
      return (
        <ul className="space-y-2">
          {out.findings.map((f, i) => (
            <li
              key={i}
              className="space-y-1 rounded-md border bg-background p-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <KindBadge kind={f.kind} />
                {f.kind !== 'unverified' && (
                  <FindButton
                    onFind={() => {
                      const editor = getEditor();
                      if (!editor || !selectQuote(editor, f.quote))
                        toast.error(
                          'Couldn’t find that passage in the story text.',
                        );
                    }}
                  />
                )}
              </div>
              <p className="text-muted-foreground">“{f.quote}”</p>
              <p>{f.explanation}</p>
              {f.suggestion && (
                <p className="text-xs text-muted-foreground">
                  Suggestion: {f.suggestion}
                </p>
              )}
            </li>
          ))}
        </ul>
      );
    }
    case 'EXPLAINERS': {
      const out = job.output as Outputs['EXPLAINERS'];
      return (
        <ul className="space-y-1.5">
          {out.terms.map((t) => (
            <Suggestion
              key={t.term}
              text={
                <>
                  <span className="font-medium">{t.term}</span>
                  <span className="block text-muted-foreground">
                    {t.explanation}
                  </span>
                </>
              }
              used={isUsed(job, t.term)}
              disabled={!editable}
              label="Insert box"
              onUse={() => {
                if (
                  insert({
                    type: 'marketWidget',
                    attrs: {
                      widget: 'educational',
                      v: 1,
                      config: { term: t.term, body: t.explanation },
                    },
                  })
                )
                  markUsed(job, t.term);
              }}
            />
          ))}
        </ul>
      );
    }
    case 'REWRITE_SECTION': {
      const out = job.output as Outputs['REWRITE_SECTION'];
      return (
        <div className="space-y-2">
          <div className="space-y-2 rounded-md border bg-background p-2 text-sm">
            {out.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={!editable || isUsed(job, 'replace')}
            onClick={() => replacePassage(job, out)}
          >
            {isUsed(job, 'replace') ? 'Replaced' : 'Replace the passage'}
          </Button>
        </div>
      );
    }
    case 'DRAFT_FROM_NOTES': {
      const out = job.output as Outputs['DRAFT_FROM_NOTES'];
      const hasText =
        (getEditor()?.state.doc.textContent.trim().length ?? 0) > 0;
      return (
        <div className="space-y-2">
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-background p-2 text-sm">
            {out.headline && <p className="font-semibold">{out.headline}</p>}
            {out.keyPoints.length > 0 && (
              <ul className="list-disc pl-5">
                {out.keyPoints.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            )}
            {out.sections.map((s, i) => (
              <div key={i} className="space-y-1">
                {s.heading && <p className="font-medium">{s.heading}</p>}
                {s.paragraphs.map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={!editable || isUsed(job, 'body')}
              onClick={() => insert(draftContent(out)) && markUsed(job, 'body')}
            >
              {hasText ? 'Insert at the cursor' : 'Use as the story'}
            </Button>
            {out.headline && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={!editable || isUsed(job, 'title')}
                onClick={use('title', () => change('title', out.headline))}
              >
                Use the headline
              </Button>
            )}
            {out.summary && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={!editable || isUsed(job, 'summary')}
                onClick={use('summary', () => change('summary', out.summary))}
              >
                Use the summary
              </Button>
            )}
          </div>
        </div>
      );
    }
    default:
      return null;
  }
}

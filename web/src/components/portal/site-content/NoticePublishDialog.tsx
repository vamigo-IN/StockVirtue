'use client';

import { AlertTriangle, Check, ChevronDown, ClipboardCopy, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useNoticeGate, usePrivacyNotice, useSiteItem } from '@/portal/queries';
import {
  canonicalJson,
  isMissingEndpoint,
  publishPrivacyNotice,
  shortDate,
  siteError,
  type NoticePublishBody,
} from '@/portal/site-content';
import type { PrivacyNoticeView, SiteItemView } from '@/portal/types';
import { lintContent } from './copy-lint';
import { docBlocks, docStats, docText, smallFix } from './plain-text';
import { useReturnFocus } from './return-focus';
import { ChangedLines } from './TextDiff';

/**
 * The privacy notice's publish dialog (W7 addendum §5.1, §5.12, §5.13,
 * §4.6, §4.7, §8.5). Opened from either privacy editor; it always shows both
 * languages. Minor: the version stays and nobody is asked again; an Admin
 * may publish only a small fix (same structure, at most 40 changed words a
 * language), the API checks it. Material (Super Admin): a new version id,
 * both languages together, both summaries, the two Yes/No questions with no
 * default (app analytics, the website's cookies), the gate's state, and the
 * new id typed to confirm.
 */

const SMALL_FIX_WORDS = 40;
/** The history and the app show a summary as one line. */
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

type Lang = 'en' | 'hi';
const KEY: Record<Lang, 'privacy' | 'privacy-hi'> = { en: 'privacy', hi: 'privacy-hi' };
const NAME: Record<Lang, string> = { en: 'English', hi: 'Hindi' };

interface Side {
  view: SiteItemView | undefined;
  live: unknown;
  draft: unknown;
  changed: boolean;
}

const bodyOf = (c: unknown) => (c as { body?: unknown } | null)?.body;

/** The text of the Cookies section (from the #cookies heading to the next H2). */
function cookiesSection(content: unknown): string {
  const blocks = docBlocks(bodyOf(content));
  const start = blocks.findIndex((b) => b.kind === 'h2' && b.anchor === 'cookies');
  if (start < 0) return '';
  const out: string[] = [];
  for (let i = start; i < blocks.length; i++) {
    if (i > start && blocks[i].kind === 'h2') break;
    out.push(blocks[i].text);
  }
  return out.join('\n');
}

/** A retention period from GET …/privacy-notice, which sends whole days. */
function asDays(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 365 && Number.isInteger(v / 365)) return `${v / 365} year${v / 365 === 1 ? '' : 's'}`;
    return `${v} day${v === 1 ? '' : 's'}`;
  }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

const humanise = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/** "What the system does" (§4.7): retention, inactivity, recipients and cookie names, from code. */
function SystemFacts({ facts }: { facts: PrivacyNoticeView['codeFacts'] }) {
  const retention: [string, string][] = Array.isArray(facts.retention)
    ? (facts.retention as Record<string, unknown>[]).map((r) => [String(r.label ?? r.name ?? r.key ?? ''), asDays(r.period ?? r.ms ?? r.value)])
    : facts.retention && typeof facts.retention === 'object'
      ? Object.entries(facts.retention as Record<string, unknown>).map(([k, v]) => [humanise(k), asDays(v)])
      : [];
  const recipients = Array.isArray(facts.recipients)
    ? (facts.recipients as unknown[]).map((r) => (typeof r === 'string' ? r : String((r as { name?: unknown }).name ?? '')))
    : [];
  // By purpose ({ necessary: [...], analytics: [...], advertising: [...] }), or a plain list.
  const cookies: string[] = Array.isArray(facts.cookieNames)
    ? (facts.cookieNames as unknown[]).map((c) => (typeof c === 'string' ? c : String((c as { name?: unknown }).name ?? '')))
    : facts.cookieNames && typeof facts.cookieNames === 'object'
      ? Object.entries(facts.cookieNames as Record<string, unknown>).map(
          ([purpose, names]) => `${humanise(purpose)}: ${Array.isArray(names) ? names.join(', ') : String(names)}`,
        )
      : [];
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <p className="font-medium">Kept for</p>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {retention.map(([k, v]) => (
            <li key={k}>
              {k}: {v}
            </li>
          ))}
          {facts.inactiveYears ? <li>Inactive accounts erased after {facts.inactiveYears} years</li> : null}
        </ul>
      </div>
      <div className="space-y-3">
        <div>
          <p className="font-medium">Receives personal data</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {recipients.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        {cookies.length > 0 && (
          <div>
            <p className="font-medium">Cookies the site sets</p>
            <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
              {cookies.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Panel({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-accent/40">
        {title}
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function YesNo({ id, legend, value, onChange, yes, no }: {
  id: string;
  legend: string;
  value: '' | 'yes' | 'no';
  onChange: (v: 'yes' | 'no') => void;
  yes: string;
  no: string;
}) {
  return (
    <fieldset className="space-y-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as 'yes' | 'no')} aria-label={legend}>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="yes" id={`${id}-yes`} className="mt-0.5" />
          <Label htmlFor={`${id}-yes`} className="font-normal leading-snug">
            Yes. <span className="text-muted-foreground">{yes}</span>
          </Label>
        </div>
        <div className="flex items-start gap-2">
          <RadioGroupItem value="no" id={`${id}-no`} className="mt-0.5" />
          <Label htmlFor={`${id}-no`} className="font-normal leading-snug">
            No. <span className="text-muted-foreground">{no}</span>
          </Label>
        </div>
      </RadioGroup>
    </fieldset>
  );
}

export function NoticePublishDialog({
  open,
  onOpenChange,
  currentLang,
  currentDraft,
  restoredOtherVersion,
  canMaterial,
  opsConsoleUrl,
  ensureSaved,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The language whose editor opened the dialog. */
  currentLang: Lang;
  /** That editor's text on screen (saved before publishing). */
  currentDraft: unknown;
  /** The draft was restored from a revision of another notice version: material only. */
  restoredOtherVersion: string | null;
  canMaterial: boolean;
  opsConsoleUrl: string;
  ensureSaved: () => Promise<number>;
  onPublished: () => Promise<void>;
}) {
  const en = useSiteItem(KEY.en, open);
  const hi = useSiteItem(KEY.hi, open);
  const notice = usePrivacyNotice(open);
  const gate = useNoticeGate(open);
  const [change, setChange] = useState<'' | 'MINOR' | 'MATERIAL'>('');
  const [langs, setLangs] = useState<Record<Lang, boolean>>({ en: false, hi: false });
  const [summary, setSummary] = useState('');
  const [summaryEn, setSummaryEn] = useState('');
  const [summaryHi, setSummaryHi] = useState('');
  const [keepDate, setKeepDate] = useState(false);
  const [analytics, setAnalytics] = useState<'' | 'yes' | 'no'>('');
  const [cookies, setCookies] = useState<'' | 'yes' | 'no'>('');
  const [typed, setTyped] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ version: string; material: boolean; summaryEn: string } | null>(null);
  const returnFocus = useReturnFocus(open);
  const returnFocusConfirm = useReturnFocus(confirm);

  const side = (l: Lang, q: typeof en): Side => {
    const view = q.data;
    const live = view?.live?.content ?? null;
    const draft = l === currentLang ? currentDraft : (view?.draft ?? live);
    return { view, live, draft, changed: !!view && canonicalJson(draft) !== canonicalJson(live) };
  };
  const sides: Record<Lang, Side> = { en: side('en', en), hi: side('hi', hi) };

  useEffect(() => {
    if (!open) return;
    setChange(restoredOtherVersion ? 'MATERIAL' : '');
    setSummary('');
    setSummaryEn('');
    setSummaryHi('');
    setKeepDate(false);
    setAnalytics('');
    setCookies('');
    setTyped('');
    setError(null);
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open) setLangs({ en: sides.en.changed, hi: sides.hi.changed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sides.en.changed, sides.hi.changed]);

  const fixes = useMemo(
    () => ({
      // Head and body, as the API's guard compares them.
      en: smallFix(sides.en.live, sides.en.draft),
      hi: smallFix(sides.hi.live, sides.hi.draft),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalJson(sides.en.draft), canonicalJson(sides.hi.draft), canonicalJson(sides.en.live), canonicalJson(sides.hi.live)],
  );
  const warnings = useMemo(
    () =>
      (['en', 'hi'] as Lang[]).flatMap((l) =>
        lintContent(sides[l].draft, { limitsKey: 'legal', itemKey: KEY[l], kind: 'LEGAL', live: sides[l].live }).map((w) => ({
          ...w,
          message: `${NAME[l]}: ${w.message}`,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canonicalJson(sides.en.draft), canonicalJson(sides.hi.draft)],
  );

  const current = notice.data?.current;
  const currentId = current?.version ?? current?.id ?? '';
  const nextId = notice.data?.nextId ?? '';
  const chosen = (['en', 'hi'] as Lang[]).filter((l) => langs[l]);
  const tooBig = (l: Lang) => fixes[l].words > SMALL_FIX_WORDS || fixes[l].structure.length > 0;
  const bigger = chosen.filter(tooBig);
  const cookiesChanged = (['en', 'hi'] as Lang[]).some((l) => cookiesSection(sides[l].live) !== cookiesSection(sides[l].draft));
  const noCookieVersion = cookiesChanged && (change === 'MINOR' || (change === 'MATERIAL' && cookies === 'no'));
  const loading = !en.data || !hi.data;

  const minorReady = change === 'MINOR' && chosen.length > 0 && (canMaterial || summary.trim().length > 0) && summary.length <= 280;
  const bothChanged = sides.en.changed && sides.hi.changed;
  const len = (s: string) => s.trim().length;
  const materialReady =
    change === 'MATERIAL' &&
    canMaterial &&
    bothChanged &&
    len(summaryEn) >= 20 &&
    len(summaryEn) <= 280 &&
    len(summaryHi) >= 20 &&
    len(summaryHi) <= 280 &&
    analytics !== '' &&
    cookies !== '' &&
    !!nextId &&
    typed.trim() === nextId;
  const ready = !busy && !loading && (minorReady || materialReady);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const mine = await ensureSaved();
      const version = (l: Lang) => (l === currentLang ? mine : (sides[l].view?.draftVersion ?? 0));
      let body: NoticePublishBody;
      if (change === 'MATERIAL') {
        body = {
          change: 'MATERIAL',
          en: { draftVersion: version('en') },
          hi: { draftVersion: version('hi') },
          summaryEn: oneLine(summaryEn),
          summaryHi: oneLine(summaryHi),
          confirmVersion: typed.trim(),
          affectsAnalytics: analytics === 'yes',
          affectsCookies: cookies === 'yes',
        };
      } else {
        body = {
          change: 'MINOR',
          ...(langs.en ? { en: { draftVersion: version('en') } } : {}),
          ...(langs.hi ? { hi: { draftVersion: version('hi') } } : {}),
          ...(summary.trim() ? { summaryEn: oneLine(summary) } : {}),
          keepDate,
        };
      }
      const res = await publishPrivacyNotice(body);
      setConfirm(false);
      await onPublished();
      if (change === 'MATERIAL') {
        setDone({ version: res.version, material: true, summaryEn: summaryEn.trim() });
      } else {
        toast.success(`Published. The notice stays version ${res.version || currentId}; nobody is asked again.`);
        onOpenChange(false);
      }
    } catch (err) {
      setConfirm(false);
      setError(siteError(err));
    } finally {
      setBusy(false);
    }
  }

  const everyone = gate.data?.activeAccounts;
  const gateLine = gate.data ? (
    gate.data.enabled && !gate.data.forcedOff ? (
      <>
        The app notice gate is on. After this publish, every active account
        {typeof everyone === 'number' ? ` (${everyone.toLocaleString('en-IN')})` : ''} can use the app only to read and
        accept the new notice, until it does.
      </>
    ) : (
      <>The app notice gate is off. People on apps older than 1.4.0 won’t be asked.</>
    )
  ) : gate.error && isMissingEndpoint(gate.error) ? (
    <>The app notice gate is off. People on apps older than 1.4.0 won’t be asked.</>
  ) : null;

  if (done) {
    const message = done.summaryEn;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg" onCloseAutoFocus={returnFocus}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="size-5 text-success" /> Notice {done.version} is published
            </DialogTitle>
            <DialogDescription>
              Both notices show version {done.version}. App users are asked to read and accept it at their next start.
            </DialogDescription>
          </DialogHeader>
          <section className="space-y-2 rounded-lg border p-3">
            <h3 className="text-sm font-medium">Tell users in the app (optional)</h3>
            <p className="text-sm text-muted-foreground">
              Only the ops console’s admin can send it. Copy the text and send it from there, or pass it on.
            </p>
            <div className="rounded-md bg-muted/40 p-2 text-sm">
              <p className="font-medium">We updated our privacy notice</p>
              <p className="text-muted-foreground">{message}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(`We updated our privacy notice\n\n${message}`)
                    .then(() => toast.success('Copied the title and the message.'))
                    .catch(() => toast.error('Couldn’t copy. Select the text and copy it instead.'));
                }}
              >
                <ClipboardCopy /> Copy title and message
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={opsConsoleUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Open the ops console’s Notifications
                </a>
              </Button>
            </div>
          </section>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Publish the privacy notice</DialogTitle>
          <DialogDescription>
            English and Hindi, under one version{currentId ? ` (now ${currentId})` : ''}. Every publish is kept in the
            history; consent records point at it.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading both notices…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(['en', 'hi'] as Lang[]).map((l) => {
                const r = sides[l].view?.live?.revision;
                return (
                  <div key={l} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      {NAME[l]} {sides[l].changed ? '· changed' : '· no changes'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r ? `Live: ${r.noticeVersion ?? currentId} · revision ${r.number} · ${shortDate(r.publishedAt)}` : 'Not published'}
                    </p>
                    {sides[l].changed && (
                      <p className={cn('mt-1 text-xs', tooBig(l) ? 'text-warning' : 'text-muted-foreground')}>
                        {fixes[l].words} of {SMALL_FIX_WORDS} words changed;{' '}
                        {fixes[l].structure.length ? fixes[l].structure.join(', ') : 'structure unchanged'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <RadioGroup value={change} onValueChange={(v) => setChange(v as 'MINOR' | 'MATERIAL')} aria-label="Kind of change">
              <div className={cn('flex items-start gap-3 rounded-lg border p-3', restoredOtherVersion && 'opacity-60')}>
                <RadioGroupItem value="MINOR" id="chg-minor" disabled={!!restoredOtherVersion} className="mt-1" />
                <Label htmlFor="chg-minor" className="block font-normal leading-snug">
                  <span className="font-medium">Minor change</span>
                  <span className="block text-muted-foreground">
                    A typo, formatting or a wording fix that doesn’t change what we do with data. The version stays{' '}
                    {currentId || 'as it is'}, and nobody is asked again.
                  </span>
                </Label>
              </div>
              <div className={cn('flex items-start gap-3 rounded-lg border p-3', !canMaterial && 'opacity-60')}>
                <RadioGroupItem value="MATERIAL" id="chg-material" disabled={!canMaterial} className="mt-1" />
                <Label htmlFor="chg-material" className="block font-normal leading-snug">
                  <span className="font-medium">Material change</span>
                  <span className="block text-muted-foreground">
                    It changes what data we collect, why, who we share it with, how long we keep it, or people’s rights.
                    Everyone with an account will be asked to read and accept the notice again in the app.
                  </span>
                  {!canMaterial && <span className="mt-1 block text-xs">Only a Super Admin can publish a material change.</span>}
                </Label>
              </div>
            </RadioGroup>
            {restoredOtherVersion && (
              <p className="text-sm text-warning">
                This text belongs to notice version {restoredOtherVersion}. Publishing it again is a material change.
              </p>
            )}

            {change === 'MINOR' && (
              <div className="space-y-3">
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">Publish</legend>
                  {(['en', 'hi'] as Lang[]).map((l) => (
                    <div key={l} className="flex items-center gap-2">
                      <Checkbox
                        id={`lang-${l}`}
                        checked={langs[l]}
                        disabled={!sides[l].changed}
                        onCheckedChange={(v) => setLangs((s) => ({ ...s, [l]: v === true }))}
                      />
                      <Label htmlFor={`lang-${l}`} className="font-normal">
                        The {NAME[l]} notice{sides[l].changed ? '' : ' (no changes)'}
                      </Label>
                    </div>
                  ))}
                </fieldset>
                {bigger.length > 0 && !canMaterial && (
                  <Alert className="border-warning/40 bg-warning/5">
                    <AlertTriangle className="text-warning" />
                    <AlertDescription>
                      This looks like more than a small fix (
                      {bigger.map((l) => `${NAME[l]}: ${fixes[l].words} words changed${fixes[l].structure.length ? `, ${fixes[l].structure.join(', ')}` : ''}`).join('; ')}
                      ). A Super Admin must publish it, as a minor or a material change.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1.5">
                  <div className="flex items-end justify-between">
                    <Label htmlFor="minor-summary">What changed{canMaterial ? ' (optional)' : ''}</Label>
                    <span className={cn('text-xs', summary.length > 280 ? 'text-destructive' : 'text-muted-foreground')}>{summary.length} / 280</span>
                  </div>
                  <Textarea id="minor-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Super Admins get an email with it for every minor change.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox id="minor-keep" checked={keepDate} onCheckedChange={(v) => setKeepDate(v === true)} className="mt-0.5" />
                  <Label htmlFor="minor-keep" className="font-normal leading-snug">
                    This only fixes a typo or formatting: keep the current “Updated” date
                  </Label>
                </div>
              </div>
            )}

            {change === 'MATERIAL' && canMaterial && (
              <div className="space-y-3">
                {!bothChanged && (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertDescription>
                      A material change publishes the English and Hindi notices together. Update the{' '}
                      {sides.en.changed ? 'Hindi' : 'English'} notice and its summary first.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['en', summaryEn, setSummaryEn, 'What changed (English)'],
                      ['hi', summaryHi, setSummaryHi, 'What changed (Hindi)'],
                    ] as const
                  ).map(([l, v, set, label]) => (
                    <div key={l} className="space-y-1.5">
                      <div className="flex items-end justify-between">
                        <Label htmlFor={`sum-${l}`}>{label}</Label>
                        <span className={cn('text-xs', v.trim().length > 0 && (v.trim().length < 20 || v.length > 280) ? 'text-destructive' : 'text-muted-foreground')}>
                          {v.length} / 280
                        </span>
                      </div>
                      <Textarea id={`sum-${l}`} rows={3} value={v} onChange={(e) => set(e.target.value)} lang={l} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  App users see the summary when they are asked again, and /privacy shows it under the “Updated” line for 90 days.
                </p>
                <YesNo
                  id="q-analytics"
                  legend="Does this change affect app analytics (what the app collects for analytics, why, or who receives it)?"
                  value={analytics}
                  onChange={setAnalytics}
                  yes="App users are asked about analytics again."
                  no="Each person’s analytics choice is kept."
                />
                <YesNo
                  id="q-cookies"
                  legend="Does this change affect the website’s cookies or the services in use (which analytics or advertising services, their cookies, or what we use them for)?"
                  value={cookies}
                  onChange={setCookies}
                  yes="Every website visitor is asked to choose their cookies again."
                  no="Visitors’ cookie choices stay."
                />
                {gateLine && (
                  <p className="text-sm text-muted-foreground">
                    {gateLine}{' '}
                    <Link href="/admin/settings#privacy" className="text-primary underline-offset-4 hover:underline">
                      Settings → Privacy
                    </Link>
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-id">
                    Type the new version, <span className="font-mono">{nextId || '…'}</span>, to confirm
                  </Label>
                  <Input id="confirm-id" value={typed} onChange={(e) => setTyped(e.target.value)} className="w-48 font-mono" autoComplete="off" spellCheck={false} />
                </div>
              </div>
            )}

            {noCookieVersion && (
              <Alert className="border-warning/40 bg-warning/5">
                <AlertTriangle className="text-warning" />
                <AlertDescription>
                  The Cookies section changed. Website visitors are asked to choose their cookies again only when a
                  material change answers Yes to “Does this change affect the website’s cookies or the services in use?”
                </AlertDescription>
              </Alert>
            )}

            <Panel title="Changes in each language" defaultOpen>
              <div className="grid gap-4 md:grid-cols-2">
                {(['en', 'hi'] as Lang[]).map((l) => (
                  <div key={l} lang={l}>
                    <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{NAME[l]}</p>
                    <ChangedLines before={docText(bodyOf(sides[l].live))} after={docText(bodyOf(sides[l].draft))} max={8} />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="English and Hindi side by side">
              <ParityTable en={sides.en} hi={sides.hi} />
            </Panel>

            {notice.data?.codeFacts && (
              <Panel title="What the system does">
                <p className="mb-2 text-sm text-muted-foreground">
                  Changing a retention period or a recipient in the text doesn’t change what the system does. Ask
                  engineering first.
                </p>
                <SystemFacts facts={notice.data.codeFacts} />
              </Panel>
            )}

            {warnings.length > 0 && (
              <Panel title={`Copy checks (${warnings.length})`}>
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {warnings.slice(0, 20).map((w) => (
                    <li key={`${w.path}|${w.message}`}>{w.message}</li>
                  ))}
                </ul>
              </Panel>
            )}

            {(notice.error || error) && (
              <p className="text-sm text-destructive" role="alert">
                {error ?? siteError(notice.error)}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => (change === 'MATERIAL' ? setConfirm(true) : void publish())}
            disabled={!ready}
            variant={change === 'MATERIAL' ? 'destructive' : 'default'}
          >
            {busy && <Loader2 className="animate-spin" />}
            {change === 'MATERIAL' ? `Publish version ${nextId}…` : 'Publish'}
          </Button>
        </DialogFooter>

        <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
          <AlertDialogContent onCloseAutoFocus={returnFocusConfirm}>
            <AlertDialogHeader>
              <AlertDialogTitle>Publish notice version {nextId}?</AlertDialogTitle>
              <AlertDialogDescription>
                Everyone with an account will be asked to read and accept it again in the app.
                {cookies === 'yes' ? ' Every website visitor is asked to choose their cookies again.' : ''}
                {analytics === 'yes' ? ' App users are asked about analytics again.' : ' Each person’s analytics choice is kept.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault();
                  void publish();
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {busy ? 'Publishing…' : 'Publish'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function ParityTable({ en, hi }: { en: Side; hi: Side }) {
  const row = (s: Side) => {
    const st = docStats(bodyOf(s.draft));
    const r = s.view?.live?.revision;
    return { st, r };
  };
  const a = row(en);
  const b = row(hi);
  const newerMinor =
    a.r && b.r && a.r.change === 'MINOR' && new Date(a.r.publishedAt).getTime() > new Date(b.r.publishedAt).getTime();
  const cells: [string, (x: typeof a) => React.ReactNode][] = [
    ['Live revision', (x) => (x.r ? `${x.r.number} · ${shortDate(x.r.publishedAt)}` : '—')],
    ['Headings', (x) => x.st.h2],
    ['Tables', (x) => x.st.tables],
    ['Table rows', (x) => x.st.tableRows],
    ['Link names', (x) => <span className="font-mono text-xs break-all">{x.st.anchors.join(', ')}</span>],
  ];
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 pr-2 font-medium" />
            <th className="py-1 pr-2 font-medium">English</th>
            <th className="py-1 font-medium">Hindi</th>
          </tr>
        </thead>
        <tbody>
          {cells.map(([label, f]) => (
            <tr key={label} className="border-t align-top">
              <th scope="row" className="py-1 pr-2 text-left font-normal text-muted-foreground">
                {label}
              </th>
              <td className="py-1 pr-2 tabular-nums">{f(a)}</td>
              <td className="py-1 tabular-nums">{f(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {newerMinor && (
        <p className="text-xs text-warning">
          The English notice has a newer minor change than the Hindi one. Check whether the Hindi needs the same fix.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        For the lawyer: the Hindi retention table has no “Push tokens” row, and the Hindi data table has two columns.
      </p>
    </div>
  );
}

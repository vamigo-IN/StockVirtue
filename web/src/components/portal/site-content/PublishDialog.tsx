'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { addDays, istToday, siteError, type PublishBody } from '@/portal/site-content';
import type { LintWarning } from './copy-lint';
import { useReturnFocus } from './return-focus';

/**
 * The publish dialog of every item except the two privacy notices (W7
 * addendum §8.5, §4.5): what changed, the lint warnings, a "What changed"
 * note (required for legal documents), the keep-date box, and on the terms
 * "Does this change matter to users?" with the confirmation that users were
 * told (TERMS_MIN_NOTICE_DAYS days before today; 0 for now, W7 decision 5,
 * and there is no scheduled publish).
 */
export function PublishDialog({
  open,
  onOpenChange,
  itemKey,
  kind,
  title,
  url,
  firstPublish,
  changes,
  warnings,
  layoutNotes = [],
  termsMinDays,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemKey: string;
  kind: 'DESIGNED' | 'SHARED' | 'CHROME' | 'LEGAL' | 'CUSTOM';
  title: string;
  /** Where it shows (a custom page's first publish confirms it). */
  url: string | null;
  firstPublish: boolean;
  changes: string[];
  warnings: LintWarning[];
  /** The layout meters' warnings on a designed page (over budget never blocks, §3.1). */
  layoutNotes?: string[];
  termsMinDays: number;
  onPublish: (body: Omit<PublishBody, 'draftVersion'>) => Promise<void>;
}) {
  const legal = kind === 'LEGAL';
  const terms = itemKey === 'terms';
  const showsDate = legal && itemKey !== 'privacy-requests';
  const maxSummary = legal ? 300 : 200;
  const latestTold = addDays(istToday(), -termsMinDays);
  const [summary, setSummary] = useState('');
  const [keepDate, setKeepDate] = useState(false);
  const [matters, setMatters] = useState<'' | 'yes' | 'no'>('');
  const [toldOn, setToldOn] = useState(latestTold);
  const [toldVia, setToldVia] = useState<'app' | 'email' | 'app+email'>('app');
  const [told, setTold] = useState(false);
  const [urlOk, setUrlOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnFocus = useReturnFocus(open);

  useEffect(() => {
    if (open) {
      setSummary('');
      setKeepDate(false);
      setMatters('');
      setToldOn(addDays(istToday(), -termsMinDays));
      setTold(false);
      setUrlOk(false);
      setError(null);
    }
  }, [open, termsMinDays]);

  const material = terms && matters === 'yes';
  const summaryOk = legal ? summary.trim().length > 0 : true;
  const termsOk = !terms || matters === 'no' || (matters === 'yes' && told && !!toldOn && toldOn <= latestTold);
  const urlCheck = !(kind === 'CUSTOM' && firstPublish) || urlOk;
  const ready = summaryOk && termsOk && urlCheck && summary.length <= maxSummary && !busy;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await onPublish({
        // The history keeps it as one line.
        summary: summary.replace(/\s+/g, ' ').trim() || undefined,
        ...(showsDate ? { keepDate: material ? false : keepDate } : {}),
        ...(terms
          ? {
              mattersToUsers: material,
              ...(material ? { announcedAt: new Date(`${toldOn}T12:00:00+05:30`).toISOString(), announcedVia: toldVia } : {}),
            }
          : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setError(siteError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Publish {title}?</DialogTitle>
          <DialogDescription>
            {kind === 'CHROME'
              ? 'The menus and footer change on every page within a few seconds.'
              : 'Readers see it within a few seconds. Every publish is kept in the history.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <h3 className="mb-1 text-sm font-medium">What changes</h3>
            {changes.length ? (
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-muted-foreground">
                {changes.slice(0, 30).map((c) => (
                  <li key={c}>{c}</li>
                ))}
                {changes.length > 30 && <li>and {changes.length - 30} more</li>}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">The text the site shows now, published as it is.</p>
            )}
          </section>

          {warnings.length > 0 && (
            <Alert className="border-warning/40 bg-warning/5">
              <AlertTriangle className="text-warning" />
              <AlertDescription>
                <p className="font-medium text-foreground">Copy checks ({warnings.length}). They don’t block publishing.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {warnings.slice(0, 8).map((w) => (
                    <li key={`${w.path}|${w.message}`}>{w.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {layoutNotes.length > 0 && (
            <Alert className="border-warning/40 bg-warning/5" data-layout-notes>
              <AlertTriangle className="text-warning" />
              <AlertDescription>
                <p className="font-medium text-foreground">Layout. It doesn’t block publishing.</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {layoutNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {terms && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Does this change matter to users?</legend>
              <p className="text-xs text-muted-foreground">
                What they may do, what we may do, liability, fees, governing law, or how to reach us. The terms promise
                that such changes are announced in the app or by email before they take effect.
              </p>
              <RadioGroup value={matters} onValueChange={(v) => setMatters(v as 'yes' | 'no')} aria-label="Does this change matter to users?">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="no" id="matters-no" className="mt-0.5" />
                  <Label htmlFor="matters-no" className="font-normal">
                    No: wording, layout or a fix that changes nothing for users.
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="yes" id="matters-yes" className="mt-0.5" />
                  <Label htmlFor="matters-yes" className="font-normal">
                    Yes: the “Updated” date moves, and users must have been told first.
                  </Label>
                </div>
              </RadioGroup>
              {material && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Label htmlFor="told-on" className="font-normal">
                      Users were told on
                    </Label>
                    <Input id="told-on" type="date" max={latestTold} value={toldOn} onChange={(e) => setToldOn(e.target.value)} className="h-8 w-40" />
                    <Label htmlFor="told-via" className="font-normal">
                      by
                    </Label>
                    <select
                      id="told-via"
                      value={toldVia}
                      onChange={(e) => setToldVia(e.target.value as typeof toldVia)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="app">in the app</option>
                      <option value="email">by email</option>
                      <option value="app+email">both</option>
                    </select>
                  </div>
                  {termsMinDays > 0 && (
                    <p className="text-xs text-muted-foreground">Users must be told at least {termsMinDays} days before.</p>
                  )}
                  <div className="flex items-start gap-2">
                    <Checkbox id="told-confirm" checked={told} onCheckedChange={(v) => setTold(v === true)} className="mt-0.5" />
                    <Label htmlFor="told-confirm" className="font-normal leading-snug">
                      I confirm users were told about this change on that day.
                    </Label>
                  </div>
                  {!told && (
                    <p className="text-xs text-warning">
                      Tell users first (the terms promise it), then publish on or after the day the change should take effect.
                    </p>
                  )}
                </div>
              )}
            </fieldset>
          )}

          <div className="space-y-1.5">
            <div className="flex items-end justify-between">
              <Label htmlFor="pub-summary">What changed{legal ? '' : ' (optional)'}</Label>
              <span className={summary.length > maxSummary ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {summary.length} / {maxSummary}
              </span>
            </div>
            <Textarea
              id="pub-summary"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={legal ? 'Kept with this version in the history.' : 'A note for the history.'}
            />
          </div>

          {showsDate && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="keep-date"
                checked={material ? false : keepDate}
                disabled={material}
                onCheckedChange={(v) => setKeepDate(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="keep-date" className="font-normal leading-snug">
                This only fixes a typo or formatting: keep the current “Updated” date
              </Label>
            </div>
          )}

          {kind === 'CUSTOM' && firstPublish && url && (
            <div className="flex items-start gap-2 rounded-lg border p-3">
              <Checkbox id="url-ok" checked={urlOk} onCheckedChange={(v) => setUrlOk(v === true)} className="mt-0.5" />
              <Label htmlFor="url-ok" className="block font-normal leading-snug">
                The page goes live at <span className="font-mono break-all">stockvirtue.com{url}</span>. Changing the
                address later keeps a redirect from this one.
              </Label>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void publish()} disabled={!ready}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Publishing…' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Loader2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/editor/widget-form/pickers';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime } from '@/portal/format';
import { useCategories } from '@/portal/queries';
import type {
  NewsSourceView,
  SourceFormat,
  SourcePreview,
  SourceType,
  SourceUsage,
} from '@/portal/types';
import { POLL_CHOICES, SOURCE_TYPES, USAGE } from './labels';

const JSON_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: 'title', label: 'Headline', placeholder: 'title' },
  { key: 'url', label: 'Link', placeholder: 'url' },
  { key: 'id', label: 'Unique id', placeholder: 'id' },
  { key: 'publishedAt', label: 'Published time', placeholder: 'publishedAt' },
  { key: 'summary', label: 'Summary', placeholder: 'summary' },
  { key: 'content', label: 'Full text', placeholder: 'content' },
  { key: 'author', label: 'Author', placeholder: 'author' },
];

/** Official feeds checked to work with the newsroom's fetcher. */
const PRESETS: {
  label: string;
  name: string;
  type: SourceType;
  url: string;
  attribution: string;
}[] = [
  {
    label: 'RBI press releases',
    name: 'RBI press releases',
    type: 'RBI',
    url: 'https://www.rbi.org.in/pressreleases_rss.xml',
    attribution: 'Reserve Bank of India',
  },
  {
    label: 'RBI notifications',
    name: 'RBI notifications',
    type: 'RBI',
    url: 'https://www.rbi.org.in/notifications_rss.xml',
    attribution: 'Reserve Bank of India',
  },
  {
    label: 'SEBI updates',
    name: 'SEBI updates',
    type: 'SEBI',
    url: 'https://www.sebi.gov.in/sebirss.xml',
    attribution: 'Securities and Exchange Board of India',
  },
];

interface Form {
  name: string;
  type: SourceType;
  format: SourceFormat;
  url: string;
  authMode: 'none' | 'header' | 'query';
  authName: string;
  secret: string;
  removeSecret: boolean;
  itemsPath: string;
  fields: Record<string, string>;
  pollMinutes: number;
  categoryId: string;
  usage: SourceUsage;
  allowAiDrafts: boolean;
  attribution: string;
  licenceNote: string;
  notifyEditors: boolean;
  isActive: boolean;
}

function toForm(s?: NewsSourceView | null): Form {
  return {
    name: s?.name ?? '',
    type: s?.type ?? 'RSS',
    format: s?.format ?? 'FEED',
    url: s?.url ?? '',
    authMode: s?.auth.mode ?? 'none',
    authName: s?.auth.name ?? '',
    secret: '',
    removeSecret: false,
    itemsPath: s?.mapping.itemsPath ?? '',
    fields: s?.mapping.fields ?? {},
    pollMinutes: s?.pollMinutes ?? 30,
    categoryId: s?.category?.id ?? 'none',
    usage: s?.usage ?? 'HEADLINE_ONLY',
    allowAiDrafts: s?.allowAiDrafts ?? false,
    attribution: s?.attribution ?? '',
    licenceNote: s?.licenceNote ?? '',
    notifyEditors: s?.notifyEditors ?? false,
    isActive: s?.isActive ?? true,
  };
}

function toBody(f: Form) {
  const manual = f.type === 'MANUAL';
  return {
    name: f.name.trim(),
    type: f.type,
    format: manual ? 'NONE' : f.format,
    ...(manual ? {} : { url: f.url.trim() }),
    auth:
      manual || f.authMode === 'none'
        ? { mode: 'none' }
        : { mode: f.authMode, name: f.authName.trim() },
    // Write-only: send a key only when one was typed (or removed).
    ...(f.removeSecret
      ? { secret: '' }
      : f.secret.trim()
        ? { secret: f.secret.trim() }
        : {}),
    ...(f.format === 'JSON_API' && !manual
      ? { mapping: { itemsPath: f.itemsPath.trim(), fields: f.fields } }
      : {}),
    pollMinutes: f.pollMinutes,
    categoryId: f.categoryId === 'none' ? null : f.categoryId,
    usage: f.usage,
    allowAiDrafts: f.usage === 'HEADLINE_ONLY' ? false : f.allowAiDrafts,
    attribution: f.attribution.trim(),
    licenceNote: f.licenceNote.trim(),
    notifyEditors: f.notifyEditors,
    isActive: f.isActive,
  };
}

export function SourceDialog({
  open,
  onOpenChange,
  source,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this source; absent = adding one. */
  source?: NewsSourceView | null;
  onSaved: (s: NewsSourceView) => void;
}) {
  const editing = !!source;
  const [f, setF] = useState<Form>(() => toForm(source));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const categories = useCategories();
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Fresh form each time the dialog opens (not on every parent render).
  useEffect(() => {
    if (open) {
      setF(toForm(sourceRef.current));
      setPreview(null);
      setTestError(null);
    }
  }, [open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((cur) => ({ ...cur, [k]: v }));
  const manual = f.type === 'MANUAL';

  async function test() {
    setTesting(true);
    setPreview(null);
    setTestError(null);
    try {
      const body = toBody(f);
      const res = await api<SourcePreview>('staff/sources/test', {
        method: 'POST',
        body: { ...body, ...(source ? { sourceId: source.id } : {}) },
      });
      setPreview(res);
    } catch (err) {
      setTestError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = toBody(f);
      const saved = source
        ? await api<NewsSourceView>(`staff/sources/${source.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<NewsSourceView>('staff/sources', { method: 'POST', body });
      toast.success(
        editing
          ? 'Source saved.'
          : manual
            ? `Added “${saved.name}”.`
            : `Added “${saved.name}”. The worker fetches it within a minute.`,
      );
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={save} className="space-y-5">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${source.name}` : 'Add a news source'}
            </DialogTitle>
            <DialogDescription>
              The newsroom worker checks the source on its schedule. New items
              wait in Incoming news for a person; nothing is published
              automatically.
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Start from an official feed</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.url}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setF((cur) => ({
                        ...cur,
                        name: p.name,
                        type: p.type,
                        format: 'FEED',
                        url: p.url,
                        attribution: p.attribution,
                        usage: 'SUMMARY',
                        authMode: 'none',
                      }))
                    }
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="src-name">Name</Label>
              <Input
                id="src-name"
                value={f.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. RBI press releases"
                maxLength={120}
                required
              />
            </div>
            <ChoiceSelect
              id="src-type"
              label="Kind of source"
              value={f.type}
              onChange={(v) => set('type', v)}
              choices={SOURCE_TYPES}
            />
          </div>

          {!manual && (
            <>
              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <ChoiceSelect
                  id="src-format"
                  label="Read it as"
                  value={f.format === 'NONE' ? 'FEED' : f.format}
                  onChange={(v) => set('format', v)}
                  choices={[
                    { value: 'FEED', label: 'RSS or Atom feed' },
                    { value: 'JSON_API', label: 'JSON API' },
                  ]}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="src-url">Address</Label>
                  <Input
                    id="src-url"
                    type="url"
                    value={f.url}
                    onChange={(e) => set('url', e.target.value)}
                    placeholder="https://example.com/feed.xml"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[180px_1fr_1fr]">
                <ChoiceSelect
                  id="src-auth"
                  label="API key"
                  value={f.authMode}
                  onChange={(v) => set('authMode', v)}
                  choices={[
                    { value: 'none', label: 'None needed' },
                    { value: 'header', label: 'In a header' },
                    { value: 'query', label: 'In the address' },
                  ]}
                />
                {f.authMode !== 'none' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="src-auth-name">
                        {f.authMode === 'header'
                          ? 'Header name'
                          : 'Parameter name'}
                      </Label>
                      <Input
                        id="src-auth-name"
                        value={f.authName}
                        onChange={(e) => set('authName', e.target.value)}
                        placeholder={
                          f.authMode === 'header' ? 'X-API-Key' : 'apikey'
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="src-secret">Key</Label>
                      <Input
                        id="src-secret"
                        type="password"
                        autoComplete="new-password"
                        value={f.secret}
                        onChange={(e) => {
                          set('secret', e.target.value);
                          set('removeSecret', false);
                        }}
                        placeholder={
                          source?.hasSecret && !f.removeSecret
                            ? 'Saved — leave blank to keep'
                            : 'Paste the key'
                        }
                      />
                      {source?.hasSecret && !source.secretReadable && (
                        <p className="text-xs text-destructive">
                          The saved key can’t be read any more (the secrets key
                          changed). Enter it again.
                        </p>
                      )}
                      {source?.hasSecret && !f.secret && (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          onClick={() => set('removeSecret', !f.removeSecret)}
                        >
                          {f.removeSecret
                            ? 'Keep the saved key'
                            : 'Remove the saved key'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              {f.authMode !== 'none' && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  Keys are encrypted before they are stored and are never shown
                  again, to anyone. For a header like “Authorization: Bearer …”,
                  paste the whole value.
                </p>
              )}

              {f.format === 'JSON_API' && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="src-items">
                      Where the list of items is
                    </Label>
                    <Input
                      id="src-items"
                      value={f.itemsPath}
                      onChange={(e) => set('itemsPath', e.target.value)}
                      placeholder="e.g. data.articles (blank = the top level)"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {JSON_FIELDS.map((fl) => (
                      <div key={fl.key} className="space-y-1">
                        <Label htmlFor={`src-f-${fl.key}`} className="text-xs">
                          {fl.label}
                        </Label>
                        <Input
                          id={`src-f-${fl.key}`}
                          value={f.fields[fl.key] ?? ''}
                          onChange={(e) =>
                            set('fields', {
                              ...f.fields,
                              [fl.key]: e.target.value,
                            })
                          }
                          placeholder={fl.placeholder}
                          className="h-8"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dot paths inside each item, e.g. <code>meta.published</code>
                    . Blank uses the name shown.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void test()}
                  disabled={testing || !f.url.trim()}
                >
                  {testing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <FlaskConical />
                  )}
                  Test this source
                </Button>
                {testError && (
                  <Alert variant="destructive">
                    <AlertDescription>{testError}</AlertDescription>
                  </Alert>
                )}
                {preview && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium text-success">
                      <CheckCircle2 className="size-4" /> It works:{' '}
                      {preview.found} {preview.found === 1 ? 'item' : 'items'}{' '}
                      found. The first few, as they would be stored:
                    </p>
                    <ul className="mt-2 space-y-2">
                      {preview.items.map((i, n) => (
                        <li key={n} className="min-w-0">
                          <p className="truncate font-medium">{i.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.publishedAt
                              ? formatDateTime(i.publishedAt)
                              : 'No time given'}
                            {i.url && (
                              <>
                                {' · '}
                                <a
                                  href={i.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 hover:underline"
                                >
                                  original <ExternalLink className="size-3" />
                                </a>
                              </>
                            )}
                            {i.hasFullText && ' · full text'}
                          </p>
                          {i.summary && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {i.summary}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ChoiceSelect
                  id="src-poll"
                  label="Check it"
                  value={f.pollMinutes}
                  onChange={(v) => set('pollMinutes', v)}
                  choices={POLL_CHOICES}
                />
                <ChoiceSelect
                  id="src-cat"
                  label="Default category"
                  value={f.categoryId}
                  onChange={(v) => set('categoryId', v)}
                  choices={[
                    { value: 'none', label: 'Suggest from the topic' },
                    ...(categories.data ?? []).map((c) => ({
                      value: c.id,
                      label: c.name,
                    })),
                  ]}
                />
              </div>
            </>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              What its terms let us keep
            </legend>
            {(Object.keys(USAGE) as SourceUsage[]).map((u) => (
              <label
                key={u}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                  f.usage === u && 'border-primary bg-primary/5',
                )}
              >
                <input
                  type="radio"
                  name="usage"
                  className="mt-1"
                  checked={f.usage === u}
                  onChange={() => set('usage', u)}
                />
                <span>
                  <span className="text-sm font-medium">{USAGE[u].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {USAGE[u].hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="src-credit">Credit on stories</Label>
              <Input
                id="src-credit"
                value={f.attribution}
                onChange={(e) => set('attribution', e.target.value)}
                placeholder="e.g. Reserve Bank of India"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-licence">Licence notes</Label>
              <Textarea
                id="src-licence"
                value={f.licenceNote}
                onChange={(e) => set('licenceNote', e.target.value)}
                placeholder="Agreement, expiry, conditions…"
                rows={2}
                maxLength={2000}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <SwitchRow
              id="src-ai"
              label="Allow AI-assisted drafts from this source"
              hint={
                f.usage === 'HEADLINE_ONLY'
                  ? 'Not with headline-only use: there isn’t enough to draft from.'
                  : 'Only if the source’s terms allow it. Drafts always go to a person first.'
              }
              checked={f.usage !== 'HEADLINE_ONLY' && f.allowAiDrafts}
              disabled={f.usage === 'HEADLINE_ONLY'}
              onChange={(v) => set('allowAiDrafts', v)}
            />
            {!manual && (
              <SwitchRow
                id="src-notify"
                label="Email editors when new items arrive"
                hint="At most one email per half hour for this source."
                checked={f.notifyEditors}
                onChange={(v) => set('notifyEditors', v)}
              />
            )}
            {!manual && (
              <SwitchRow
                id="src-active"
                label="Active"
                hint="Paused sources aren’t fetched; their items stay."
                checked={f.isActive}
                onChange={(v) => set('isActive', v)}
              />
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || f.name.trim().length < 2}>
              {saving ? 'Saving…' : editing ? 'Save source' : 'Add source'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

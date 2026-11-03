'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import { qk, useSiteSettings } from '@/portal/queries';
import type { SiteSettings, SiteSettingsView } from '@/portal/types';

const SOCIAL = [
  { key: 'twitter', label: 'X (Twitter)' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'facebook', label: 'Facebook' },
] as const;

const CODE = [
  {
    key: 'headCode',
    label: 'Inside <head>',
    hint: 'Verification meta tags (Google Search Console, Bing) and analytics loaders.',
  },
  {
    key: 'bodyStartCode',
    label: 'Start of <body>',
    hint: 'Snippets that must load first, e.g. Google Tag Manager <noscript>.',
  },
  {
    key: 'bodyEndCode',
    label: 'End of <body>',
    hint: 'Chat widgets and scripts that can load last.',
  },
] as const;

const url = z.union([
  z.literal(''),
  z.url({ protocol: /^https?$/, error: 'Use a full https:// link.' }),
]);
const schema = z.object({
  siteTitle: z.string().max(200),
  siteDescription: z.string().max(500),
  contactEmail: z.union([
    z.literal(''),
    z.email('Enter a valid email address.'),
  ]),
  playStoreUrl: url,
  social: z.object({
    twitter: url.optional(),
    instagram: url.optional(),
    linkedin: url.optional(),
    youtube: url.optional(),
    facebook: url.optional(),
  }),
  headCode: z.string().max(50_000),
  bodyStartCode: z.string().max(50_000),
  bodyEndCode: z.string().max(50_000),
});

const same = (a: SiteSettings, b: SiteSettings) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Blank social links are left out, as the API stores them. */
function normalise(s: SiteSettings): SiteSettings {
  const social = Object.fromEntries(
    Object.entries(s.social).filter(
      ([, v]) => typeof v === 'string' && v.trim(),
    ),
  ) as SiteSettings['social'];
  return { ...s, social };
}

export function SettingsView({ embedded = false }: { embedded?: boolean }) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const query = useSiteSettings();
  const [form, setForm] = useState<SiteSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const canEdit = can(me, 'settings.update');
  const canCode = can(me, 'settings.code_injection');

  useEffect(() => {
    if (query.data && !form) setForm(query.data.settings);
  }, [query.data, form]);

  const dirty = useMemo(
    () =>
      !!form &&
      !!query.data &&
      !same(normalise(form), normalise(query.data.settings)),
    [form, query.data],
  );

  if (query.error) {
    return (
      <>
        {!embedded && <PageHeader title="Site settings" />}
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (!form || !query.data) {
    return (
      <>
        {!embedded && <PageHeader title="Site settings" />}
        <RowsSkeleton rows={6} />
      </>
    );
  }

  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  const setSocial = (key: string, value: string) =>
    setForm((f) => (f ? { ...f, social: { ...f.social, [key]: value } } : f));

  async function save() {
    if (!form) return;
    const trimmed: SiteSettings = {
      ...form,
      siteTitle: form.siteTitle.trim(),
      siteDescription: form.siteDescription.trim(),
      contactEmail: form.contactEmail.trim(),
      playStoreUrl: form.playStoreUrl.trim(),
      social: Object.fromEntries(
        Object.entries(form.social).map(([k, v]) => [k, (v ?? '').trim()]),
      ),
    };
    const parsed = schema.safeParse(trimmed);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      );
      toast.error('Fix the highlighted fields first.');
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api<SiteSettingsView & { changed: string[] }>(
        'staff/site/settings',
        {
          method: 'PUT',
          body: normalise(trimmed),
        },
      );
      qc.setQueryData(qk.site, {
        settings: res.settings,
        updatedAt: res.updatedAt,
      });
      setForm(res.settings);
      void qc.invalidateQueries({ queryKey: ['audit'] });
      toast.success(
        res.changed.length
          ? 'Saved. The public website now uses these settings.'
          : 'Nothing changed.',
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (name: string) =>
    errors[name] ? (
      <p className="text-xs text-destructive" role="alert">
        {errors[name]}
      </p>
    ) : null;

  return (
    <div className="pb-24">
      {embedded ? (
        <p className="mb-6 text-sm text-muted-foreground">
          What stockvirtue.com shows in search results, its footer and contact
          details, plus code it loads on every page.
          {query.data.updatedAt && (
            <span title={formatDateTime(query.data.updatedAt)}>
              {' '}
              Last saved {timeAgo(query.data.updatedAt)}.
            </span>
          )}
        </p>
      ) : (
        <PageHeader
          title="Site settings"
          description={
            <>
              What stockvirtue.com shows in search results, its footer and
              contact details, plus code it loads on every page.
              {query.data.updatedAt && (
                <span title={formatDateTime(query.data.updatedAt)}>
                  {' '}
                  Last saved {timeAgo(query.data.updatedAt)}.
                </span>
              )}
            </>
          }
        />
      )}

      {!canEdit && (
        <Alert className="mb-6">
          <Lock />
          <AlertDescription>
            You can view these settings. Changing them needs the settings.update
            permission.
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={!canEdit || busy} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Site details</CardTitle>
            <CardDescription>
              Used for the page title, search snippets and social previews.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="siteTitle">Site title</Label>
              <Input
                id="siteTitle"
                value={form.siteTitle}
                onChange={(e) => set('siteTitle', e.target.value)}
                placeholder="StockVirtue"
                maxLength={200}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="siteDescription">Description</Label>
              <Textarea
                id="siteDescription"
                value={form.siteDescription}
                onChange={(e) => set('siteDescription', e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {form.siteDescription.length}/500 · search engines show about
                155 characters.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
                aria-invalid={!!errors.contactEmail}
              />
              {field('contactEmail')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="playStoreUrl">Google Play link</Label>
              <Input
                id="playStoreUrl"
                value={form.playStoreUrl}
                onChange={(e) => set('playStoreUrl', e.target.value)}
                placeholder="https://play.google.com/store/apps/details?id=…"
                aria-invalid={!!errors.playStoreUrl}
              />
              {field('playStoreUrl')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Social profiles</CardTitle>
            <CardDescription>
              Shown in the website footer. Leave blank to hide one.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-2">
            {SOCIAL.map((s) => (
              <div key={s.key} className="space-y-2">
                <Label htmlFor={`social-${s.key}`}>{s.label}</Label>
                <Input
                  id={`social-${s.key}`}
                  value={form.social[s.key] ?? ''}
                  onChange={(e) => setSocial(s.key, e.target.value)}
                  placeholder="https://"
                  aria-invalid={!!errors[`social.${s.key}`]}
                />
                {field(`social.${s.key}`)}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Code injection
              {!canCode && (
                <Lock className="size-4 text-muted-foreground" aria-hidden />
              )}
            </CardTitle>
            <CardDescription>
              Raw HTML added to every public page (not this portal). Changes are
              recorded in the audit log, including the old and new code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Alert className="border-warning/40 bg-warning/5">
              <AlertTriangle className="text-warning" />
              <AlertTitle>Only paste code from providers you trust</AlertTitle>
              <AlertDescription>
                Scripts here run for every visitor. A broken snippet can break
                the public site, but never this portal.
              </AlertDescription>
            </Alert>
            {!canCode && (
              <p className="text-sm text-muted-foreground">
                Changing injected code needs the{' '}
                <code className="font-mono text-xs">
                  settings.code_injection
                </code>{' '}
                permission (Super Admin by default).
              </p>
            )}
            <fieldset disabled={!canCode} className="space-y-5">
              {CODE.map((c) => (
                <div key={c.key} className="space-y-2">
                  <Label htmlFor={c.key}>{c.label}</Label>
                  <Textarea
                    id={c.key}
                    value={form[c.key]}
                    onChange={(e) => set(c.key, e.target.value)}
                    rows={5}
                    spellCheck={false}
                    className={cn(
                      'font-mono text-xs [font-variant-ligatures:none]',
                      !canCode && 'opacity-70',
                    )}
                    placeholder="<!-- paste snippet here -->"
                  />
                  <p className="text-xs text-muted-foreground">{c.hint}</p>
                </div>
              ))}
            </fieldset>
          </CardContent>
        </Card>
      </fieldset>

      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur animate-in fade-in slide-in-from-bottom-4 lg:left-64">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm text-muted-foreground">
              You have unsaved changes.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setForm(query.data!.settings);
                  setErrors({});
                }}
                disabled={busy}
              >
                Discard
              </Button>
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

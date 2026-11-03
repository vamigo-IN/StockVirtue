'use client';

import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import type { SiteConfigView } from '@/portal/types';
import { SaveRow, SwitchRow, useGroupForm, ViewLink } from './config-form';

/** The ads.txt the website will serve for these settings. */
function preview(client: string, extra: string): string {
  const lines: string[] = [];
  if (/^ca-pub-\d{10,20}$/.test(client)) {
    lines.push(
      `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0`,
    );
  }
  for (const l of extra.split(/\r?\n/)) if (l.trim()) lines.push(l.trim());
  return lines.join('\n');
}

export function AdsTab({
  view,
  canEdit,
}: {
  view: SiteConfigView;
  canEdit: boolean;
}) {
  const g = useGroupForm(view, 'ads');
  const off = !canEdit || g.busy;
  const adsTxt = preview(g.form.adsenseClient, g.form.adsTxt);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Google AdSense</CardTitle>
          <CardDescription>
            Ads on the public website (never in this portal or the app).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-2">
            <Label htmlFor="adsenseClient">Publisher ID</Label>
            <Input
              id="adsenseClient"
              value={g.form.adsenseClient}
              onChange={(e) => g.set('adsenseClient', e.target.value.trim())}
              placeholder="ca-pub-1234567890123456"
              spellCheck={false}
              disabled={off}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              AdSense → Account → Settings → Account information. Saving it adds
              the site-ownership tag and the ads.txt line AdSense asks for.
            </p>
          </div>
          <SwitchRow
            id="autoAds"
            label="Show ads (Auto ads)"
            hint="Loads AdSense on every public page and lets it place ads where it fits. Turn on after AdSense approves the site; choose ad formats in your AdSense account."
            checked={g.form.autoAds}
            onChange={(v) => g.set('autoAds', v)}
            disabled={off}
          />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Visitors who haven&apos;t allowed advertising cookies
            </legend>
            <p className="text-xs text-muted-foreground">
              Every visitor is asked first (the cookie banner). Personalised ads
              only ever show to those who say yes.
            </p>
            {(
              [
                [
                  'non_personalised',
                  'See non-personalised ads',
                  'Ads chosen from the page, not from their interests or browsing.',
                ],
                [
                  'off',
                  'See no ads',
                  'Nothing from AdSense loads until they allow advertising cookies.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 text-sm"
              >
                <input
                  type="radio"
                  name="withoutConsent"
                  className="mt-1"
                  checked={g.form.withoutConsent === value}
                  onChange={() => g.set('withoutConsent', value)}
                  disabled={off}
                />
                <span>
                  {label}
                  <span className="block text-xs text-muted-foreground">
                    {hint}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Alert>
            <Info />
            <AlertDescription>
              AdSense approves sites with original content. Stories copied word
              for word from other sites can get an application or an account
              refused.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ads.txt</CardTitle>
          <CardDescription>
            Lists who may sell ad space on the site.{' '}
            <ViewLink href="/ads.txt">View ads.txt</ViewLink>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adsTxt">Lines for other ad networks</Label>
            <Textarea
              id="adsTxt"
              value={g.form.adsTxt}
              onChange={(e) => g.set('adsTxt', e.target.value)}
              rows={4}
              maxLength={10_000}
              spellCheck={false}
              disabled={off}
              placeholder="example-network.com, 12345, DIRECT"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              One record per line: domain, account ID, DIRECT or RESELLER, and
              optionally the certification ID. The AdSense line is added for
              you.
            </p>
          </div>
          <div className="space-y-2">
            <Label>The website will serve</Label>
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs">
              {adsTxt || '(nothing yet: /ads.txt answers 404)'}
            </pre>
          </div>
        </CardContent>
      </Card>

      <SaveRow
        canEdit={canEdit}
        permission="ads.manage"
        dirty={g.dirty}
        busy={g.busy}
        onSave={() =>
          void g.save('Saved. The website uses these ad settings now.')
        }
        onDiscard={g.reset}
      />
    </div>
  );
}

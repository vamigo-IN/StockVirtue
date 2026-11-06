'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SiteConfigView } from '@/portal/types';
import { SaveRow, useGroupForm } from './config-form';

const FIELDS = [
  {
    key: 'ga4Id',
    label: 'Google Analytics 4',
    placeholder: 'G-XXXXXXXXXX',
    hint: 'Measurement ID: Admin → Data streams → your web stream.',
  },
  {
    key: 'gtmId',
    label: 'Google Tag Manager',
    placeholder: 'GTM-XXXXXXX',
    hint: 'Container ID. Use it instead of the fields here if your tags live in Tag Manager.',
  },
  {
    key: 'metaPixelId',
    label: 'Meta (Facebook) Pixel',
    placeholder: '123456789012345',
    hint: 'Pixel ID from Meta Events Manager.',
  },
  {
    key: 'clarityId',
    label: 'Microsoft Clarity',
    placeholder: 'abcd1234ef',
    hint: 'Project ID from Clarity → Settings → Overview.',
  },
] as const;

export function AnalyticsTab({
  view,
  canEdit,
}: {
  view: SiteConfigView;
  canEdit: boolean;
}) {
  const g = useGroupForm(view, 'analytics');
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tracking</CardTitle>
          <CardDescription>
            Visitor statistics for stockvirtue.com and its news pages. Enter
            only the ID; the website adds the right tag on its public pages
            (never in this portal). Leave a field blank to switch it off.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                value={g.form[field.key]}
                onChange={(e) => g.set(field.key, e.target.value.trim())}
                placeholder={field.placeholder}
                spellCheck={false}
                disabled={!canEdit || g.busy}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{field.hint}</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground md:col-span-2">Switching a service on, including one that was on before, makes every website visitor choose their cookies again.</p>
        </CardContent>
      </Card>
      <SaveRow
        canEdit={canEdit}
        permission="settings.update"
        dirty={g.dirty}
        busy={g.busy}
        onSave={() =>
          void g.save('Saved. Tracking updates on the next page view.')
        }
        onDiscard={g.reset}
      />
    </div>
  );
}

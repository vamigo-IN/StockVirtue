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
import { SaveRow, useGroupForm } from './config-form';

/**
 * Who answers for personal data (DPDP Act 2023 s.8(9); DPDP Rules 2025,
 * rule 9): shown in the privacy notice, the app, and every answer to a
 * privacy request, with the promised response time (at most 90 days).
 */
export function PrivacyTab({
  view,
  canEdit,
}: {
  view: SiteConfigView;
  canEdit: boolean;
}) {
  const g = useGroupForm(view, 'privacy');
  const off = !canEdit || g.busy;
  const missing = !g.form.officerName || !g.form.officerEmail;
  return (
    <div className="space-y-6">
      {missing && (
        <Alert>
          <Info />
          <AlertDescription>
            Name a grievance officer. The law asks you to publish who answers
            questions about personal data; until you do, the privacy notice
            sends people to the site&apos;s contact address.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Grievance officer</CardTitle>
          <CardDescription>
            The person who answers privacy questions, requests and complaints.
            Shown on the privacy notice and in the app, and named in every
            answer to a privacy request.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="officerName">Name</Label>
            <Input
              id="officerName"
              value={g.form.officerName}
              onChange={(e) => g.set('officerName', e.target.value)}
              placeholder="e.g. Ravi Menon"
              maxLength={120}
              disabled={off}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="officerEmail">Email</Label>
            <Input
              id="officerEmail"
              type="email"
              value={g.form.officerEmail}
              onChange={(e) => g.set('officerEmail', e.target.value.trim())}
              placeholder="grievance@stockvirtue.com"
              maxLength={160}
              disabled={off}
            />
            <p className="text-xs text-muted-foreground">
              New privacy requests are also emailed here.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="officerPhone">Phone (optional)</Label>
            <Input
              id="officerPhone"
              value={g.form.officerPhone}
              onChange={(e) => g.set('officerPhone', e.target.value)}
              placeholder="+91 98765 43210"
              maxLength={20}
              disabled={off}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="responseDays">Answer within (days)</Label>
            <Input
              id="responseDays"
              type="number"
              min={1}
              max={90}
              value={g.form.responseDays}
              onChange={(e) =>
                g.set(
                  'responseDays',
                  Math.min(90, Math.max(1, Number(e.target.value) || 1)),
                )
              }
              disabled={off}
              className="w-28"
            />
            <p className="text-xs text-muted-foreground">
              Requests and grievances get this due date. The law allows at most
              90 days.
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>The company</CardTitle>
          <CardDescription>
            Who decides how personal data is used (the Data Fiduciary).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="legalName">Legal name</Label>
            <Input
              id="legalName"
              value={g.form.legalName}
              onChange={(e) => g.set('legalName', e.target.value)}
              maxLength={160}
              disabled={off}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalAddress">Postal address</Label>
            <Textarea
              id="postalAddress"
              value={g.form.postalAddress}
              onChange={(e) => g.set('postalAddress', e.target.value)}
              rows={3}
              maxLength={500}
              disabled={off}
            />
          </div>
        </CardContent>
      </Card>
      <SaveRow
        canEdit={canEdit}
        permission="privacy.manage"
        dirty={g.dirty}
        busy={g.busy}
        onSave={() =>
          void g.save('Saved. The privacy notice and the app show it now.')
        }
        onDiscard={g.reset}
      />
    </div>
  );
}

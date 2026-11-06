'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QueryError } from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { can } from '@/portal/access';
import { qk, useNoticeGate } from '@/portal/queries';
import {
  canPublishMaterial,
  friendly,
  isMissingEndpoint,
  personName,
  setNoticeGate,
  shortDate,
} from '@/portal/site-content';
import type { NoticeGateView } from '@/portal/types';
import { SiteConfirm } from './SiteConfirm';

const n = (x: number) => x.toLocaleString('en-IN');
const accounts = (x: number) => `${n(x)} active account${x === 1 ? '' : 's'}`;

/**
 * Settings → Privacy, "App notice gate" (W7 decision 2; addendum §5.11.6,
 * §8.11). It ships switched off. While it is on, an app account that hasn't
 * accepted the current privacy notice can use the app only to read and
 * accept it, sign out, delete the account or use its privacy rights. A Super
 * Admin switches it on once the app update is live on Google Play, after
 * seeing how many accounts it would block; off applies to the next request.
 * Its own route and save, so a Privacy-tab save can never flip it.
 */
export function NoticeGateCard() {
  const me = usePortalMe();
  // Everyone who sees the Privacy tab (settings.read or privacy.manage), plus
  // legal.manage; only legal.material may switch it (§5.11.6, W7A-09).
  const visible = can(me, 'settings.read') || can(me, 'privacy.manage') || can(me, 'legal.manage');
  const gate = useNoticeGate(visible);
  if (!visible) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          App notice gate
          {gate.data && <GateBadge gate={gate.data} />}
        </CardTitle>
        <CardDescription>
          Whether people who haven’t accepted the current privacy notice can keep using the app. Reading and accepting
          the notice, signing out, deleting the account and their privacy rights always stay open.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {gate.error ? (
          isMissingEndpoint(gate.error) ? (
            <p className="text-sm text-muted-foreground">
              The app notice gate arrives with the next API update. Until then it is off: everyone can use the app.
            </p>
          ) : (
            <QueryError error={friendly(gate.error)} onRetry={() => void gate.refetch()} />
          )
        ) : !gate.data ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : (
          <GateBody gate={gate.data} canSwitch={canPublishMaterial(me)} />
        )}
      </CardContent>
    </Card>
  );
}

function GateBadge({ gate }: { gate: NoticeGateView }) {
  if (gate.forcedOff) return <Badge variant="outline">Forced off</Badge>;
  return gate.enabled ? (
    <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
      On
    </Badge>
  ) : (
    <Badge variant="outline">Off</Badge>
  );
}

function GateBody({ gate, canSwitch }: { gate: NoticeGateView; canSwitch: boolean }) {
  const qc = useQueryClient();
  const [played, setPlayed] = useState(false);
  const [confirm, setConfirm] = useState<'on' | 'off' | null>(null);
  const block = gate.wouldBlock;

  async function flip(enabled: boolean) {
    try {
      const res = await setNoticeGate(enabled, enabled ? played : undefined);
      qc.setQueryData(qk.noticeGate, res.gate);
      void qc.invalidateQueries({ queryKey: qk.noticeGate });
      void qc.invalidateQueries({ queryKey: qk.privacyNotice });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      setPlayed(false);
      toast.success(
        enabled
          ? 'The app notice gate is on. It applies to the next app request.'
          : 'The app notice gate is off. Everyone can use the app again.',
      );
    } catch (err) {
      throw friendly(err);
    }
  }

  if (gate.forcedOff) {
    return (
      <>
        <p className="flex items-start gap-2 text-sm">
          <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            Switched off by the server configuration (<code className="font-mono text-xs">PRIVACY_NOTICE_GATE_DISABLED</code>).
            Everyone can use the app. Engineering can turn the setting off and restart the API to give the switch back.
          </span>
        </p>
        <Button disabled>Switch on…</Button>
      </>
    );
  }

  const readOnly = !canSwitch && (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Lock className="size-4" aria-hidden /> Only a Super Admin can switch this.
    </p>
  );

  if (gate.enabled) {
    const by = personName(gate.changedBy);
    return (
      <>
        <p className="flex items-start gap-2 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            On{gate.changedAt ? ` since ${shortDate(gate.changedAt)}` : ''}
            {by ? `, by ${by}` : ''}. Accounts that haven’t accepted notice {gate.version} can use the app only to read
            and accept it, sign out, delete the account or use their privacy rights.
          </span>
        </p>
        {block && (
          <p className="text-sm text-muted-foreground">
            {block.active === 0
              ? `No account is blocked now: every active account has accepted notice ${gate.version}.`
              : `${accounts(block.active)} ${block.active === 1 ? 'is' : 'are'} blocked now (${n(block.recent)} of them used the app in the last 30 days).`}
          </p>
        )}
        {canSwitch ? (
          <Button variant="outline" onClick={() => setConfirm('off')}>
            Switch off
          </Button>
        ) : (
          readOnly
        )}
        <SiteConfirm
          open={confirm === 'off'}
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Switch off the app notice gate?"
          description="Everyone can use the app again at once."
          confirmLabel="Switch off"
          onConfirm={() => flip(false)}
        />
      </>
    );
  }

  return (
    <>
      <p className="flex items-start gap-2 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <span>
          Off. Everyone can use the app while the notice is pending; people on apps older than 1.4.0 are never asked.
        </span>
      </p>
      {block && (
        <p className="text-sm text-muted-foreground">
          {block.active === 0
            ? `Switching on now blocks no account: every active account has accepted notice ${gate.version}.`
            : `Switching on now blocks ${accounts(block.active)} until they accept notice ${gate.version} (${n(block.recent)} of them used the app in the last 30 days). People on app 1.4.0 or later see the notice and can accept it straight away. People on older apps are told to update.`}
        </p>
      )}
      {canSwitch ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox id="gate-play" checked={played} onCheckedChange={(v) => setPlayed(v === true)} className="mt-0.5" />
            <Label htmlFor="gate-play" className="font-normal leading-snug">
              App 1.4.0 or later is on Google Play’s production track at 100% (not a staged rollout or a testing
              track), and has been for at least 2 days.
            </Label>
          </div>
          <Button onClick={() => setConfirm('on')} disabled={!played}>
            Switch on…
          </Button>
        </div>
      ) : (
        readOnly
      )}
      <SiteConfirm
        open={confirm === 'on'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Switch on the app notice gate?"
        description={
          block
            ? `${n(block.active)} account${block.active === 1 ? '' : 's'} will be able to use the app only to read and accept the notice.`
            : 'Accounts that haven’t accepted the current notice will be able to use the app only to read and accept it.'
        }
        confirmLabel="Switch on"
        destructive
        onConfirm={() => flip(true)}
      />
    </>
  );
}

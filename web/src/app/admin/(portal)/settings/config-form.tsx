'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/portal/api';
import { qk } from '@/portal/queries';
import type { SiteConfigData, SiteConfigView } from '@/portal/types';

/**
 * One group of the site config as a form: its own state, Save and Discard.
 * The API checks the group's permission and every value's format again.
 */
export function useGroupForm<G extends keyof SiteConfigData>(
  view: SiteConfigView,
  group: G,
) {
  const qc = useQueryClient();
  const saved = view.config[group];
  const [form, setForm] = useState<SiteConfigData[G]>(saved);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  function set<K extends keyof SiteConfigData[G]>(
    key: K,
    value: SiteConfigData[G][K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(done: string) {
    setBusy(true);
    try {
      const res = await api<SiteConfigView>(`staff/site/config/${group}`, {
        method: 'PUT',
        body: form,
      });
      qc.setQueryData(qk.siteConfig, res);
      setForm(res.config[group]);
      void qc.invalidateQueries({ queryKey: ['audit'] });
      toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return {
    form,
    set,
    dirty,
    busy,
    save,
    reset: () => setForm(saved),
  };
}

export function SaveRow({
  canEdit,
  dirty,
  busy,
  onSave,
  onDiscard,
  permission,
}: {
  canEdit: boolean;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onDiscard: () => void;
  permission: string;
}) {
  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        You can view these settings. Changing them needs the{' '}
        <code className="font-mono text-xs">{permission}</code> permission.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {dirty && (
        <span className="mr-auto text-sm text-muted-foreground">
          Unsaved changes
        </span>
      )}
      <Button variant="outline" onClick={onDiscard} disabled={busy || !dirty}>
        Discard
      </Button>
      <Button onClick={onSave} disabled={busy || !dirty}>
        {busy && <Loader2 className="animate-spin" />}
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

/** A labelled switch with its explanation underneath. */
export function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-4">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

/** Opens a file the website serves, e.g. /robots.txt, in a new tab. */
export function ViewLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-primary underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

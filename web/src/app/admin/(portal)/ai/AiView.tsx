'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CheckCircle2,
  FlaskConical,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/editor/widget-form/pickers';
import { AiHistory } from '@/components/newswire/AiHistory';
import { formatUsd, PROVIDER_KINDS } from '@/components/newswire/labels';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
  StatCard,
} from '@/components/portal/common';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api, ApiError, errorMessage } from '@/portal/api';
import { formatDate, timeAgo } from '@/portal/format';
import { qk, useAiSettings, useAiUsage } from '@/portal/queries';
import type { AiProviderView, AiSettingsView, AiTask } from '@/portal/types';
import { ProviderDialog } from './ProviderDialog';

interface TestResult {
  ok: boolean;
  model?: string;
  message?: string;
  ms: number;
}

/**
 * The AI assistant's set-up (spec §9, ai.configure): provider-independent,
 * off until switched on here. Whatever is chosen, the AI only ever returns
 * drafts and suggestions to a person.
 */
export function AiView() {
  const qc = useQueryClient();
  const settings = useAiSettings();
  const usage = useAiUsage();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AiProviderView | null>(null);
  const [removing, setRemoving] = useState<AiProviderView | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult | 'running'>>(
    {},
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['ai'] });
  };

  async function test(p: AiProviderView) {
    setTests((t) => ({ ...t, [p.id]: 'running' }));
    try {
      const r = await api<TestResult>(`staff/ai/providers/${p.id}/test`, {
        method: 'POST',
      });
      setTests((t) => ({ ...t, [p.id]: r }));
    } catch (err) {
      setTests((t) => ({
        ...t,
        [p.id]: { ok: false, message: errorMessage(err), ms: 0 },
      }));
    }
  }

  if (settings.error)
    return (
      <QueryError
        error={settings.error}
        onRetry={() => void settings.refetch()}
      />
    );
  const s = settings.data;
  if (!s) return <RowsSkeleton rows={6} />;
  const active = s.providers.find((p) => p.id === s.providerId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI assistant"
        description="Drafts and suggestions for the newsroom, from the AI provider you choose. The AI never publishes: everything it writes goes to a person, figures not in the source are removed automatically, and stories still need an editor’s approval."
        actions={
          <Badge
            variant={s.enabled ? 'default' : 'secondary'}
            className="text-sm"
          >
            {s.enabled ? `On · ${active?.name ?? 'no provider'}` : 'Off'}
          </Badge>
        }
      />

      <SettingsCard settings={s} onSaved={refresh} />

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>
            Keys are encrypted before they are stored and are never shown again.
            Add a provider, test it, then choose it above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {s.providers.length === 0 ? (
            <EmptyState icon={Bot} title="No providers yet">
              Add Anthropic (Claude), OpenAI, an OpenAI-compatible server or a
              self-hosted Ollama server.
            </EmptyState>
          ) : (
            s.providers.map((p) => {
              const t = tests[p.id];
              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {p.name}
                      {p.id === s.providerId && (
                        <Badge variant="secondary" className="ml-2">
                          In use
                        </Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {PROVIDER_KINDS[p.kind].label} · {p.model}
                      {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="size-3" />
                        {!p.hasKey ? (
                          'No key'
                        ) : p.keyReadable ? (
                          'Key saved'
                        ) : (
                          <span className="text-destructive">
                            Key can’t be read — enter it again
                          </span>
                        )}
                      </span>
                      <span>
                        {p.inputCostPerMTok != null ||
                        p.outputCostPerMTok != null
                          ? `US$${p.inputCostPerMTok ?? 0} in / US$${p.outputCostPerMTok ?? 0} out per 1M tokens`
                          : 'No prices: costs won’t be estimated'}
                      </span>
                      <span>Updated {formatDate(p.updatedAt)}</span>
                    </p>
                    {t && t !== 'running' && (
                      <p
                        className={`mt-1 flex items-center gap-1 text-sm ${t.ok ? 'text-success' : 'text-destructive'}`}
                      >
                        {t.ok ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          <XCircle className="size-4" />
                        )}
                        {t.ok
                          ? `It works: ${t.model} answered in ${(t.ms / 1000).toFixed(1)} s.`
                          : t.message}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void test(p)}
                      disabled={t === 'running'}
                    >
                      <FlaskConical /> {t === 'running' ? 'Testing…' : 'Test'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(p)}
                    >
                      <Pencil /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemoving(p)}
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add provider
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This month</CardTitle>
          <CardDescription>
            Estimated from each provider’s prices, as set above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!usage.data ? (
            <RowsSkeleton rows={2} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                <StatCard
                  label="Spent"
                  value={formatUsd(usage.data.spendUsd)}
                  hint={
                    s.monthlyBudgetUsd != null
                      ? `of ${formatUsd(s.monthlyBudgetUsd)} budget`
                      : 'No budget set'
                  }
                  tone={
                    s.monthlyBudgetUsd != null &&
                    usage.data.spendUsd >= s.monthlyBudgetUsd
                      ? 'danger'
                      : 'default'
                  }
                />
                <StatCard label="Requests" value={usage.data.jobs} />
                <StatCard
                  label="Failed"
                  value={usage.data.failed}
                  tone={usage.data.failed ? 'warning' : 'default'}
                />
              </div>
              {usage.data.byTask.length > 0 && (
                <ul className="divide-y rounded-lg border text-sm">
                  {usage.data.byTask.map((t) => (
                    <li
                      key={t.task}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <span>{t.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {t.jobs} {t.jobs === 1 ? 'request' : 'requests'} ·{' '}
                        {formatUsd(t.costUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Every AI request, with what was sent, what came back and the
            automatic checks. Story text sent to the provider is cleared after
            90 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiHistory filters={{ scope: 'all' }} />
        </CardContent>
      </Card>

      <ProviderDialog
        open={adding}
        onOpenChange={setAdding}
        models={s.models}
        onSaved={refresh}
      />
      <ProviderDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        provider={editing}
        models={s.models}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete ${removing?.name ?? 'this provider'}?`}
        description="Its key is deleted. The history keeps which provider and model ran each request."
        confirmLabel="Delete provider"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await api(`staff/ai/providers/${removing.id}`, { method: 'DELETE' });
          toast.success(`Deleted ${removing.name}.`);
          refresh();
        }}
      />
    </div>
  );
}

function SettingsCard({
  settings,
  onSaved,
}: {
  settings: AiSettingsView;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [providerId, setProviderId] = useState(settings.providerId ?? 'none');
  const [autoDraft, setAutoDraft] = useState(settings.autoDraft);
  const [budget, setBudget] = useState(
    settings.monthlyBudgetUsd != null ? String(settings.monthlyBudgetUsd) : '',
  );
  const [daily, setDaily] = useState(String(settings.dailyJobsPerUser));
  const [disabled, setDisabled] = useState<AiTask[]>(settings.disabledTasks);
  const [saving, setSaving] = useState(false);

  // Fresh values after a save or a reload.
  useEffect(() => {
    setEnabled(settings.enabled);
    setProviderId(settings.providerId ?? 'none');
    setAutoDraft(settings.autoDraft);
    setBudget(
      settings.monthlyBudgetUsd != null
        ? String(settings.monthlyBudgetUsd)
        : '',
    );
    setDaily(String(settings.dailyJobsPerUser));
    setDisabled(settings.disabledTasks);
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      await api('staff/ai/settings', {
        method: 'PUT',
        body: {
          version: settings.version,
          enabled,
          providerId: providerId === 'none' ? null : providerId,
          autoDraft,
          monthlyBudgetUsd: budget.trim() === '' ? null : Number(budget),
          dailyJobsPerUser: Number(daily) || 60,
          disabledTasks: disabled,
        },
      });
      toast.success(
        enabled
          ? 'Saved. The assistant is on.'
          : 'Saved. The assistant is off.',
      );
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
      if (err instanceof ApiError && err.status === 409) onSaved();
    } finally {
      setSaving(false);
    }
  }

  const noProvider = providerId === 'none';
  return (
    <Card>
      <CardHeader>
        <CardTitle>The assistant</CardTitle>
        <CardDescription>
          {settings.updatedBy
            ? `Last changed by ${settings.updatedBy} ${timeAgo(settings.updatedAt)}.`
            : 'Not set up yet.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="ai-enabled">Assistant on</Label>
            <p className="text-xs text-muted-foreground">
              When off, no story or source text is sent to any provider.
            </p>
          </div>
          <Switch
            id="ai-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={noProvider && !enabled}
          />
        </div>
        {noProvider && (
          <Alert>
            <ShieldCheck />
            <AlertDescription>
              Add a provider below and choose it here before switching the
              assistant on.
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <ChoiceSelect
            id="ai-provider"
            label="Provider"
            value={providerId}
            onChange={(v) => {
              setProviderId(v);
              if (v === 'none') setEnabled(false);
            }}
            choices={[
              { value: 'none', label: 'None' },
              ...settings.providers.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.model})`,
              })),
            ]}
          />
          <div className="space-y-1.5">
            <Label htmlFor="ai-budget">Monthly budget (US$)</Label>
            <Input
              id="ai-budget"
              type="number"
              min="0"
              step="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="No limit"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-daily">Requests per person per day</Label>
            <Input
              id="ai-daily"
              type="number"
              min="1"
              max="1000"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="ai-auto">
              Draft automatically from news sources
            </Label>
            <p className="text-xs text-muted-foreground">
              New items from sources whose terms allow AI drafts get a draft
              waiting in Incoming news (up to five per fetch). A person still
              decides whether to use it.
            </p>
          </div>
          <Switch
            id="ai-auto"
            checked={autoDraft}
            onCheckedChange={setAutoDraft}
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Tools staff can use</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {settings.tasks.map((t) => {
              const on = !disabled.includes(t.task);
              return (
                <label key={t.task} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={on}
                    onCheckedChange={(c) =>
                      setDisabled((d) =>
                        c ? d.filter((x) => x !== t.task) : [...d, t.task],
                      )
                    }
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}

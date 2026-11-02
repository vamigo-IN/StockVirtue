'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/editor/widget-form/pickers';
import { PROVIDER_KINDS } from '@/components/newswire/labels';
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
import { api, errorMessage } from '@/portal/api';
import type {
  AiProviderKind,
  AiProviderView,
  AiSettingsView,
} from '@/portal/types';

const OTHER = '__other__';

const ADDRESS: Record<
  AiProviderKind,
  { required: boolean; placeholder: string; hint: string }
> = {
  ANTHROPIC: {
    required: false,
    placeholder: 'Blank = Anthropic’s API',
    hint: 'Only for a proxy or gateway in front of Anthropic.',
  },
  OPENAI: {
    required: false,
    placeholder: 'Blank = OpenAI’s API',
    hint: 'Only for a proxy or gateway in front of OpenAI.',
  },
  OPENAI_COMPATIBLE: {
    required: true,
    placeholder: 'https://openrouter.ai/api/v1',
    hint: 'The server’s base address; “/chat/completions” is added.',
  },
  OLLAMA: {
    required: true,
    placeholder: 'http://localhost:11434',
    hint: 'Where your Ollama server listens, as seen from the newsroom server.',
  },
};

/** Add or edit an AI provider. The key is write-only: it is never shown again. */
export function ProviderDialog({
  open,
  onOpenChange,
  provider,
  models,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: AiProviderView | null;
  models: AiSettingsView['models'];
  onSaved: (p: AiProviderView) => void;
}) {
  const editing = !!provider;
  const claude = models.ANTHROPIC;
  const [kind, setKind] = useState<AiProviderKind>('ANTHROPIC');
  const [name, setName] = useState('');
  const [modelChoice, setModelChoice] = useState(claude[0]?.id ?? OTHER);
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [inRate, setInRate] = useState('');
  const [outRate, setOutRate] = useState('');
  const [timeout, setTimeoutS] = useState('120');
  const [saving, setSaving] = useState(false);
  const ref = useRef(provider);
  ref.current = provider;

  useEffect(() => {
    if (!open) return;
    const p = ref.current;
    const k = p?.kind ?? 'ANTHROPIC';
    setKind(k);
    setName(p?.name ?? '');
    const known = claude.find((m) => m.id === p?.model);
    setModelChoice(
      k === 'ANTHROPIC'
        ? p
          ? known
            ? known.id
            : OTHER
          : (claude[0]?.id ?? OTHER)
        : OTHER,
    );
    setModel(p?.model ?? '');
    setBaseUrl(p?.baseUrl ?? '');
    setApiKey('');
    setRemoveKey(false);
    const def = p ? null : claude[0];
    setInRate(
      p?.inputCostPerMTok != null
        ? String(p.inputCostPerMTok)
        : def
          ? String(def.input)
          : '',
    );
    setOutRate(
      p?.outputCostPerMTok != null
        ? String(p.outputCostPerMTok)
        : def
          ? String(def.output)
          : '',
    );
    setTimeoutS(String(p?.timeoutSeconds ?? 120));
  }, [open, claude]);

  const effectiveModel =
    kind === 'ANTHROPIC' && modelChoice !== OTHER ? modelChoice : model.trim();

  function pickClaude(id: string) {
    setModelChoice(id);
    const m = claude.find((x) => x.id === id);
    if (m) {
      setInRate(String(m.input));
      setOutRate(String(m.output));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const rate = (v: string) => (v.trim() === '' ? null : Number(v));
    try {
      const body = {
        kind,
        name: name.trim() || effectiveModel,
        model: effectiveModel,
        baseUrl: baseUrl.trim(),
        ...(removeKey
          ? { apiKey: '' }
          : apiKey.trim()
            ? { apiKey: apiKey.trim() }
            : {}),
        inputCostPerMTok: rate(inRate),
        outputCostPerMTok: rate(outRate),
        timeoutSeconds: Number(timeout) || 120,
      };
      const saved = provider
        ? await api<AiProviderView>(`staff/ai/providers/${provider.id}`, {
            method: 'PATCH',
            body,
          })
        : await api<AiProviderView>('staff/ai/providers', {
            method: 'POST',
            body,
          });
      toast.success(
        editing
          ? 'Provider saved.'
          : `Added ${saved.name}. Test it, then choose it for the assistant.`,
      );
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const address = ADDRESS[kind];
  const keyOptional = kind === 'OPENAI_COMPATIBLE' || kind === 'OLLAMA';
  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${provider.name}` : 'Add an AI provider'}
            </DialogTitle>
            <DialogDescription>{PROVIDER_KINDS[kind].hint}</DialogDescription>
          </DialogHeader>
          <ChoiceSelect
            id="prov-kind"
            label="Provider"
            value={kind}
            onChange={(k) => {
              setKind(k);
              if (k !== 'ANTHROPIC') setModelChoice(OTHER);
              else pickClaude(claude[0]?.id ?? OTHER);
            }}
            choices={(Object.keys(PROVIDER_KINDS) as AiProviderKind[]).map(
              (k) => ({
                value: k,
                label: PROVIDER_KINDS[k].label,
              }),
            )}
          />
          {kind === 'ANTHROPIC' && (
            <ChoiceSelect
              id="prov-claude"
              label="Model"
              value={modelChoice}
              onChange={pickClaude}
              choices={[
                ...claude.map((m) => ({ value: m.id, label: m.label })),
                { value: OTHER, label: 'Another model…' },
              ]}
            />
          )}
          {(kind !== 'ANTHROPIC' || modelChoice === OTHER) && (
            <div className="space-y-1.5">
              <Label htmlFor="prov-model">Model name</Label>
              <Input
                id="prov-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  kind === 'OLLAMA'
                    ? 'As shown by “ollama list”'
                    : 'The provider’s model id'
                }
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="prov-name">Name in the portal</Label>
            <Input
              id="prov-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={effectiveModel || 'e.g. Claude for drafts'}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prov-url">
              API address{address.required ? '' : ' (optional)'}
            </Label>
            <Input
              id="prov-url"
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={address.placeholder}
              required={address.required}
            />
            <p className="text-xs text-muted-foreground">{address.hint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prov-key">
              API key{keyOptional ? ' (optional)' : ''}
            </Label>
            <Input
              id="prov-key"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setRemoveKey(false);
              }}
              placeholder={
                provider?.hasKey && !removeKey
                  ? 'Saved — leave blank to keep'
                  : 'Paste the key'
              }
              required={!keyOptional && !provider?.hasKey}
            />
            {provider?.hasKey && !provider.keyReadable && (
              <p className="text-xs text-destructive">
                The saved key can’t be read any more (the secrets key changed).
                Enter it again.
              </p>
            )}
            {provider?.hasKey && keyOptional && !apiKey && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setRemoveKey(!removeKey)}
              >
                {removeKey ? 'Keep the saved key' : 'Remove the saved key'}
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              Encrypted before it is stored, and never shown again.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="prov-in">Input US$ / 1M tokens</Label>
              <Input
                id="prov-in"
                type="number"
                min="0"
                step="0.0001"
                value={inRate}
                onChange={(e) => setInRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-out">Output US$ / 1M tokens</Label>
              <Input
                id="prov-out"
                type="number"
                min="0"
                step="0.0001"
                value={outRate}
                onChange={(e) => setOutRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-timeout">Timeout (seconds)</Label>
              <Input
                id="prov-timeout"
                type="number"
                min="10"
                max="600"
                value={timeout}
                onChange={(e) => setTimeoutS(e.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Prices are only for the cost estimates and the monthly budget. Check
            them against the provider’s current price list.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !effectiveModel}>
              {saving ? 'Saving…' : editing ? 'Save provider' : 'Add provider'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

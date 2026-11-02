import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  AiProviderKind,
  ItemStatus,
  SourceHealth,
  SourceType,
  SourceUsage,
} from '@/portal/types';

/** Labels and badges shared by the news-source, incoming-news and AI pages. */

export const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'RSS', label: 'News feed (RSS or Atom)' },
  { value: 'LICENSED_API', label: 'Licensed news API' },
  { value: 'EXCHANGE', label: 'Exchange announcements' },
  { value: 'COMPANY_IR', label: 'Company investor relations' },
  { value: 'RBI', label: 'RBI' },
  { value: 'SEBI', label: 'SEBI' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'MANUAL', label: 'Manual submissions' },
];

export const sourceTypeLabel = (t: SourceType) =>
  SOURCE_TYPES.find((s) => s.value === t)?.label ?? t;

export const USAGE: Record<SourceUsage, { label: string; hint: string }> = {
  HEADLINE_ONLY: {
    label: 'Headline and link only',
    hint: 'Keep just the headline and a link to the original. The safe choice when the terms are unclear.',
  },
  SUMMARY: {
    label: 'Headline and summary',
    hint: 'Also keep the short summary the source publishes in its feed.',
  },
  FULL_TEXT: {
    label: 'Full text (licensed)',
    hint: 'Keep the whole article. Only with a licence that allows it.',
  },
};

export const POLL_CHOICES: { value: number; label: string }[] = [
  { value: 5, label: 'Every 5 minutes' },
  { value: 10, label: 'Every 10 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Once a day' },
];

export const pollLabel = (m: number) =>
  POLL_CHOICES.find((c) => c.value === m)?.label ?? `Every ${m} minutes`;

const HEALTH: Record<
  SourceHealth,
  { label: string; dot: string; text: string }
> = {
  healthy: { label: 'Healthy', dot: 'bg-success', text: 'text-success' },
  degraded: {
    label: 'Needs attention',
    dot: 'bg-warning',
    text: 'text-warning',
  },
  failing: {
    label: 'Failing',
    dot: 'bg-destructive',
    text: 'text-destructive',
  },
  paused: {
    label: 'Paused',
    dot: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
  },
  pending: {
    label: 'Not fetched yet',
    dot: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
  },
  manual: {
    label: 'Manual',
    dot: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
  },
};

export function HealthBadge({ health }: { health: SourceHealth }) {
  const h = HEALTH[health];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium',
        h.text,
      )}
    >
      <span className={cn('size-2 rounded-full', h.dot)} aria-hidden />
      {h.label}
    </span>
  );
}

export const TOPIC_LABELS: Record<string, string> = {
  ipo: 'IPO',
  results: 'Results',
  corporate_action: 'Corporate action',
  deals: 'Deals',
  policy: 'Policy',
  economy: 'Economy',
  commodities: 'Commodities',
  currency: 'Currency',
  global: 'Global markets',
  markets: 'Markets',
};

export const ITEM_STATUS: Record<ItemStatus, string> = {
  NEW: 'New',
  DRAFTED: 'Story started',
  DISMISSED: 'Dismissed',
  DUPLICATE: 'Duplicate',
};

export const PROVIDER_KINDS: Record<
  AiProviderKind,
  { label: string; hint: string }
> = {
  ANTHROPIC: {
    label: 'Anthropic (Claude)',
    hint: 'Claude models through Anthropic’s API. Needs an API key from console.anthropic.com.',
  },
  OPENAI: {
    label: 'OpenAI',
    hint: 'OpenAI’s API. Needs an API key from platform.openai.com.',
  },
  OPENAI_COMPATIBLE: {
    label: 'OpenAI-compatible server',
    hint: 'Any server with an OpenAI-style chat API: OpenRouter, Together, Groq, vLLM, LM Studio and others.',
  },
  OLLAMA: {
    label: 'Ollama (self-hosted)',
    hint: 'Models running on your own Ollama server. No key needed unless a proxy asks for one.',
  },
};

/** "US$0.42" for costs; null when the provider's prices weren't given. */
export function formatUsd(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v > 0 && v < 0.01) return '<US$0.01';
  return `US$${v.toFixed(2)}`;
}

export function FetchStatusBadge({
  status,
}: {
  status: 'RUNNING' | 'SUCCESS' | 'NOT_MODIFIED' | 'FAILED';
}) {
  const styles = {
    RUNNING: 'border-border bg-muted text-muted-foreground',
    SUCCESS: 'border-success/30 bg-success/10 text-success',
    NOT_MODIFIED: 'border-border bg-muted text-muted-foreground',
    FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
  };
  const labels = {
    RUNNING: 'Fetching…',
    SUCCESS: 'Fetched',
    NOT_MODIFIED: 'No changes',
    FAILED: 'Failed',
  };
  return (
    <Badge variant="outline" className={cn('font-medium', styles[status])}>
      {labels[status]}
    </Badge>
  );
}

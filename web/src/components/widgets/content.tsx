'use client';

import {
  ArrowRight,
  GraduationCap,
  ListChecks,
  Newspaper,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NewsCard } from '@/news/types';
import { useWidgetMode } from './data';
import { WidgetCard, WidgetMessage } from './frame';
import { DISCLAIMERS, type WidgetConfig } from './meta';

/** Story widgets: text the newsroom wrote, no market data. */

export function KeyTakeawaysWidget({ config }: { config: WidgetConfig }) {
  const items = (
    Array.isArray(config.items) ? (config.items as string[]) : []
  ).filter(Boolean);
  return (
    <aside className="not-prose my-8 rounded-xl border-l-4 border-emerald-600 bg-emerald-500/7 px-5 py-4">
      <p className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-emerald-700 uppercase dark:text-emerald-400">
        <ListChecks className="size-4" aria-hidden="true" />
        {String(config.title || 'Key takeaways')}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
            <span
              className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-600"
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function EducationalWidget({ config }: { config: WidgetConfig }) {
  const paragraphs = String(config.body ?? '')
    .split(/\n+/)
    .filter((p) => p.trim());
  const link = typeof config.link === 'string' ? config.link : null;
  return (
    <aside className="not-prose my-8 rounded-xl border border-border bg-muted/40 px-5 py-4">
      <p className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <GraduationCap className="size-4" aria-hidden="true" /> Explainer
      </p>
      <p className="mt-2 font-display text-lg font-bold">
        {String(config.term ?? '')}
      </p>
      <div className="mt-1 space-y-2 text-[15px] leading-relaxed text-foreground/90">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {link && (
        <a
          href={link}
          {...(link.startsWith('/')
            ? {}
            : { target: '_blank', rel: 'noopener noreferrer nofollow' })}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Learn more <ArrowRight className="size-4" aria-hidden="true" />
        </a>
      )}
    </aside>
  );
}

export function RiskDisclaimerWidget({
  config,
  text,
}: {
  config: WidgetConfig;
  text?: string;
}) {
  const wording =
    text ?? DISCLAIMERS[String(config.variant)] ?? DISCLAIMERS.general;
  return (
    <aside
      role="note"
      className="not-prose my-8 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/8 px-5 py-4 text-sm leading-relaxed"
    >
      <ShieldAlert
        className="mt-0.5 size-5 shrink-0 text-amber-600"
        aria-hidden="true"
      />
      <p>{wording}</p>
    </aside>
  );
}

const BANNER: Record<string, { box: string; button: string; body: string }> = {
  dark: {
    box: 'bg-[#0a0f0d] text-[#e7f3ec]',
    button: 'bg-[#4ade80] text-[#0a0f0d] hover:bg-white',
    body: 'text-[#8aa398]',
  },
  brand: {
    box: 'bg-[#15803d] text-white',
    button: 'bg-white text-[#14532d] hover:bg-[#dcfce7]',
    body: 'text-white/85',
  },
  light: {
    box: 'bg-card text-foreground border border-border',
    button: 'bg-primary text-primary-foreground hover:bg-primary/90',
    body: 'text-muted-foreground',
  },
};

export function PromoBannerWidget({ config }: { config: WidgetConfig }) {
  const look = BANNER[String(config.theme)] ?? BANNER.dark;
  const href = String(config.ctaUrl ?? '/');
  const external = !href.startsWith('/');
  return (
    <aside
      className={cn(
        'not-prose my-8 flex flex-col gap-4 rounded-xl px-6 py-5 sm:flex-row sm:items-center sm:justify-between',
        look.box,
      )}
    >
      <div>
        <p className="font-display text-xl font-bold">
          {String(config.headline ?? '')}
        </p>
        {config.body ? (
          <p className={cn('mt-1 text-sm', look.body)}>{String(config.body)}</p>
        ) : null}
      </div>
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener sponsored' } : {})}
        className={cn(
          'inline-flex shrink-0 items-center justify-center self-start rounded-lg px-5 py-2.5 text-sm font-bold sm:self-auto',
          look.button,
        )}
      >
        {String(config.ctaLabel ?? 'Learn more')}
      </a>
    </aside>
  );
}

export function RelatedNewsWidget({
  config,
  cards,
}: {
  config: WidgetConfig;
  cards?: NewsCard[];
}) {
  const mode = useWidgetMode();
  const title = String(config.title || 'Related news');
  return (
    <WidgetCard title={title} icon={Newspaper}>
      {cards && cards.length ? (
        <ul className="divide-y divide-border">
          {cards.map((c) => (
            <li key={c.id} className="py-2.5">
              <a
                href={`/news/${c.slug}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {c.title}
              </a>
              {c.category && (
                <span className="block text-xs text-muted-foreground">
                  {c.category.name}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <WidgetMessage kind="empty">
          {mode === 'preview'
            ? config.mode === 'manual'
              ? 'The stories you picked appear here once they’re published.'
              : 'The latest published stories from this story’s section appear here.'
            : 'No related stories yet.'}
        </WidgetMessage>
      )}
    </WidgetCard>
  );
}

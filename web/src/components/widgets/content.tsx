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

/**
 * Story widgets: text the newsroom wrote, no market data. They sit between
 * the story's prose runs, so they share the prose callouts' look: a 3 px
 * rule and the callout fill (--prose-callout-bg), with sentence-case labels
 * in the text colour (spec R1, R11, R14). Only area-level names and the
 * theme utilities are used, so the portal's light and dark modes follow.
 */

const LABEL =
  'flex items-center gap-2 text-[13px] leading-4 font-semibold text-foreground';

export function KeyTakeawaysWidget({ config }: { config: WidgetConfig }) {
  const items = (
    Array.isArray(config.items) ? (config.items as string[]) : []
  ).filter(Boolean);
  return (
    <aside className="not-prose my-8 rounded-r-[4px] border-l-[3px] border-foreground bg-(--prose-callout-bg) px-5 py-4 text-foreground">
      <p className={LABEL}>
        <ListChecks className="size-4" aria-hidden="true" />
        {String(config.title || 'Key takeaways')}
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
            <span
              className="mt-2.5 size-1.5 shrink-0 rounded-full bg-foreground"
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
    <aside className="not-prose my-8 rounded-[4px] border border-border bg-card px-5 py-4 text-card-foreground">
      <p className={LABEL}>
        <GraduationCap className="size-4" aria-hidden="true" /> Explainer
      </p>
      <p className="mt-2 font-display text-lg font-bold">
        {String(config.term ?? '')}
      </p>
      <div className="mt-1 space-y-2 text-[15px] leading-relaxed">
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
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4"
        >
          Learn more <ArrowRight className="size-3.5" aria-hidden="true" />
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
      className="not-prose my-8 flex gap-3 rounded-r-[4px] border-l-[3px] border-(--warning) bg-(--prose-callout-bg) px-5 py-4 text-sm leading-relaxed text-foreground"
    >
      <ShieldAlert
        className="mt-0.5 size-5 shrink-0 text-(--warning)"
        aria-hidden="true"
      />
      <p>{wording}</p>
    </aside>
  );
}

/**
 * The editor's three banner themes. "dark" and "brand" are fixed surfaces
 * coloured in widgets.css (.sv-promo[data-theme]): the stage tokens with the
 * green-400 button, and green-700 with a white button. "light" is the card.
 */
const BANNER: Record<'dark' | 'brand' | 'light', { box: string; cta: string }> =
  {
    dark: { box: '', cta: '' },
    brand: { box: '', cta: '' },
    light: {
      box: 'bg-card text-card-foreground border border-border',
      cta: 'bg-primary text-primary-foreground hover:bg-primary/90',
    },
  };
const themeOf = (v: unknown): keyof typeof BANNER =>
  v === 'brand' || v === 'light' ? v : 'dark';

export function PromoBannerWidget({ config }: { config: WidgetConfig }) {
  const theme = themeOf(config.theme);
  const look = BANNER[theme];
  const href = String(config.ctaUrl ?? '/');
  const external = !href.startsWith('/');
  return (
    <aside
      data-theme={theme}
      className={cn(
        'sv-promo not-prose my-8 flex flex-col gap-4 rounded-[12px] px-6 py-5 sm:flex-row sm:items-center sm:justify-between',
        look.box,
      )}
    >
      <div>
        <p className="font-display text-xl font-bold">
          {String(config.headline ?? '')}
        </p>
        {config.body ? (
          <p
            className={cn(
              'sv-promo-body mt-1 text-sm',
              theme === 'light' && 'text-muted-foreground',
            )}
          >
            {String(config.body)}
          </p>
        ) : null}
      </div>
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener sponsored' } : {})}
        className={cn(
          'sv-promo-cta inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-[8px] px-5 py-2.5 text-sm font-bold sm:self-auto',
          look.cta,
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
                className="font-medium underline-offset-4 hover:underline"
              >
                {c.title}
              </a>
              {c.category && (
                <span className="block text-[13px] leading-[18px] text-muted-foreground">
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

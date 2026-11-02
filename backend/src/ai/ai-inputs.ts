import { NewsSourceUsage } from '@prisma/client';
import type { DraftFromSourceInput, SourceMaterial } from './ai-tasks';

/** The parts of an incoming item a prompt may use. */
export interface ItemForAi {
  title: string;
  summary: string | null;
  content: string | null;
  publishedAt: Date | null;
  url: string | null;
  usage: NewsSourceUsage;
  allowAiDrafts: boolean;
  attribution: string;
  stocks: unknown;
  source: { name: string };
}

/**
 * Source material limited to what the source's licence (as it stood when the
 * item arrived) allows: headline-only sources give the headline, summary
 * sources add their summary, and only licensed sources give full text.
 */
export function materialFromItem(item: ItemForAi): SourceMaterial {
  return {
    name: item.attribution || item.source.name,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    url: item.url,
    usage: item.usage,
    headline: item.title,
    summary: item.usage === NewsSourceUsage.HEADLINE_ONLY ? null : item.summary,
    content: item.usage === NewsSourceUsage.FULL_TEXT ? item.content : null,
  };
}

/** Why the AI may not draft from this item, or null if it may. */
export function draftBlocked(item: ItemForAi): string | null {
  const name = item.attribution || item.source.name;
  if (!item.allowAiDrafts) {
    return `${name}’s terms, as set on the source, don’t allow AI drafts.`;
  }
  if (item.usage === NewsSourceUsage.HEADLINE_ONLY) {
    return `Only the headline may be used from ${name}, which isn’t enough for a draft.`;
  }
  if (!item.summary && !item.content) {
    return 'This item has no summary or text to draft from.';
  }
  return null;
}

export function draftInput(
  item: ItemForAi,
  now = new Date(),
): DraftFromSourceInput {
  const stocks = Array.isArray(item.stocks)
    ? (item.stocks as { name?: unknown }[])
        .map((s) => (typeof s.name === 'string' ? s.name : ''))
        .filter(Boolean)
    : [];
  return {
    now: now.toISOString(),
    source: materialFromItem(item),
    companies: stocks.slice(0, 8),
  };
}

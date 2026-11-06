/**
 * Article widgets: the 22 block types the editor's widget picker offers.
 * A widget is stored as structured JSON — a type, a schema version and a
 * config — never as HTML or script. Every config passes through `cleanWidget`
 * on save, which keeps only the fields its type defines, within their limits.
 * Market widgets fetch their numbers from the API at read time; content
 * widgets (takeaways, explainers, disclaimers, banners) carry their text.
 */
import { safeHref } from './article-content-links';

/** A config problem the writer can act on (→ 400). */
export class WidgetConfigError extends Error {}

export const WIDGET_TYPES = [
  'stock_quote',
  'index_quote',
  'mini_chart',
  'candle_chart',
  'stock_compare',
  'top_gainers',
  'top_losers',
  'most_active',
  'sector_performance',
  'heatmap',
  'commodities',
  'currency_rates',
  'ipo',
  'market_ticker',
  'key_takeaways',
  'related_stocks',
  'related_news',
  'educational',
  'risk_disclaimer',
  'promo_banner',
  'stock_list',
  'index_table',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Seconds between refreshes a widget may ask for (0 = never). */
export const REFRESH_CHOICES = [0, 5, 15, 30, 60, 300] as const;
/**
 * Rows in a stock list or an index table. 15 stays inside one public quotes
 * request (the API takes up to 20 refs) and one allowlist lookup.
 */
export const TABLE_ROWS = { min: 2, max: 15 } as const;
export const CHART_RANGES = ['1D', '5D', '1M', '6M', '1Y'] as const;
export const MOVER_SEGMENTS = ['largecap', 'midcap', 'smallcap'] as const;
export const IPO_VIEWS = ['open', 'upcoming', 'listed', 'issue'] as const;
export const BANNER_THEMES = ['dark', 'brand', 'light'] as const;
export const HEATMAP_INDICES = ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const;

/** Standard wording for the risk-disclaimer widget, by variant. */
export const DISCLAIMERS = {
  general:
    'This article is for information and education only and is not investment advice. Markets carry risk; do your own research or speak to a SEBI-registered adviser before you invest.',
  derivatives:
    'Futures and options are leveraged and high risk: most individual traders in equity F&O lose money, and losses can exceed the money you put in. This is not a recommendation to trade.',
  ipo: 'IPO subscriptions, allotments and listing gains are never guaranteed. Read the offer document (RHP) before you apply. This is not a recommendation to subscribe.',
  commodities:
    'Commodity prices are volatile and commodity futures are leveraged. This article is for information only and is not a recommendation to trade.',
} as const;
export type DisclaimerVariant = keyof typeof DISCLAIMERS;

/** "NSE:INFY", "BSE:SENSEX", "MCX:GOLD", "CDS:USDINR", "NSE:NIFTY IT". */
const REF = /^(NSE|BSE|MCX|CDS):([A-Z0-9][A-Z0-9 &_.-]{0,39})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Control characters other than newline and tab never belong in widget text.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

type Raw = Record<string, unknown>;
export type WidgetConfig = Record<string, unknown>;

/** Instruments a widget quotes: listed stocks, and curated instruments. */
export interface WidgetRefs {
  stocks: string[];
  curated: string[];
  /** Curated refs that must be indices on the market list (Index table). */
  indices?: string[];
}

interface WidgetDef {
  version: number;
  label: string;
  clean: (c: Raw) => WidgetConfig;
  refs: (c: WidgetConfig) => WidgetRefs;
  /** Editorial text, for search and reading time. */
  text?: (c: WidgetConfig) => string;
}

// ── Field helpers ─────────────────────────────────────────────────────────

function text(v: unknown, max: number, field: string, required = false) {
  const s =
    typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, max) : '';
  if (required && !s) throw new WidgetConfigError(`Add ${field}.`);
  return s;
}

function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

function count(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function refresh(v: unknown, fallback: number): number {
  return typeof v === 'number' &&
    (REFRESH_CHOICES as readonly number[]).includes(v)
    ? v
    : fallback;
}

/** Normalises "nse:infy" → "NSE:INFY"; throws on anything else. */
export function instrumentRef(v: unknown, field = 'an instrument'): string {
  const ref =
    typeof v === 'string' ? v.trim().toUpperCase().replace(/\s+/g, ' ') : '';
  if (!REF.test(ref)) throw new WidgetConfigError(`Choose ${field}.`);
  return ref;
}

function stockRef(v: unknown, field = 'a stock'): string {
  const ref = instrumentRef(v, field);
  if (!ref.startsWith('NSE:') && !ref.startsWith('BSE:')) {
    throw new WidgetConfigError(`Choose ${field} listed on the NSE or BSE.`);
  }
  return ref;
}

function refList(
  v: unknown,
  min: number,
  max: number,
  each: (x: unknown) => string,
  what: string,
): string[] {
  const list = Array.isArray(v) ? [...new Set(v.map(each))] : [];
  if (list.length < min) {
    throw new WidgetConfigError(
      min === 1
        ? `Choose at least one ${what}.`
        : `Choose at least ${min} ${what}s.`,
    );
  }
  if (list.length > max) {
    throw new WidgetConfigError(`Choose up to ${max} ${what}s.`);
  }
  return list;
}

/**
 * An ordered list of refs for a table, each at most once. The writer's order
 * is the table's order, so a repeat is a mistake to fix, never dropped
 * quietly. Lengths are checked before each ref is read.
 */
function tableRefs(
  v: unknown,
  each: (x: unknown) => string,
  many: string,
): string[] {
  const raw: unknown[] = Array.isArray(v) ? v : [];
  if (raw.length < TABLE_ROWS.min) {
    throw new WidgetConfigError(`Choose at least ${TABLE_ROWS.min} ${many}.`);
  }
  if (raw.length > TABLE_ROWS.max) {
    throw new WidgetConfigError(`Choose up to ${TABLE_ROWS.max} ${many}.`);
  }
  const list: string[] = [];
  for (const x of raw) {
    const ref = each(x);
    if (list.includes(ref)) {
      throw new WidgetConfigError(
        `${ref.slice(ref.indexOf(':') + 1)} is in the list twice. Remove one.`,
      );
    }
    list.push(ref);
  }
  return list;
}

/** An index on the market list is an NSE or BSE ref ("NSE:NIFTY IT"). */
function indexRef(v: unknown): string {
  const ref = instrumentRef(v, 'an index');
  if (!ref.startsWith('NSE:') && !ref.startsWith('BSE:')) {
    throw new WidgetConfigError(
      `${ref.slice(ref.indexOf(':') + 1)} isn’t an index. Choose indices from the market list.`,
    );
  }
  return ref;
}

/** A table's optional title, and whether it shows the day's range. */
function tableExtras(c: Raw): { title?: string; dayRange: boolean } {
  const title = text(c.title, 60, 'a title');
  return {
    ...(title ? { title } : {}),
    dayRange: typeof c.dayRange === 'boolean' ? c.dayRange : true,
  };
}

const none = (): WidgetRefs => ({ stocks: [], curated: [] });
const isStockRef = (r: string) => r.startsWith('NSE:') || r.startsWith('BSE:');

/** A ref that may be a listed stock or a curated index/commodity/currency. */
const split = (refs: string[]): WidgetRefs => ({
  stocks: refs.filter(isStockRef),
  curated: refs,
});

// ── The widgets ───────────────────────────────────────────────────────────

const movers = (label: string): WidgetDef => ({
  version: 1,
  label,
  clean: (c) => ({
    segment: oneOf(c.segment, MOVER_SEGMENTS, 'largecap'),
    limit: count(c.limit, 3, 10, 5),
    refresh: refresh(c.refresh, 30),
  }),
  refs: none,
});

export const WIDGETS: Record<WidgetType, WidgetDef> = {
  stock_quote: {
    version: 1,
    label: 'Stock quote',
    clean: (c) => ({
      symbol: stockRef(c.symbol),
      refresh: refresh(c.refresh, 15),
    }),
    refs: (c) => ({ stocks: [c.symbol as string], curated: [] }),
  },
  index_quote: {
    version: 1,
    label: 'Index quote',
    clean: (c) => ({
      symbol: instrumentRef(c.symbol, 'an index'),
      refresh: refresh(c.refresh, 15),
    }),
    refs: (c) => ({ stocks: [], curated: [c.symbol as string] }),
  },
  mini_chart: {
    version: 1,
    label: 'Mini chart',
    clean: (c) => ({
      symbol: instrumentRef(c.symbol),
      range: oneOf(c.range, ['1D', '5D', '1M'] as const, '1D'),
      refresh: refresh(c.refresh, 60),
    }),
    refs: (c) => split([c.symbol as string]),
  },
  candle_chart: {
    version: 1,
    label: 'Candlestick chart',
    clean: (c) => ({
      symbol: instrumentRef(c.symbol),
      range: oneOf(c.range, CHART_RANGES, '1M'),
      refresh: refresh(c.refresh, 60),
    }),
    refs: (c) => split([c.symbol as string]),
  },
  stock_compare: {
    version: 1,
    label: 'Stock comparison',
    clean: (c) => ({
      symbols: refList(c.symbols, 2, 4, (x) => instrumentRef(x), 'instrument'),
      range: oneOf(c.range, ['1M', '6M', '1Y'] as const, '6M'),
    }),
    refs: (c) => split(c.symbols as string[]),
  },
  top_gainers: movers('Top gainers'),
  top_losers: movers('Top losers'),
  most_active: {
    version: 1,
    label: 'Most active stocks',
    clean: (c) => ({
      limit: count(c.limit, 3, 10, 5),
      refresh: refresh(c.refresh, 30),
    }),
    refs: none,
  },
  sector_performance: {
    version: 1,
    label: 'Sector performance',
    clean: (c) => ({
      limit: count(c.limit, 4, 14, 8),
      refresh: refresh(c.refresh, 30),
    }),
    refs: none,
  },
  heatmap: {
    version: 1,
    label: 'Market heatmap',
    clean: (c) => ({
      index: oneOf(c.index, HEATMAP_INDICES, 'NIFTY'),
      refresh: refresh(c.refresh, 60),
    }),
    refs: none,
  },
  commodities: {
    version: 1,
    label: 'Commodities',
    clean: (c) => ({
      // Empty = every commodity on the curated list.
      symbols: refList(
        c.symbols ?? [],
        0,
        8,
        (x) => instrumentRef(x, 'a commodity'),
        'commodity',
      ),
      refresh: refresh(c.refresh, 30),
    }),
    refs: (c) => ({ stocks: [], curated: c.symbols as string[] }),
  },
  currency_rates: {
    version: 1,
    label: 'Currency rates',
    clean: (c) => ({
      symbols: refList(
        c.symbols ?? [],
        0,
        4,
        (x) => instrumentRef(x, 'a currency pair'),
        'currency pair',
      ),
      refresh: refresh(c.refresh, 30),
    }),
    refs: (c) => ({ stocks: [], curated: c.symbols as string[] }),
  },
  ipo: {
    version: 1,
    label: 'IPO information',
    clean: (c) => {
      const view = oneOf(c.view, IPO_VIEWS, 'open');
      const symbol =
        view === 'issue'
          ? text(c.symbol, 30, 'the IPO’s symbol', true).toUpperCase()
          : '';
      if (symbol && !/^[A-Z0-9&_.-]{1,30}$/.test(symbol)) {
        throw new WidgetConfigError('That isn’t an IPO symbol.');
      }
      return {
        view,
        ...(symbol ? { symbol } : {}),
        limit: count(c.limit, 1, 10, 5),
      };
    },
    refs: none,
  },
  market_ticker: {
    version: 1,
    label: 'Market ticker',
    clean: (c) => ({
      // Empty = the site's ticker list.
      symbols: refList(
        c.symbols ?? [],
        0,
        20,
        (x) => instrumentRef(x),
        'instrument',
      ),
      refresh: refresh(c.refresh, 15),
    }),
    refs: (c) => ({ stocks: [], curated: c.symbols as string[] }),
  },
  key_takeaways: {
    version: 1,
    label: 'Key takeaways',
    clean: (c) => {
      const items = (Array.isArray(c.items) ? c.items : [])
        .map((i) => text(i, 240, 'a point'))
        .filter(Boolean);
      if (items.length === 0) {
        throw new WidgetConfigError('Add at least one takeaway.');
      }
      if (items.length > 8) {
        throw new WidgetConfigError('Keep it to eight takeaways at most.');
      }
      return {
        title: text(c.title, 80, 'a title') || 'Key takeaways',
        items,
      };
    },
    refs: none,
    text: (c) => [c.title, ...(c.items as string[])].join('\n'),
  },
  related_stocks: {
    version: 1,
    label: 'Related stocks',
    clean: (c) => ({
      // Empty = the article's own related stocks.
      symbols: refList(c.symbols ?? [], 0, 8, (x) => stockRef(x), 'stock'),
      refresh: refresh(c.refresh, 15),
    }),
    refs: (c) => ({ stocks: c.symbols as string[], curated: [] }),
  },
  related_news: {
    version: 1,
    label: 'Related news',
    clean: (c) => {
      const mode = oneOf(c.mode, ['category', 'manual'] as const, 'category');
      const ids =
        mode === 'manual'
          ? refList(
              c.articleIds,
              1,
              6,
              (x) => {
                const id = typeof x === 'string' ? x.trim() : '';
                if (!UUID.test(id)) {
                  throw new WidgetConfigError('Choose published stories.');
                }
                return id.toLowerCase();
              },
              'story',
            )
          : [];
      return {
        mode,
        ...(mode === 'manual' ? { articleIds: ids } : {}),
        limit: count(c.limit, 2, 6, 3),
        title: text(c.title, 60, 'a title') || 'Related news',
      };
    },
    refs: none,
  },
  educational: {
    version: 1,
    label: 'Explainer',
    clean: (c) => {
      const raw = text(c.link, 500, 'a link');
      const link = raw ? safeHref(raw) : null;
      if (raw && (!link || link.startsWith('mailto:'))) {
        throw new WidgetConfigError(
          'The “learn more” link must be a web address or a page on this site.',
        );
      }
      return {
        term: text(c.term, 80, 'the term it explains', true),
        body: text(c.body, 1200, 'the explanation', true),
        ...(link ? { link } : {}),
      };
    },
    refs: none,
    text: (c) => `${c.term as string}\n${c.body as string}`,
  },
  risk_disclaimer: {
    version: 1,
    label: 'Risk disclaimer',
    clean: (c) => ({
      variant: oneOf(
        c.variant,
        Object.keys(DISCLAIMERS) as DisclaimerVariant[],
        'general',
      ),
    }),
    refs: none,
  },
  promo_banner: {
    version: 1,
    label: 'Promotional banner',
    clean: (c) => {
      const href = safeHref(text(c.ctaUrl, 500, 'the button link', true));
      if (!href || href.startsWith('mailto:')) {
        throw new WidgetConfigError(
          'The button must link to a web address or a page on this site.',
        );
      }
      return {
        headline: text(c.headline, 80, 'a headline', true),
        body: text(c.body, 240, 'the text'),
        ctaLabel: text(c.ctaLabel, 30, 'the button label', true),
        ctaUrl: href,
        theme: oneOf(c.theme, BANNER_THEMES, 'dark'),
      };
    },
    refs: none,
    text: (c) => `${c.headline as string}\n${c.body as string}`,
  },
  // Its stocks reach the public quote allowlist through refs(): every save
  // writes them to the story's widget index, which the allowlist reads once
  // the story is listed (as for Related stocks).
  stock_list: {
    version: 1,
    label: 'Stock list',
    clean: (c) => ({
      ...tableExtras(c),
      symbols: tableRefs(c.symbols, (x) => stockRef(x), 'stocks'),
      refresh: refresh(c.refresh, 15),
    }),
    refs: (c) => ({ stocks: c.symbols as string[], curated: [] }),
  },
  // Indices from the curated market list (as for Index quote): checked
  // against it on save, kind INDEX included (refs().indices), and always
  // quotable from the live snapshot.
  index_table: {
    version: 1,
    label: 'Index table',
    clean: (c) => ({
      ...tableExtras(c),
      symbols: tableRefs(c.symbols, indexRef, 'indices'),
      refresh: refresh(c.refresh, 15),
    }),
    refs: (c) => ({
      stocks: [],
      curated: c.symbols as string[],
      indices: c.symbols as string[],
    }),
  },
};

export function isWidgetType(v: unknown): v is WidgetType {
  return (
    typeof v === 'string' && (WIDGET_TYPES as readonly string[]).includes(v)
  );
}

/**
 * Validates a widget's type and config and returns a clean copy. Older
 * versions are upgraded in place when their type changes shape.
 */
export function cleanWidget(
  type: unknown,
  config: unknown,
): { widget: WidgetType; v: number; config: WidgetConfig } {
  if (!isWidgetType(type)) {
    throw new WidgetConfigError(`Unknown widget: ${String(type)}.`);
  }
  const def = WIDGETS[type];
  const raw =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Raw)
      : {};
  try {
    return { widget: type, v: def.version, config: def.clean(raw) };
  } catch (err) {
    if (err instanceof WidgetConfigError) {
      throw new WidgetConfigError(`${def.label}: ${err.message}`);
    }
    throw err;
  }
}

export function widgetRefs(type: WidgetType, config: WidgetConfig): WidgetRefs {
  return WIDGETS[type].refs(config);
}

export function widgetText(type: WidgetType, config: WidgetConfig): string {
  return WIDGETS[type].text?.(config) ?? '';
}

export function widgetLabel(type: WidgetType): string {
  return WIDGETS[type].label;
}

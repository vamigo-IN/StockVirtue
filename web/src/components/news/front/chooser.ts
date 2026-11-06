import type { HomeSection, NewsCard } from '@/news/types';
import { isPictureUnit } from './dedupe';

/**
 * The news front's layout chooser (spec §5.9.2): which story units a CMS
 * section draws, for its type and its number of stories (1–12), so that no
 * layout leaves an empty grid cell. PURE: no React, no clock, no
 * 'server-only' (the design gallery's fixture page runs every case).
 *
 * The output is a list of REGIONS (the splash, the stacked features beside
 * it, a feature grid, a list of briefs …) holding UNITS. A unit is one
 * StoryCard; a story that needs a different unit at another width gets one
 * unit per width range, each shown only in its ranges (`on`):
 *   'd' >= 1024 px · 't' 768–1023 px · 'p' below 768 px.
 * Phones read every story after the splash as a `row` or a `brief`
 * (spec §5.9.2 "Phone"), so a desktop `feature` comes with a phone `row`.
 * Where the units sit at each width (columns, spans, CSS columns) is
 * front.module.css's job, keyed by `kind` (data-layout) and the region
 * slots. The phone cap is applied here: units of stories past the cap
 * simply aren't shown below 768 px (FrontSection marks the main column
 * with data-phone-cap as well).
 */

/** Width ranges: 'p' < 768 px, 't' 768–1023 px, 'd' >= 1024 px. */
export type Range = 'p' | 't' | 'd';

const ALL: readonly Range[] = ['p', 't', 'd'];
const D: readonly Range[] = ['d'];
const T: readonly Range[] = ['t'];
const P: readonly Range[] = ['p'];
const TD: readonly Range[] = ['t', 'd'];
const TP: readonly Range[] = ['t', 'p'];

export type UnitVariant = 'splash' | 'feature' | 'row' | 'brief' | 'line' | 'notice';

/** One StoryCard: a story in one variant, shown in some width ranges. */
export interface FrontUnit {
  card: NewsCard;
  /** The story's position in its section (0-based), for the phone cap. */
  index: number;
  variant: UnitVariant;
  /** Where this unit shows. */
  on: Range[];
  /** splash only: image beside the text (one featured story). */
  orientation?: 'horizontal';
  /** row only: the large row (160 px thumbnail on the left from 768 px). */
  size?: 'lg';
  /** 'tablet-up': no standfirst below 768 px (the splash, and every brief:
   * phones read the front as headlines; spec §5.9.2 "Phone", §5.9.5). */
  standfirst?: 'tablet-up';
  /** Drawn without its picture (de-duplication, list mode). */
  noImage?: boolean;
  /** The page's first splash: its image loads eagerly (LCP). */
  priority?: boolean;
}

/**
 * Region slots (front.module.css places each one per layout kind):
 * - `one`: a single large row (one story);
 * - `lead`: the featured splash, or a category's lead feature;
 * - `side`: the features stacked beside the splash, or a category's briefs;
 * - `tail`: featured with 2 stories and a module: the second story as a
 *   large row under the splash and the module (tablets and phones);
 * - `grid2` / `grid3`: a nested grid of features (Top stories, Learn);
 * - `briefs`: a list of briefs in CSS columns;
 * - `pair`: two rows side by side;
 * - `lines`: a category's `line` list for stories 6 and up;
 * - `notices`: Official updates' notice rows in CSS columns;
 * - `list`: list mode (rows without pictures, then briefs).
 */
export type RegionSlot =
  | 'one'
  | 'lead'
  | 'side'
  | 'tail'
  | 'grid2'
  | 'grid3'
  | 'briefs'
  | 'pair'
  | 'lines'
  | 'notices'
  | 'list';

export interface FrontRegion {
  slot: RegionSlot;
  /** The union of its units' ranges: the region shows only there. */
  on: Range[];
  /** How many of its units show in each range (a one-item list drops its
   * second CSS column there: front.module.css reads data-n-p/t/d). */
  count: Record<Range, number>;
  units: FrontUnit[];
}

/**
 * The layout kinds (FrontSection writes it as data-layout):
 * - `featured-one`: one featured story, a horizontal splash;
 * - `featured`: the splash, features beside it, then briefs;
 * - `row-one`: one story as a large row (Top stories, a category, Learn);
 * - `grid`: features in a grid, then briefs (Top stories, Learn);
 * - `pair`: two rows side by side (a category with 2 stories);
 * - `category`: a lead feature, briefs beside it, then lines;
 * - `notices`: Official updates;
 * - `list`: list mode (the section's first story is already on the page);
 * - `breaking`, `trending`, `house-ad`: their own components;
 * - `none`: nothing to draw (an unknown type, or no stories).
 */
export type FrontKind =
  | 'featured-one'
  | 'featured'
  | 'row-one'
  | 'grid'
  | 'pair'
  | 'category'
  | 'notices'
  | 'list'
  | 'breaking'
  | 'trending'
  | 'house-ad'
  | 'none';

/** What a CMS section is on the front. */
export type SectionRole =
  | 'breaking'
  | 'featured'
  | 'latest'
  | 'category'
  | 'official'
  | 'learn'
  | 'trending'
  | 'app_promo';

export interface FrontLayout {
  kind: FrontKind;
  role: SectionRole | null;
  regions: FrontRegion[];
  /** Stories shown below 768 px (null: all). */
  phoneCap: number | null;
  /** false: units show the reading time instead of the clock time (Learn). */
  clock: boolean;
  /** Ids this section draws as pictures (for the page's `seen` set). */
  pictures: string[];
}

export interface ChooseContext {
  /** The section has a paired module (an aside), so its main column is
   * narrower: cols 1–9 at >= 1280, 1–8 at 1024–1279, 1–5 on tablets. */
  aside: boolean;
  /** Stories already drawn as pictures higher up the page (dedupe.ts). */
  seen?: { has(id: string): boolean };
  /** This is the page's first story band: its splash image is the LCP. */
  priority?: boolean;
}

/** The slug of the Official updates category (spec §5.9.2). */
export const OFFICIAL_SLUG = 'official-updates';
/** The slug of the Learn category (spec §5.9.2). */
export const LEARN_SLUG = 'education';

/** Stories shown below 768 px, per section (spec §5.9.2 "Phone cap"). */
export const PHONE_CAPS = {
  featured: 4, // the splash and 3 rows
  latest: 6,
  category: 3,
  official: 3,
  learn: 3,
} as const;

/** Rows (without pictures) before list mode switches to briefs. */
const LIST_ROWS = 3;
/** A category's briefs beside its lead feature before the line list. */
const CATEGORY_BRIEFS = 4;

export function sectionRole(s: HomeSection): SectionRole | null {
  switch (s.type) {
    case 'breaking':
    case 'featured':
    case 'latest':
    case 'trending':
    case 'app_promo':
      return s.type;
    case 'category': {
      const slug = s.category?.slug;
      if (slug === OFFICIAL_SLUG) return 'official';
      if (slug === LEARN_SLUG) return 'learn';
      return 'category';
    }
    default:
      return null;
  }
}

/** Whether a section draws anything: a known type with stories (the house ad needs none). */
export function sectionRenders(s: HomeSection): boolean {
  const role = sectionRole(s);
  if (!role) return false;
  return role === 'app_promo' || s.items.length > 0;
}

/** Sections whose stories are laid out in a band with a grid. */
export function isStoryBand(role: SectionRole | null): boolean {
  return (
    role === 'featured' ||
    role === 'latest' ||
    role === 'category' ||
    role === 'official' ||
    role === 'learn'
  );
}

function unit(
  card: NewsCard,
  index: number,
  variant: UnitVariant,
  on: readonly Range[],
  extra: Partial<Omit<FrontUnit, 'card' | 'index' | 'variant' | 'on'>> = {},
): FrontUnit {
  // Briefs drop their one-line summary below 768 px.
  const standfirst = variant === 'brief' ? 'tablet-up' : undefined;
  return { card, index, variant, on: [...on], ...(standfirst ? { standfirst } : {}), ...extra };
}

function region(slot: RegionSlot, units: FrontUnit[]): FrontRegion {
  return { slot, on: [], count: { p: 0, t: 0, d: 0 }, units };
}

/** featured (spec §5.9.2, rows 1–5; tablet 5 + 3). */
function featuredRegions(items: NewsCard[], aside: boolean, priority: boolean): {
  kind: FrontKind;
  regions: FrontRegion[];
} {
  const [first] = items;
  const splash = unit(first, 0, 'splash', ALL, {
    standfirst: 'tablet-up',
    priority: priority && Boolean(first.image),
    orientation: items.length === 1 ? 'horizontal' : undefined,
  });
  if (items.length === 1) {
    return { kind: 'featured-one', regions: [region('lead', [splash])] };
  }
  const regions = [region('lead', [splash])];
  if (items.length === 2) {
    const second = items[1];
    if (aside) {
      // Tablets put the module beside the splash, so the second story
      // can't sit there: it becomes a large row under both (a lone
      // feature would leave half a row empty).
      regions.push(region('side', [unit(second, 1, 'feature', D)]));
      regions.push(region('tail', [unit(second, 1, 'row', TP, { size: 'lg' })]));
    } else {
      regions.push(
        region('side', [unit(second, 1, 'feature', TD), unit(second, 1, 'row', P)]),
      );
    }
    return { kind: 'featured', regions };
  }
  const side: FrontUnit[] = [];
  for (const i of [1, 2]) {
    side.push(unit(items[i], i, 'feature', TD), unit(items[i], i, 'row', P));
  }
  regions.push(region('side', side));
  if (items.length > 3) {
    regions.push(
      region(
        'briefs',
        items.slice(3).map((c, k) => unit(c, k + 3, 'brief', ALL)),
      ),
    );
  }
  return { kind: 'featured', regions };
}

/**
 * Top stories and Learn: one large row; 2 features; 3 features (tablets
 * show 2, the third joins the briefs); then briefs in CSS columns.
 */
function gridRegions(items: NewsCard[]): { kind: FrontKind; regions: FrontRegion[] } {
  if (items.length === 1) {
    return { kind: 'row-one', regions: [region('one', [unit(items[0], 0, 'row', ALL, { size: 'lg' })])] };
  }
  if (items.length === 2) {
    return {
      kind: 'grid',
      regions: [
        region('grid2', [
          unit(items[0], 0, 'feature', TD),
          unit(items[0], 0, 'row', P),
          unit(items[1], 1, 'feature', TD),
          unit(items[1], 1, 'row', P),
        ]),
      ],
    };
  }
  const grid = region('grid3', [
    unit(items[0], 0, 'feature', TD),
    unit(items[0], 0, 'row', P),
    unit(items[1], 1, 'feature', TD),
    unit(items[1], 1, 'row', P),
    unit(items[2], 2, 'feature', D),
    unit(items[2], 2, 'row', P),
  ]);
  const briefs = region('briefs', [
    unit(items[2], 2, 'brief', T),
    ...items.slice(3).map((c, k) => unit(c, k + 3, 'brief', ALL)),
  ]);
  return { kind: 'grid', regions: [grid, briefs] };
}

/** A category: one large row; two rows; a lead feature, briefs beside it, then lines. */
function categoryRegions(items: NewsCard[]): { kind: FrontKind; regions: FrontRegion[] } {
  if (items.length === 1) {
    return { kind: 'row-one', regions: [region('one', [unit(items[0], 0, 'row', ALL, { size: 'lg' })])] };
  }
  if (items.length === 2) {
    return {
      kind: 'pair',
      regions: [region('pair', [unit(items[0], 0, 'row', ALL), unit(items[1], 1, 'row', ALL)])],
    };
  }
  const regions = [
    region('lead', [unit(items[0], 0, 'feature', TD), unit(items[0], 0, 'row', P)]),
    region(
      'side',
      items.slice(1, 1 + CATEGORY_BRIEFS).map((c, k) => unit(c, k + 1, 'brief', ALL)),
    ),
  ];
  if (items.length > 1 + CATEGORY_BRIEFS) {
    regions.push(
      region(
        'lines',
        items.slice(1 + CATEGORY_BRIEFS).map((c, k) => unit(c, k + 1 + CATEGORY_BRIEFS, 'line', ALL)),
      ),
    );
  }
  return { kind: 'category', regions };
}

/** List mode: rows without pictures, then briefs. */
function listRegions(items: NewsCard[]): { kind: FrontKind; regions: FrontRegion[] } {
  return {
    kind: 'list',
    regions: [
      region(
        'list',
        items.map((c, i) =>
          i < LIST_ROWS ? unit(c, i, 'row', ALL, { noImage: true }) : unit(c, i, 'brief', ALL),
        ),
      ),
    ],
  };
}

/** A story already drawn as a picture higher up becomes a brief without its image. */
function demote(u: FrontUnit): FrontUnit {
  return unit(u.card, u.index, 'brief', u.on, { noImage: true });
}

const sameUnit = (a: FrontUnit, b: FrontUnit) =>
  a.card.id === b.card.id &&
  a.variant === b.variant &&
  a.orientation === b.orientation &&
  a.size === b.size &&
  a.standfirst === b.standfirst &&
  Boolean(a.noImage) === Boolean(b.noImage) &&
  Boolean(a.priority) === Boolean(b.priority);

/** Joins identical units of one story in one region (their ranges merge). */
function merge(units: FrontUnit[]): FrontUnit[] {
  const out: FrontUnit[] = [];
  for (const u of units) {
    const twin = out.find((o) => sameUnit(o, u));
    if (twin) {
      twin.on = ALL.filter((r) => twin.on.includes(r) || u.on.includes(r));
    } else {
      out.push({ ...u, on: [...u.on] });
    }
  }
  return out;
}

/**
 * The layout for one CMS section. `ctx.aside` says whether a module is
 * paired with it (assign-modules.ts); `ctx.seen` holds the stories drawn
 * as pictures higher up the page. Unknown types and empty sections give
 * `kind: 'none'`.
 */
export function chooseLayout(section: HomeSection, ctx: ChooseContext): FrontLayout {
  const role = sectionRole(section);
  const items = section.items;
  const base = { role, phoneCap: null, clock: role !== 'learn', pictures: [] as string[] };
  if (!role) return { ...base, kind: 'none', regions: [] };
  if (role === 'breaking') {
    return { ...base, kind: items.length ? 'breaking' : 'none', regions: [] };
  }
  if (role === 'trending') {
    return { ...base, kind: items.length ? 'trending' : 'none', regions: [] };
  }
  if (role === 'app_promo') return { ...base, kind: 'house-ad', regions: [] };
  if (!items.length) return { ...base, kind: 'none', regions: [] };

  const cap = PHONE_CAPS[role];
  const seen = ctx.seen;
  // Official updates are notice rows, which never show a picture: there is
  // nothing to de-duplicate, so they keep their layout.
  const listMode = role !== 'official' && Boolean(seen?.has(items[0].id));

  let built: { kind: FrontKind; regions: FrontRegion[] };
  if (listMode) built = listRegions(items);
  else if (role === 'featured') built = featuredRegions(items, ctx.aside, Boolean(ctx.priority));
  else if (role === 'latest' || role === 'learn') built = gridRegions(items);
  else if (role === 'official') {
    built = {
      kind: 'notices',
      regions: [region('notices', items.map((c, i) => unit(c, i, 'notice', ALL)))],
    };
  } else built = categoryRegions(items);

  const regions: FrontRegion[] = [];
  for (const r of built.regions) {
    const units = merge(
      r.units
        // List mode already draws no pictures; elsewhere a story seen
        // higher up becomes a brief (notices have no picture to repeat).
        .map((u) =>
          !listMode && seen?.has(u.card.id) && u.variant !== 'brief' && u.variant !== 'notice'
            ? demote(u)
            : u,
        )
        // The phone cap: stories past it aren't shown below 768 px.
        .map((u) => (u.index >= cap ? { ...u, on: u.on.filter((x) => x !== 'p') } : u))
        .filter((u) => u.on.length > 0),
    );
    if (!units.length) continue;
    const on = ALL.filter((x) => units.some((u) => u.on.includes(x)));
    const count = { p: 0, t: 0, d: 0 };
    for (const x of ALL) count[x] = units.filter((u) => u.on.includes(x)).length;
    regions.push({ slot: r.slot, on, count, units });
  }

  const pictures: string[] = [];
  for (const r of regions) {
    for (const u of r.units) {
      const hasImage = Boolean(u.card.image) && !u.noImage;
      if (isPictureUnit({ variant: u.variant, hasImage }) && !pictures.includes(u.card.id)) {
        pictures.push(u.card.id);
      }
    }
  }

  return { ...base, kind: built.kind, regions, phoneCap: cap, pictures };
}

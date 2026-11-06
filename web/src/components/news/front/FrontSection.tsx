import 'server-only';
import type { ReactNode } from 'react';
import { BreakingBar, TrendingList } from '@/components/news/blocks';
import { HouseAd } from '@/components/news/HouseAd';
import { StoryCard } from '@/components/news/StoryCard';
import { Container } from '@/components/public/Container';
import { RuleHead } from '@/components/public/Heads';
import { cn } from '@/lib/utils';
import { newsPath } from '@/news/routes';
import type { HomeSection } from '@/news/types';
import {
  assignModules,
  type FrontModule,
  type ModuleAssignment,
  type ModuleContext,
} from './assign-modules';
import { BandChip, BandRail, chipKind, type FrontData } from './BandModule';
import {
  chooseLayout,
  isStoryBand,
  sectionRenders,
  sectionRole,
  type FrontLayout,
  type FrontRegion,
  type FrontUnit,
  type Range,
} from './chooser';
import { createSeen } from './dedupe';
import s from './front.module.css';

/**
 * One CMS section of the news front (spec §5.9.1), drawn from its layout
 * (chooser.ts). SERVER component: the units are StoryCards, which read the
 * server's clock.
 *
 * - Story bands are sibling `<section aria-labelledby="section-{id}">`s
 *   (never nested): a RuleHead (featured keeps a sr-only h2), then
 *   `div.sv-band-grid` with the stories in `div.sv-band-main` and, when a
 *   module is paired, the rail (`<div data-rail>`, BandModule.tsx) after
 *   them, so the DOM order is the phone's reading order.
 * - Trending sits on the full-bleed paper band, its `<ol>` inside the
 *   section (`#section-trending → .. → .. → ol li`).
 * - Breaking is BreakingBar's own `<section aria-label="Breaking news">`.
 * - `app_promo` is the HouseAd (`<aside aria-label="From StockVirtue">`),
 *   outside any `<section>`.
 * - Unknown types and empty sections draw nothing.
 * The `sv-band*` class names mark the structure for readers of the DOM;
 * the styles are front.module.css's.
 */

/** HouseAd's title when the newsroom leaves it empty (spec §9.6.1). */
const HOUSE_AD_TITLE = 'Practise with the StockVirtue app';
/** The Top stories head's link (spec §9.6, unchanged). */
const ALL_THE_LATEST = 'All the latest';

const HIDE: Record<Range, string> = { p: s.hideP, t: s.hideT, d: s.hideD };

/** The classes that hide a unit or a region outside its ranges. */
function hideOutside(on: readonly Range[]): string | undefined {
  const parts = (Object.keys(HIDE) as Range[]).filter((r) => !on.includes(r)).map((r) => HIDE[r]);
  return parts.length ? parts.join(' ') : undefined;
}

const SLOT_CLASS: Record<FrontRegion['slot'], string> = {
  one: s.one,
  lead: s.lead,
  side: s.side,
  tail: s.tail,
  grid2: s.grid2,
  grid3: s.grid3,
  briefs: s.briefs,
  pair: s.pair,
  lines: s.lines,
  notices: s.notices,
  list: s.list,
};

function Unit({ unit, clock }: { unit: FrontUnit; clock: boolean }) {
  const card = unit.noImage && unit.card.image ? { ...unit.card, image: null } : unit.card;
  return (
    <StoryCard
      card={card}
      variant={unit.variant}
      priority={unit.priority}
      standfirst={unit.standfirst}
      orientation={unit.orientation}
      size={unit.size}
      clock={clock}
      className={hideOutside(unit.on)}
    />
  );
}

function Region({ region, clock }: { region: FrontRegion; clock: boolean }) {
  return (
    <div
      className={cn(s.region, SLOT_CLASS[region.slot], hideOutside(region.on))}
      data-slot={region.slot}
      data-n-p={region.count.p}
      data-n-t={region.count.t}
      data-n-d={region.count.d}
    >
      {region.units.map((u) => (
        <Unit key={`${u.index}-${u.variant}-${u.on.join('')}`} unit={u} clock={clock} />
      ))}
    </div>
  );
}

/** Where a section's head links ("More from {title}"; Top stories: "All the latest"). */
function headLink(section: HomeSection): { href?: string; linkLabel?: string } {
  if (section.type === 'latest') return { href: newsPath.latest(), linkLabel: ALL_THE_LATEST };
  if (section.type === 'category' && section.category) {
    return { href: newsPath.category(section.category.slug) };
  }
  return {};
}

export function FrontSection({
  section,
  layout,
  rail = null,
  headAside,
  playUrl,
}: {
  section: HomeSection;
  layout: FrontLayout;
  /** The band's modules (BandRail), or the design gallery's stand-ins;
   * null or absent: no module is paired, the stories take the band. */
  rail?: ReactNode;
  /** The RuleHead aside before the link: the LiveChip (BandChip). */
  headAside?: ReactNode;
  /** playStoreUrl(settings), for the house ad. */
  playUrl: string;
}) {
  const id = section.id;
  switch (layout.kind) {
    case 'none':
      return null;
    case 'breaking':
      return <BreakingBar items={section.items} className={s.band} />;
    case 'house-ad':
      return (
        <Container className={s.band}>
          <HouseAd title={section.title.trim() || HOUSE_AD_TITLE} playUrl={playUrl} />
        </Container>
      );
    case 'trending':
      return (
        <section
          aria-labelledby={`section-${id}`}
          className={cn('sv-band', s.band, s.paper)}
          data-type="trending"
        >
          <Container>
            <div className={s.sheet}>
              <RuleHead id={id} title={section.title} className={s.head} />
              <TrendingList items={section.items} columns />
            </div>
          </Container>
        </section>
      );
    default: {
      const featured = layout.role === 'featured';
      const aside = rail !== null && rail !== undefined && rail !== false;
      return (
        <section
          aria-labelledby={`section-${id}`}
          className={cn('sv-band', s.band)}
          data-type={section.type}
          data-slug={section.category?.slug}
        >
          <Container>
            {/* The band's white sheet on the mint ground (Emerald Terminal):
                the head, the stories and the paired modules in one card. */}
            <div className={s.sheet}>
              {featured ? (
                <h2 id={`section-${id}`} className="sr-only">
                  {section.title}
                </h2>
              ) : (
                <RuleHead
                  id={id}
                  title={section.title}
                  aside={headAside ?? undefined}
                  className={s.head}
                  {...headLink(section)}
                />
              )}
              <div
                className={cn('sv-band-grid', s.grid)}
                data-layout={layout.kind}
                data-aside={aside ? '' : undefined}
              >
                <div
                  className={cn('sv-band-main', s.main)}
                  data-phone-cap={layout.phoneCap ?? undefined}
                >
                  {layout.regions.map((r) => (
                    <Region key={r.slot} region={r} clock={layout.clock} />
                  ))}
                </div>
                {aside ? rail : null}
              </div>
            </div>
          </Container>
        </section>
      );
    }
  }
}

/**
 * Markets now as its own band (spec §5.9.3 row 1): only when the page has
 * neither a featured nor a Top stories section, after the first section.
 */
export function ModuleBand({ rail }: { rail: ReactNode }) {
  // The band's margin sits on the inner box, which hides (CSS) when the
  // module draws nothing, so no empty gap is left behind.
  return (
    <Container>
      <div className={cn(s.band, s.moduleBand)} data-layout="module-band">
        {rail}
      </div>
    </Container>
  );
}

/** One drawn section of the front, with its layout and its modules. */
export interface FrontBand {
  section: HomeSection;
  layout: FrontLayout;
  modules: FrontModule[];
  /** Markets now follows this section as its own band (spec §5.9.3 row 1). */
  moduleBandAfter: boolean;
}

/**
 * The front's plan (PURE): the sections that draw something, in API order,
 * each laid out by the chooser with its paired modules and the visual
 * de-duplication applied in page order. Only the first house ad is kept
 * (it holds the page's only Play badge). NewsFront draws it; the design
 * gallery prints it.
 */
export function planFront(
  sections: readonly HomeSection[],
  ctx: ModuleContext,
): { bands: FrontBand[]; assignment: ModuleAssignment; seen: string[] } {
  const shown = sections.filter(sectionRenders);
  const assignment = assignModules(shown, ctx);
  const seen = createSeen();
  const bands: FrontBand[] = [];
  let storyBands = 0;
  let houseAd = false;
  for (const section of shown) {
    const role = sectionRole(section);
    if (role === 'app_promo') {
      if (houseAd) continue;
      houseAd = true;
    }
    const modules = assignment.bySection[section.id] ?? [];
    const band = isStoryBand(role);
    const layout = chooseLayout(section, {
      aside: modules.length > 0,
      seen,
      priority: band && storyBands === 0,
    });
    if (band) storyBands += 1;
    seen.addAll(layout.pictures);
    bands.push({ section, layout, modules, moduleBandAfter: assignment.bandAfter === section.id });
  }
  return { bands, assignment, seen: seen.ids() };
}

/**
 * The whole front below the nameplate: every CMS section in API order,
 * keyed by id, laid out by the chooser, with its paired modules and the
 * visual de-duplication (planFront). Pure rendering of what the page
 * fetched.
 *
 * `railFor` and `chipFor` (the design gallery's stand-ins) replace the
 * real modules and LiveChips; the page leaves them out.
 */
export function NewsFront({
  sections,
  ctx,
  data,
  railFor,
  chipFor,
}: {
  sections: HomeSection[];
  ctx: ModuleContext;
  data: FrontData;
  railFor?: (modules: readonly FrontModule[], section: HomeSection | null) => ReactNode;
  chipFor?: (section: HomeSection) => ReactNode;
}) {
  const { bands } = planFront(sections, ctx);
  const rail = (modules: readonly FrontModule[], section: HomeSection | null): ReactNode => {
    if (!modules.length) return null;
    return railFor ? railFor(modules, section) : <BandRail modules={modules} data={data} />;
  };
  const out: ReactNode[] = [];
  for (const { section, layout, modules, moduleBandAfter } of bands) {
    const chip = chipKind(section)
      ? chipFor
        ? chipFor(section)
        : <BandChip section={section} data={data} />
      : null;
    out.push(
      <FrontSection
        key={section.id}
        section={section}
        layout={layout}
        rail={rail(modules, section)}
        headAside={chip}
        playUrl={data.playUrl}
      />,
    );
    if (moduleBandAfter) {
      out.push(
        <ModuleBand key={`${section.id}:markets-now`} rail={rail(['markets-now'], null)} />,
      );
    }
  }
  return <>{out}</>;
}

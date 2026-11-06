import { FactText, factValue } from '@/components/site-content/FactText';
import { RichInline } from '@/components/site-content/RichInline';
import { ABOUT_SECTION_IDS } from '@/content/site/about';
import type { AboutContent, AboutFounder, LiveValues } from '@/content/site/types';
import type { SiteSettings } from '@/lib/settings';
import { resolveLiveValues } from '@/lib/site-content/tokens';
import { cn } from '@/lib/utils';
import { AboutIndex } from '../AboutIndex';
import { BandHead } from '../BandHead';
import { CompanyFile } from '../CompanyFile';
import { monthYear } from '../screens';
import s from '../site.module.css';

/** Interface strings (addendum §1.2). */
const INDEX_LABEL = 'On this page';
const TIMELINE_LABEL = 'Timeline';

/**
 * /about (spec §5.3, copy §9.5.3): a pure view of the page's content (W7
 * addendum §11.3), rendered by the route and by the preview. Server
 * component; no client JS of its own.
 *
 * Emerald Terminal (6 Nov 2026): the emerald BandHead, then on mint: the
 * sticky index card in cols 1–3, the text in cols 4–9 (the principles as
 * white cards), "What we're not" on an emerald card in cols 4–10 and the
 * company's fact file on a white card, sticky in cols 10–12. Tablets: the
 * index is a row of chips under the band, the text sits in cols 1–6 and the
 * fact file follows the first part. Phones: one column, the fact file after
 * "Why it exists". Every company fact comes from the settings and the
 * About content (no figures of our own). The founder letter and the
 * timeline render only when the owner has supplied them.
 */
export function AboutView({
  content,
  settings,
}: {
  content: AboutContent;
  settings: SiteSettings;
  data?: Record<string, never>;
}) {
  const values = resolveLiveValues(settings);
  const ids = ABOUT_SECTION_IDS;
  const links = [
    { id: ids.why, label: content.why.title },
    { id: ids.principles, label: content.principles.title },
    { id: ids.notUs, label: content.notUs.title },
    { id: ids.company, label: content.company.caption },
    { id: ids.writeToUs, label: content.writeToUs.title },
  ];
  const principles = content.principles.items.filter((p) => factValue(p.title) !== null && factValue(p.body) !== null);
  const timeline = content.timeline.flatMap((t) => {
    const when = monthYear(t.month);
    return when && t.event.trim() ? [{ id: t.id, when, event: t.event.trim() }] : [];
  });
  const h2 = s.h2Fixed;

  return (
    <>
      <BandHead title={content.head.title} lead={content.head.summary} />
      <div className={s.aboutIndexRow}>
        <div className="sv-container">
          <AboutIndex variant="row" label={INDEX_LABEL} links={links} />
        </div>
      </div>
      <div className={s.section}>
        <div className="sv-container">
          <div className={s.aboutGrid} data-timeline={timeline.length ? '' : undefined}>
            <div className={s.aboutIndex}>
              <AboutIndex variant="list" label={INDEX_LABEL} links={links} />
            </div>

            <section id={ids.why} aria-labelledby={`${ids.why}-title`} className={cn(s.aboutWhy, s.aboutBody)}>
              <h2 id={`${ids.why}-title`} className={h2}>
                {content.why.title}
              </h2>
              <div className={cn(s.prose, s.measure, 'mt-4')}>
                {content.why.paragraphs.map((p, i) => (
                  <FactText key={i} as="p" field={p} values={values} className="t-body text-fg" linkClassName={s.link} />
                ))}
              </div>
              <Founder founder={content.founder} values={values} />
            </section>

            <section
              id={ids.company}
              aria-label={content.company.caption}
              className={cn(s.aboutCompany, s.aboutWide, s.card, s.companyCard)}
            >
              <CompanyFile
                caption={content.company.caption}
                product={content.company.product}
                basedIn={content.company.basedIn}
                settings={settings}
              />
            </section>

            <section
              id={ids.principles}
              aria-labelledby={`${ids.principles}-title`}
              className={cn(s.aboutHow, s.aboutBody)}
            >
              <h2 id={`${ids.principles}-title`} className={h2}>
                {content.principles.title}
              </h2>
              <div className={cn(s.principles, s.measure)}>
                {principles.map((p) => (
                  <div key={p.id} className={s.principle}>
                    <FactText as="h3" field={p.title} values={values} className={s.h3} />
                    <FactText as="p" field={p.body} values={values} className="t-body text-fg-2" linkClassName={s.link} />
                  </div>
                ))}
              </div>
            </section>

            <section id={ids.notUs} aria-labelledby={`${ids.notUs}-title`} className={cn(s.aboutNotUs, s.aboutBody)}>
              <div className={cn('sv-emerald', s.emerald, s.notUs)}>
                <h2 id={`${ids.notUs}-title`} className={h2}>
                  {content.notUs.title}
                </h2>
                {/* Legal-locked, verbatim (spec §9.8). */}
                <p className="t-body mt-3 mb-0 text-fg" data-verbatim="">
                  <RichInline value={content.notUs.body} values={values} linkClassName={s.link} />
                </p>
              </div>
            </section>

            {timeline.length ? (
              <section aria-label={TIMELINE_LABEL} className={cn(s.aboutTimeline, s.aboutBody)}>
                <ol className={cn(s.timeline, 't-body text-fg-2')}>
                  {timeline.map((t) => (
                    <li key={t.id}>
                      <strong className="text-fg">{t.when}:</strong> {t.event}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section
              id={ids.writeToUs}
              aria-labelledby={`${ids.writeToUs}-title`}
              className={cn(s.aboutWrite, s.aboutBody, s.card, s.writeCard)}
            >
              <h2 id={`${ids.writeToUs}-title`} className={s.h3}>
                {content.writeToUs.title}
              </h2>
              <p className="t-body mt-2 mb-0 text-fg-2">
                <RichInline value={content.writeToUs.text} values={values} linkClassName={s.link} />
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The optional founder letter (spec §5.3) on a white card: first person,
 * signed with a 72 px photo, the name and the role. All or nothing:
 * it renders only with a letter and a name, and never with placeholder
 * people.
 */
function Founder({ founder, values }: { founder: AboutFounder | null; values: LiveValues }) {
  if (!founder) return null;
  const letter = Array.isArray(founder.letter) ? founder.letter.filter((p) => Array.isArray(p) && p.length) : [];
  const name = (founder.name ?? '').trim();
  if (!letter.length || !name) return null;
  const photo = founder.photo;
  return (
    <figure className={cn(s.founder, s.measure, 'm-0 mt-8')}>
      <blockquote className="t-prose m-0 text-fg">
        {letter.map((p, i) => (
          <p key={i}>
            <RichInline value={p} values={values} linkClassName={s.link} />
          </p>
        ))}
      </blockquote>
      <figcaption className={s.founderSign}>
        {photo?.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a resolved media variant (w480) with its own srcset
          <img
            src={photo.src}
            srcSet={photo.srcSet}
            sizes="72px"
            width={photo.width ?? 72}
            height={photo.height ?? 72}
            alt={photo.alt}
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <span className="t-small text-fg-2">
          <strong className="block text-fg">{name}</strong>
          {(founder.role ?? '').trim()}
        </span>
      </figcaption>
    </figure>
  );
}

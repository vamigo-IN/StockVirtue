import { factText, factValue } from '@/components/site-content/FactText';
import { RichInline } from '@/components/site-content/RichInline';
import { safeId } from '@/content/site/reserved-ids';
import type { FaqContent, LiveValues } from '@/content/site/types';
import type { SiteSettings } from '@/lib/settings';
import { resolveLiveValues } from '@/lib/site-content/tokens';
import { cn } from '@/lib/utils';
import { JsonLdScript } from '@/news/seo';
import { BandHead } from '../BandHead';
import { FaqGroups, type FaqShownGroup } from '../FaqGroups';
import s from '../site.module.css';

/** Interface strings (addendum §1.2). */
const INDEX_LABEL = 'On this page';

/**
 * The questions as they render: answers whose fact falls back to nothing are
 * dropped, then questions with no answer left, then empty groups. The page
 * and its FAQPage JSON-LD both use this, so they always hold the same
 * questions and words (visible text = schema text).
 */
export function shownFaqGroups(content: FaqContent): FaqShownGroup[] {
  return content.groups
    .map((g) => ({
      id: g.id,
      title: g.title,
      items: g.items
        .map((it) => ({ id: it.id, question: it.question, answers: it.answer.filter((a) => factValue(a) !== null) }))
        .filter((it) => it.answers.length > 0),
    }))
    .filter((g) => g.items.length > 0);
}

/** The FAQPage structured data, built from the same groups the page shows. */
export function faqJsonLd(groups: FaqShownGroup[], values: LiveValues) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((g) =>
      g.items.map((it) => ({
        '@type': 'Question',
        name: it.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: it.answers
            .map((a) => factText(a, values))
            .filter((t): t is string => Boolean(t))
            .join('\n\n'),
        },
      })),
    ),
  };
}

/**
 * /faq (spec §5.4, copy §9.5.4): a pure view of the page's content (W7
 * addendum §11.3). Emerald Terminal (6 Nov 2026): the emerald BandHead, then
 * the groups, each an H2 over its questions as white <details> cards.
 * Desktop: a sticky index card in cols 1–3 with "Didn't find it? Write to
 * us" under it, and the groups in cols 4–11. Tablets: the index is a row of
 * 44 px chips. Phones: the questions come first, and "Didn't find it?" is a
 * card after the last group. The FAQPage JSON-LD is rendered only through
 * JsonLdScript (addendum §3.5). Server component; the "#" link buttons are
 * its only client code.
 */
export function FaqView({
  content,
  settings,
}: {
  content: FaqContent;
  settings: SiteSettings;
  data?: Record<string, never>;
}) {
  const values = resolveLiveValues(settings);
  const groups = shownFaqGroups(content);
  const index = groups.flatMap((g) => {
    const id = safeId(g.id);
    return id ? [{ id, title: g.title }] : [];
  });

  return (
    <>
      <JsonLdScript data={faqJsonLd(groups, values)} />
      <BandHead title={content.head.title} lead={content.head.summary} />
      {index.length ? (
        <div className={s.faqIndexRow}>
          <div className="sv-container">
            <nav aria-label={INDEX_LABEL}>
              <ul className={s.anchorRow}>
                {index.map((g) => (
                  <li key={g.id}>
                    <a href={`#${g.id}`}>{g.title}</a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
      <div className={s.section}>
        <div className="sv-container">
          <div className={s.faqGrid}>
            <div className={s.faqIndex}>
              <div className={s.indexCard}>
                {index.length ? (
                  <nav aria-labelledby="faq-index-label">
                    <p id="faq-index-label" className={s.indexLabel}>
                      {INDEX_LABEL}
                    </p>
                    <ul className={s.anchorList}>
                      {index.map((g) => (
                        <li key={g.id}>
                          <a href={`#${g.id}`}>{g.title}</a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                ) : null}
                <p className={cn('t-body text-fg-2', index.length ? s.notFound : 'm-0')}>
                  <RichInline value={content.notFound} values={values} linkClassName={s.link} />
                </p>
              </div>
            </div>
            <div className={s.faqMain}>
              <FaqGroups groups={groups} values={values} linkClassName={s.link} />
              <div className={cn(s.card, s.faqCard)}>
                <p className="t-body m-0 text-fg">
                  <RichInline value={content.notFound} values={values} linkClassName={s.link} />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

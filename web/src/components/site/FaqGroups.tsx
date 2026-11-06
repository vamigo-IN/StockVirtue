import { FactText } from '@/components/site-content/FactText';
import { safeId } from '@/content/site/reserved-ids';
import type { FactInline, LiveValues } from '@/content/site/types';
import { FaqLinkButton } from './FaqLinkButton';
import s from './site.module.css';

/** A FAQ item ready to show: its answers already filtered to the ones that render. */
export type FaqShownItem = { id: string; question: string; answers: FactInline[] };
export type FaqShownGroup = { id: string; title: string; items: FaqShownItem[] };

/**
 * The FAQ's groups (spec §5.4; Emerald Terminal, 6 Nov 2026): an H2 per
 * group and a native <details id="{slug}"> per question as a white card,
 * its <summary> a 64 px row with a ChevronDown in a mint tile that turns
 * 180° over 200 ms (instant under reduced motion, by the global switch).
 * Answers are `body` at 62ch. Each row has the "#" link button. Content ids go through safeId(), so a
 * reserved or malformed id renders no id (and no link button) rather than
 * colliding with the site's own. Server component.
 */
export function FaqGroups({
  groups,
  values,
  linkClassName,
}: {
  groups: FaqShownGroup[];
  values: LiveValues;
  linkClassName?: string;
}) {
  return (
    <div className={s.faqGroups}>
      {groups.map((g) => {
        const gid = safeId(g.id);
        return (
          <section key={g.id} id={gid} aria-labelledby={gid ? `${gid}-title` : undefined} className={s.faqGroup}>
            <h2 id={gid ? `${gid}-title` : undefined} className={s.h2Fixed}>
              {g.title}
            </h2>
            <ul className={s.qaList}>
              {g.items.map((it) => {
                const qid = safeId(it.id);
                return (
                  <li key={it.id} className={s.faqItem}>
                    <QaDetails id={qid} question={it.question} answers={it.answers} values={values} linkClassName={linkClassName} />
                    {qid ? <FaqLinkButton id={qid} question={it.question} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * One question as a native <details> row. /download's "Before you install"
 * uses it too, without an id (the FAQ's ids belong to /faq).
 */
export function QaDetails({
  id,
  question,
  answers,
  values,
  linkClassName,
}: {
  id?: string;
  question: string;
  answers: FactInline[];
  values: LiveValues;
  linkClassName?: string;
}) {
  return (
    <details id={id} className={s.qa}>
      <summary className="text-fg">
        <span>{question}</span>
        <svg
          className={s.qaChev}
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={s.qaBody}>
        {answers.map((a, i) => (
          <FactText key={i} as="p" field={a} values={values} className="t-body" linkClassName={linkClassName} />
        ))}
      </div>
    </details>
  );
}

import { Fragment } from 'react';
import { PhoneDisclosure } from '@/components/public/PhoneDisclosure';
import { GLOSSARY, glossaryId, glossaryLabel } from '@/content/glossary';
import { cn } from '@/lib/utils';
import h from './hubs.module.css';

/** Interface strings (spec §9.6.2). */
const TITLE = 'Glossary';
const INTRO =
  'Plain meanings for the terms you’ll meet in our stories and in the app, grouped as the app groups them.';

/**
 * The Learn glossary (spec §4.9, §5.10.4, §9.6.3): `<section
 * aria-labelledby="glossary">` with the h2 "Glossary" (`rule-head`), its
 * one-line intro, then the app's five groups ("Order basics", "F&O",
 * "Greeks", "Chart indicators", "Money & corporate") as h3s, each a `<dl>`
 * (`dt` in `title` 17/22, `dd` in `body`). Below 768 each group is a closed
 * PhoneDisclosure variant="head"; from 768 they are open, in two CSS
 * columns. Every `dt` has the term's slug as its id, so stories can link
 * to /news/education#stop-loss. No prices. Server component.
 */
export function Glossary({ className }: { className?: string }) {
  return (
    <section aria-labelledby="glossary" className={cn(h.glossary, className)}>
      <div className="sv-rulehead">
        <h2 id="glossary" className="t-rule-head text-fg">
          {TITLE}
        </h2>
      </div>
      <p className={cn(h.intro, 't-body text-fg-2')}>{INTRO}</p>
      <div className={h.groups}>
        {GLOSSARY.map((group) => (
          <PhoneDisclosure
            key={group.heading}
            variant="head"
            className={h.group}
            summary={<h3 className={cn(h.groupHead, 't-rail-title text-fg')}>{group.heading}</h3>}
          >
            <dl className={h.terms}>
              {group.terms.map((t) => (
                <Fragment key={t.term}>
                  <dt id={glossaryId(t)} className="t-title text-[17px] leading-[22px] text-fg">
                    {glossaryLabel(t)}
                  </dt>
                  <dd className="t-body text-fg-2">{t.definition}</dd>
                </Fragment>
              ))}
            </dl>
          </PhoneDisclosure>
        ))}
      </div>
    </section>
  );
}

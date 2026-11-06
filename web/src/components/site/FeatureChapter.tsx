import { Children, type ReactNode } from 'react';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { PhoneDisclosure } from '@/components/public/PhoneDisclosure';
import { FactText, factValue } from '@/components/site-content/FactText';
import type { Screen } from '@/content/screens';
import type { FeaturesChapter, FeaturesItem, LiveValues } from '@/content/site/types';
import { cn } from '@/lib/utils';
import { Eyebrow } from './BandHead';
import { screenCaption } from './screens';
import s from './site.module.css';

/** A chapter's two-digit number, "01" to "06" (decoration: the mono eyebrow and the jump chips). */
export function chapterIndex(i: number): string {
  return String(i + 1).padStart(2, '0');
}

/**
 * One /features chapter (spec §5.2, copy §9.5.2): the H2, the intro and the
 * items, most important first, with the chapter's screen in a sticky
 * DeviceFrame when there is one. Server component.
 *
 * Emerald Terminal (6 Nov 2026): a mono number above the H2 (the eyebrow,
 * "01" to "06"), the intro beside the H2 from 1024 px (text-only
 * chapters), the items as white cards (two columns from 768 px; on a white
 * ground the cards are mint), and each extra (the Nifty 50 chart, a
 * diagram) on its own white card.
 *
 * - Without a screen the chapter spans the full width with no frame and no
 *   caption: the complete text-only layout (owner decision 6).
 * - Phones show the first two items; the rest sit in a closed
 *   `PhoneDisclosure variant="tail"`, "Show {n} more about {tailName}",
 *   which opens before paint from 768 px and then reads as the same list.
 * - An item whose body falls back to nothing is left out, title and all
 *   (F36's "drop the item").
 * - `children` are the chapter's extras under the items: the Nifty 50 chart
 *   (#prices) or the diagrams (#orders, #fno).
 *
 * `id` is the chapter's code id (prices, orders, fno, portfolio, learning,
 * account): the page passes it from FEATURES_CHAPTER_IDS, never from
 * content, because other pages link to these anchors.
 */
export function FeatureChapter({
  id,
  index,
  chapter,
  screen,
  ground,
  values,
  children,
}: {
  id: string;
  /** The chapter's place in the fixed order (0–5), for its mono number. */
  index: number;
  chapter: FeaturesChapter;
  screen: Screen | null;
  ground: 'paper' | 'white';
  values: LiveValues;
  children?: ReactNode;
}) {
  const items = chapter.items.filter((it) => factValue(it.body) !== null);
  const first = items.slice(0, 2);
  const rest = items.slice(2);
  const titleId = `${id}-title`;
  const extras = Children.toArray(children).filter(Boolean);
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn(s.section, ground === 'white' && s.white)}
      data-chapter={id}
    >
      <div className="sv-container">
        <div className={s.chapterGrid} data-screen={screen ? '' : undefined}>
          {screen ? (
            <div className={s.frame}>
              <DeviceFrame screen={screen} size="lg" caption={screenCaption(chapter.screenWhat, screen)} />
            </div>
          ) : null}
          <div className={s.chapterBody}>
            <div className={s.chapterHead}>
              <div>
                <Eyebrow index={chapterIndex(index)} />
                <h2 id={titleId} className={cn(s.h2, s.chapterTitle)}>
                  {chapter.title}
                </h2>
              </div>
              <FactText as="p" field={chapter.intro} values={values} className={cn('t-lead text-fg-2', s.chapterIntro)} />
            </div>
            {first.length ? (
              <ul className={s.items}>
                {first.map((it) => (
                  <Item key={it.id} item={it} values={values} />
                ))}
              </ul>
            ) : null}
            {rest.length ? (
              <PhoneDisclosure
                variant="tail"
                className={s.tail}
                summary={`Show ${rest.length} more about ${chapter.tailName}`}
              >
                <ul className={s.items}>
                  {rest.map((it) => (
                    <Item key={it.id} item={it} values={values} />
                  ))}
                </ul>
              </PhoneDisclosure>
            ) : null}
          </div>
          {extras.length ? (
            <div className={s.chapterExtras}>
              <div className={s.extras}>
                {extras.map((x, i) => (
                  <div key={i} className={cn(s.card, s.extraCard)}>
                    {x}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Item({ item, values }: { item: FeaturesItem; values: LiveValues }) {
  return (
    <li className={s.itemCard}>
      <h3 className={s.itemTitle}>{item.title}</h3>
      <FactText as="p" field={item.body} values={values} className="t-body text-fg-2" />
    </li>
  );
}

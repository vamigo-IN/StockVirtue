import { PlayBadge, PlayTrademark } from '@/components/public/PlayBadge';
import { QrCode } from '@/components/public/QrCode';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { FactText, factText, factValue } from '@/components/site-content/FactText';
import { withFacts } from '@/content/app';
import type { DownloadContent, FaqContent } from '@/content/site/types';
import { playStoreUrl } from '@/lib/metadata';
import type { SiteSettings } from '@/lib/settings';
import { resolveLiveValues } from '@/lib/site-content/tokens';
import { cn } from '@/lib/utils';
import { BandHead } from '../BandHead';
import { DownloadFacts } from '../DownloadFacts';
import { QaDetails } from '../FaqGroups';
import { FirstFiveMinutes } from '../FirstFiveMinutes';
import { pickScreen, screenCaption } from '../screens';
import s from '../site.module.css';

/** What /download fetches besides its content and the settings. */
export type DownloadData = {
  /** The FAQ (getPageContent('faq', FAQ_DEFAULT)): "Before you install" shows its answers, word for word. */
  faq: FaqContent;
};

/** Interface string (addendum §1.2): the panel screen's caption. */
const HOME_SCREEN_WHAT = 'The StockVirtue home screen';

/**
 * The iPhone line under the badge (Emerald Terminal brief, 6 Nov 2026), the
 * F15 sentence as "What it won't do" words it: shown only once F15 is
 * confirmed (it is 'verify' today, so the line is left out, as everywhere
 * else on the site).
 */
const IPHONE_LINE = withFacts(['F15'], 'An iPhone version is planned, with no date yet.', null);

/**
 * /download (spec §5.5, copy §9.5.5): a pure view of the page's content (W7
 * addendum §11.3). Server component; no client JS of its own.
 *
 * Emerald Terminal (6 Nov 2026): the emerald BandHead holds the H1, the
 * lead, the Play badge with its trademark line (and the iPhone line once
 * F15 is confirmed) and, from 768 px, the white QR card beside them (the
 * QR, then the home screen when supplied); phones have no QR. Then, on
 * mint: the facts on a white card, "Your first five minutes" as three
 * cards, "Before you install" (the FAQ's answers, with no ids) as question
 * cards, and the iPhone note. Without screenshots the page is text only
 * and complete.
 */
export function DownloadView({
  content,
  settings,
  data,
}: {
  content: DownloadContent;
  settings: SiteSettings;
  data: DownloadData;
}) {
  const values = resolveLiveValues(settings);
  const playUrl = playStoreUrl(settings);
  const panelScreen = pickScreen(content.panelScreen, 'home');
  const faqItems = data.faq.groups.flatMap((g) => g.items);
  const before = content.beforeInstall.faqIds.flatMap((id) => {
    const it = faqItems.find((q) => q.id === id);
    if (!it) return []; // a missing id is skipped (addendum §3.6)
    const answers = it.answer.filter((a) => factValue(a) !== null);
    return answers.length ? [{ key: it.id, question: it.question, answers }] : [];
  });

  return (
    <>
      <BandHead
        title={content.head.title}
        lead={factText(content.head.lead, values)}
        asideFrom="md"
        aside={
          <div className={cn(s.onLight, s.card, s.dlPanel)} data-qr-only={panelScreen ? undefined : ''}>
            <div className={s.dlQr}>
              <QrCode url={playUrl} size={200} />
            </div>
            {panelScreen ? (
              <DeviceFrame screen={panelScreen} size="md" caption={screenCaption(HOME_SCREEN_WHAT, panelScreen)} />
            ) : null}
          </div>
        }
      >
        <div className={s.dlBadge}>
          <PlayBadge href={playUrl} size="lg" />
          <PlayTrademark />
          {/* F15 */}
          {IPHONE_LINE ? <p className={s.dlIphone}>{IPHONE_LINE}</p> : null}
        </div>
      </BandHead>

      <div className={s.section}>
        <div className="sv-container">
          <div className={s.dlGrid}>
            <div className={s.dlFactsCol}>
              <div className={cn(s.card, s.dlFacts)}>
                <DownloadFacts
                  minAndroid={content.play.minAndroid}
                  sizeMb={content.play.sizeMb}
                  label={content.head.title}
                />
              </div>
            </div>

            {before.length ? (
              <section aria-labelledby="before-install-title" className={cn(s.before, s.dlBefore)}>
                <h2 id="before-install-title" className={s.h2Fixed}>
                  {content.beforeInstall.title}
                </h2>
                <ul className={s.qaList}>
                  {before.map((q) => (
                    <li key={q.key}>
                      <QaDetails question={q.question} answers={q.answers} values={values} linkClassName={s.link} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div>
              <FirstFiveMinutes title={content.firstFive.title} items={content.firstFive.items} values={values} />
              <FactText
                as="p"
                field={content.iphoneNote}
                values={values}
                className={cn('t-body text-fg-2', s.note)}
                linkClassName={s.link}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

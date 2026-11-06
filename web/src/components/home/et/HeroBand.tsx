import { clsx } from 'clsx';
import { DeviceFrame } from '@/components/public/DeviceFrame';
import { PlayBadge } from '@/components/public/PlayBadge';
import { FactText, factText } from '@/components/site-content/FactText';
import type { Screen } from '@/content/screens';
import type { HomeContent } from '@/content/site/types';
import { fmtCaptureDate } from '../screens';
import { Desk, DeskFloat } from './Desk';
import type { RealDesk } from './desk-model';
import { Shield } from './parts';
import e from './et.module.css';

/** The H1's id: the hero section's accessible name. */
export const HERO_TITLE_ID = 'home-hero-title';

/**
 * The words after the H1's last comma are underlined in neon (design I:
 * "India's stock market, <u>without the risk.</u>"). A title without a
 * comma is drawn plain.
 */
function TitleWords({ title }: { title: string }) {
  const at = title.lastIndexOf(', ');
  if (at < 0 || at + 2 >= title.length) return <>{title}</>;
  return (
    <>
      {title.slice(0, at + 2)}
      <span className={e.h1Mark}>{title.slice(at + 2)}</span>
    </>
  );
}

/**
 * The home hero (Emerald Terminal, 6 Nov 2026): the emerald band, 40 px
 * bottom corners, its top fading from the header's solid #01261A. The text
 * column (label, H1, lead, the Play badge, "See how it works" to
 * #inside-the-app, the small print), and on the right the desk on the
 * terminal ground (real with the gate on and data present, else a sample
 * screen). With the gate off and an owner's home screenshot (content first,
 * SCREENS second), the screenshot shows in place of the sample desk.
 * Phones: the desk stacks under the text. Server component.
 */
export function HeroBand({
  content,
  playUrl,
  desk,
  homeScreen,
}: {
  content: HomeContent['hero'];
  playUrl: string;
  desk: RealDesk | null;
  /** The gate-off screenshot, only when there is no real desk. */
  homeScreen: Screen | null;
}) {
  const small = factText(content.smallPrint);
  return (
    <section className={clsx('sv-emerald', e.hero)} aria-labelledby={HERO_TITLE_ID} data-home-hero="">
      <div className={e.heroLines} aria-hidden="true" />
      <div className={clsx('sv-container', e.heroInner)}>
        <div className={e.heroText}>
          {content.eyebrow ? <p className={e.eyebrow}>{content.eyebrow}</p> : null}
          <h1 id={HERO_TITLE_ID} className={e.h1}>
            <TitleWords title={content.title} />
          </h1>
          <FactText as="p" field={content.lead} className={e.lead} />
          <div className={e.ctas}>
            <PlayBadge href={playUrl} size="lg" />
            {/* The target is fixed (addendum §3.2): "How a trade works". */}
            <a href="#inside-the-app" className={e.ghost}>
              {/* The old seed ended in "↓"; the button draws its own arrow. */}
              {content.howLink.replace(/\s*[↓⬇]\s*$/u, '')}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </a>
          </div>
          {small ? (
            <p className={e.small}>
              <Shield />
              <span>{small}</span>
            </p>
          ) : null}
        </div>
        <div className={e.deskWrap}>
          {!desk && homeScreen ? (
            <div className={e.screenWrap}>
              <DeviceFrame
                screen={homeScreen}
                size="lg"
                // "The StockVirtue home screen, captured on {date}. Prices on it are from that day." (spec §9.5.1)
                caption={`The StockVirtue home screen, captured on ${fmtCaptureDate(homeScreen.captured)}. Prices on it are from that day.`}
              />
            </div>
          ) : (
            <>
              <Desk real={desk} />
              <DeskFloat real={desk} />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

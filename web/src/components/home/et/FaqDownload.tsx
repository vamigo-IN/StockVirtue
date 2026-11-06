import { clsx } from 'clsx';
import { PlayBadge, PlayTrademark } from '@/components/public/PlayBadge';
import { QrCode } from '@/components/public/QrCode';
import { WontDo } from '@/components/public/WontDo';
import { FactText, factText } from '@/components/site-content/FactText';
import type { HomeContent, WontDoContent } from '@/content/site/types';
import type { DataRight } from '@/market/types';
import { OurPrices } from '../OurPrices';
import { SectionHead } from './parts';
import e from './et.module.css';

const FAQ_TITLE_ID = 'home-faq-title';
const GET_TITLE_ID = 'home-final-title';

/**
 * Questions (Emerald Terminal): content.answers' questions as `<details>`
 * (the first one open), beside "What it won't do" (the shared `wont-do`
 * item, compact) and "How to read a price on this site" (`#prices`, which
 * every Stamp's "How to read our prices" links to; shown under every
 * licence and with the gate off). A question whose answer's facts aren't
 * confirmed drops out. Server component.
 */
export function Faq({
  content,
  wontDo,
  right,
  delayMinutes,
  attribution,
}: {
  content: HomeContent['answers'];
  wontDo: WontDoContent;
  right: DataRight | null;
  delayMinutes: number | null;
  attribution: string | null;
}) {
  const items = content.items
    .map((q) => ({ q, answer: factText(q.answer) }))
    .filter((x): x is { q: (typeof content.items)[number]; answer: string } => !!x.answer);
  return (
    <section className={clsx(e.section, e.mint)} aria-labelledby={FAQ_TITLE_ID}>
      <div className="sv-container">
        <SectionHead id={FAQ_TITLE_ID} label={content.label} title={content.title} />
        <div className={e.faq}>
          <div className={e.questions}>
            {items.map(({ q, answer }, i) => (
              <details key={q.id} className={e.qa} open={i === 0}>
                <summary>{q.question}</summary>
                <p className={e.answer}>{answer}</p>
              </details>
            ))}
          </div>
          <div className={e.faqAside}>
            <WontDo headingLevel="h3" compact content={wontDo} />
            <OurPrices
              title={content.pricesTitle}
              right={right}
              delayMinutes={delayMinutes}
              attribution={attribution}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The download band (Emerald Terminal): the emerald band with 40 px corners,
 * its lower half on the footer's colour; content.finalCta's heading and
 * line, the Google Play badge and the trademark line (once per page, under
 * the last badge), and from 768 px the QR code on a white card. Server
 * component (QrCode draws its SVG at render time).
 */
export function DownloadBand({ content, playUrl }: { content: HomeContent['finalCta']; playUrl: string }) {
  const title = factText(content.title);
  return (
    <section className={e.getSection} aria-labelledby={title ? GET_TITLE_ID : undefined}>
      <div className={clsx('sv-emerald', e.getBand)}>
        <div className={clsx('sv-container', e.getInner)}>
          <div>
            {title ? (
              <h2 id={GET_TITLE_ID} className={e.getTitle}>
                {title}
              </h2>
            ) : null}
            <FactText as="p" field={content.line} className={e.getLine} />
            <div className={e.getBadge}>
              <PlayBadge href={playUrl} size="lg" />
            </div>
            <div className={e.trademark}>
              <PlayTrademark />
            </div>
          </div>
          <div className={e.qr}>
            <QrCode url={playUrl} size={176} />
          </div>
        </div>
      </div>
    </section>
  );
}

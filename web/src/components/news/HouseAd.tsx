import { PlayBadge, PlayTrademark } from '@/components/public/PlayBadge';
import { QrCode } from '@/components/public/QrCode';
import { withFacts } from '@/content/app';
import { cn } from '@/lib/utils';

/** The visible label and the aside's name (spec §9.6.1). */
const LABEL = 'From StockVirtue';

/**
 * The body line (spec §9.6.1), word for word. It describes the app only:
 * never a story, a stock or "the stories you read". Dropped (the panel
 * still works) if any of its facts goes back to 'verify'.
 */
// F35, F1, F22
const BODY = withFacts(
  ['F35', 'F1', 'F22'],
  'Practise trading at real NSE, BSE and MCX prices with ₹10 lakh of virtual money, free on Android.',
  null,
);

/**
 * The house ad (spec §4.9, §9.6.1): the CMS `app_promo` section on /news.
 * SERVER component (the QR is drawn on the server).
 *
 * - `<aside aria-label="From StockVirtue">`, a full-width band on paper
 *   with a 1 px line and radius 12. Put it inside a Container, outside any
 *   `<section>` (spec §5.9.1).
 * - Inside: the visible "From StockVirtue" label, the text wordmark, the
 *   CMS title as its `<h2>` (stage-3 at 88% width), the body line, the
 *   official Play badge and the trademark line; from 1024 px a 120 px QR
 *   on the right with its caption.
 * - Below 768 px the label and the wordmark share one row (label left,
 *   wordmark right) and the badge sits 16 px under the body, not 24 (lead
 *   decision, 5 Nov 2026: the phone /news length).
 * - It holds the ONLY "Get it on Google Play" link on /news (R13; the
 *   header says "Get the app" and the footer has no badge).
 * The newsroom writes the title; the caller supplies "Practise with the
 * StockVirtue app" (spec §9.6.1) when it doesn't.
 */
export function HouseAd({
  title,
  playUrl,
  className,
}: {
  /** The CMS section title. */
  title: string;
  /** playStoreUrl(settings) from '@/lib/metadata'. */
  playUrl: string;
  className?: string;
}) {
  return (
    <aside
      aria-label={LABEL}
      className={cn(
        'rounded-[12px] border border-rule bg-paper p-6 text-fg md:p-8 lg:flex lg:items-center lg:justify-between lg:gap-12',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3 md:block">
          <p className="t-label text-fg-3">{LABEL}</p>
          <p className="t-title font-bold text-fg md:mt-3">StockVirtue</p>
        </div>
        <h2 className="t-stage-3 wdth-88 mt-1 text-fg">{title}</h2>
        {BODY ? (
          // F35, F1, F22
          <p className="t-body mt-3 max-w-[48em] text-fg-2">{BODY}</p>
        ) : null}
        {/* 16 px above on phones (24 from 768 px) and 12 below: Google's
            clear space is a quarter of the badge's height (13 px at 52). */}
        <div className="mt-4 flex md:mt-6">
          <PlayBadge href={playUrl} />
        </div>
        <PlayTrademark className="mt-3" />
      </div>
      <QrCode url={playUrl} size={120} className="hidden shrink-0 lg:inline-flex" />
    </aside>
  );
}

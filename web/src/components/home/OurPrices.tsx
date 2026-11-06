import { PhoneDisclosure } from '@/components/public/PhoneDisclosure';
import { LabelPill } from '@/components/widgets/frame';
import type { DataRight } from '@/market/types';
import m from './et/et.module.css';

/**
 * "How to read a price on this site" (spec §5.1.1, §9.5.1, §7.2):
 * `id="prices"` (the Stamp's "How to read our prices" link lands here), an
 * H2 in stage-3, three rows of a pill and one line, then the licence
 * sentence and the attribution. On phones a closed PhoneDisclosure whose
 * summary is the H2 (it opens before paint from 768 px). Shown under every
 * licence and with the gate off. Server component.
 *
 * The rows and sentences are interface strings (addendum §3.2: code, not
 * content), from spec §9.5.1 word for word. `right` comes from the snapshot,
 * else the ticker; with neither, the rows show without a sentence.
 */
export function OurPrices({
  title,
  right,
  delayMinutes,
  attribution,
}: {
  title: string;
  right: DataRight | null;
  delayMinutes: number | null;
  attribution: string | null;
}) {
  const delay = right === 'DELAYED' && delayMinutes ? delayMinutes : undefined;
  const licence = licenceSentence(right, delayMinutes);
  return (
    <div id="prices" className={m.prices}>
      <PhoneDisclosure
        variant="head"
        summary={<h2 className={`t-stage-3 ${m.pricesTitle}`}>{title}</h2>}
      >
        <ul className={m.priceRows}>
          <li>
            <LabelPill label="LIVE" />
            <span>The latest price from the exchange feed.</span>
          </li>
          <li>
            <LabelPill label="DELAYED" delay={delay} />
            <span>Shown late, or not updated for more than five minutes.</span>
          </li>
          <li>
            <LabelPill label="EOD" />
            <span>The last closing price.</span>
          </li>
        </ul>
        {licence ? (
          <p className={`t-body text-fg-2 ${m.licence}`}>
            {licence}
            {right !== 'OFF' && attribution
              ? ` Every price also shows the time it's from, in IST, and where it comes from: ${attribution}.`
              : null}
          </p>
        ) : null}
      </PhoneDisclosure>
    </div>
  );
}

/** The licence sentence for `snapshot.right` (spec §9.5.1). */
function licenceSentence(right: DataRight | null, delayMinutes: number | null): string | null {
  switch (right) {
    case 'LIVE':
      return 'Under our current data licence, the website shows live prices while a market is open, and closing prices after it shuts.';
    case 'DELAYED':
      // Never an assumed delay: without the payload's minutes, no sentence.
      return delayMinutes
        ? `Under our current data licence, the website shows prices ${delayMinutes} minutes late while a market is open, and closing prices after it shuts.`
        : null;
    case 'EOD':
      return 'Under our current data licence, the website shows closing prices only.';
    case 'OFF':
      return 'Prices are switched off on the website at the moment.';
    default:
      return null;
  }
}

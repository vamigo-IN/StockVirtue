import { FactFile } from '@/components/public/FactFile';
import { DOWNLOAD_FACT_ROWS } from '@/content/app';

const SIZE_RE = /^\d{1,4}(\.\d)?$/;

/**
 * /download's fact file (spec §5.5, §9.5.5; no caption): Price, Needs,
 * Size, Sign in, Age, iPhone. The fact rows are code (DOWNLOAD_FACT_ROWS,
 * each left out while its fact isn't confirmed: iPhone today); the two
 * Play-listing rows are owner inputs from the content, each left out while
 * empty, and sit right after Price. No PAN or Aadhaar row: that sentence is
 * in the KYC answer under "Before you install". Server component.
 */
export function DownloadFacts({
  minAndroid,
  sizeMb,
  label,
}: {
  /** "8.0" gives "Android 8.0 or later"; '' leaves the row out. */
  minAndroid: string;
  /** "24" gives "24 MB"; '' (or anything but a number) leaves the row out. */
  sizeMb: string;
  /** The table's accessible name (it has no caption). */
  label: string;
}) {
  const listing: { label: string; value: string }[] = [];
  const min = minAndroid.trim();
  const size = sizeMb.trim();
  if (min) listing.push({ label: 'Needs', value: `Android ${min} or later` });
  if (SIZE_RE.test(size)) listing.push({ label: 'Size', value: `${size} MB` });

  const rows: { label: string; value: string }[] = [];
  let placed = false;
  for (const r of DOWNLOAD_FACT_ROWS) {
    // Facts: Price F22, Sign in F14, Age F16, iPhone F15.
    rows.push({ label: r.label, value: r.value });
    if (!placed && r.facts.includes('F22')) {
      rows.push(...listing);
      placed = true;
    }
  }
  if (!placed) rows.unshift(...listing);
  if (!rows.length) return null;
  return <FactFile rows={rows} aria-label={label} />;
}

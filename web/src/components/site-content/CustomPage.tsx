import 'server-only';
import { LegalShell } from '@/components/public/legal/LegalShell';
import { BandHead } from '@/components/site/BandHead';
import styles from '@/components/public/legal/legal.module.css';
import type { LiveValues, SiteDoc } from '@/content/site/types';
import { legalUpdatedLabel } from '@/lib/site-content/format-date';
import { LegalDocument, countH2 } from './LegalDocument';

/**
 * The custom page template (W7 addendum §3.12): "Refund policy", "Careers"
 * and the like, at /<slug>.
 * - Two or more H2s: LegalShell (the band head, the contents list,
 *   .legal-body on its reading sheet).
 * - Fewer: the same BandHead and reading sheet, without the contents list.
 * One h1 per page: the title; the document's headings start at H2.
 * "Updated {date}" shows when `showUpdated` (the latest revision's date).
 * Server component; the body renders through LegalDocument ('simple'
 * profile: images allowed, no islands).
 */
export type CustomPageView = {
  title: string;
  intro: string;
  body: SiteDoc;
  showUpdated: boolean;
  revision: { dateShown?: string | null; dateLabel?: string | null } | null;
  liveValues: LiveValues;
};

export function CustomPage({ page }: { page: CustomPageView }) {
  const updated = page.showUpdated ? legalUpdatedLabel(page.revision, 'en') || undefined : undefined;
  const summary = page.intro.trim() || undefined;
  const body = <LegalDocument doc={page.body} values={page.liveValues} profile="simple" />;

  if (countH2(page.body) >= 2) {
    return (
      <LegalShell title={page.title} updated={updated} summary={summary}>
        {body}
      </LegalShell>
    );
  }

  return (
    <>
      <BandHead title={page.title} meta={updated ? `Updated ${updated}` : undefined} lead={summary} />
      <div className="sv-container">
        <div className={`sv-grid ${styles.grid}`}>
          <div className={`legal-body ${styles.body} ${styles.solo}`}>{body}</div>
        </div>
      </div>
    </>
  );
}

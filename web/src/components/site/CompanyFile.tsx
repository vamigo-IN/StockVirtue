import type { ReactNode } from 'react';
import { FactFile } from '@/components/public/FactFile';
import { privacyContact, type SiteSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import s from './site.module.css';

/**
 * About's fact file, "The company" (spec §5.3, §9.5.3): Company, Product,
 * Based in (only when supplied), Email, Grievance officer and Postal address
 * (only when set). The company, the officer and the address come from the
 * site settings (privacyContact), so they always match the privacy notice;
 * the product line and "Based in" from the About content. Server component.
 */
export function CompanyFile({
  caption,
  product,
  basedIn,
  settings,
}: {
  caption: string;
  product: string;
  basedIn: string;
  settings: SiteSettings;
}) {
  const c = privacyContact(settings);
  const email = settings.contactEmail || SITE.email;
  const rows: { label: string; value: ReactNode }[] = [
    { label: 'Company', value: c.legalName },
    { label: 'Product', value: product },
  ];
  if (basedIn.trim()) rows.push({ label: 'Based in', value: basedIn.trim() });
  rows.push({ label: 'Email', value: <a href={`mailto:${email}`}>{email}</a> });
  rows.push({
    label: 'Grievance officer',
    value: (
      <>
        {c.name ? `${c.name}, ` : null}
        <a href={`mailto:${c.email}`}>{c.email}</a>
      </>
    ),
  });
  const address = String(c.postalAddress ?? '').trim();
  if (address) rows.push({ label: 'Postal address', value: address });
  return <FactFile caption={caption} rows={rows} className={s.companyFile} />;
}

import Link from 'next/link';
import { factText } from '@/components/site-content/FactText';
import type { ContactContent, LiveValues } from '@/content/site/types';
import { privacyContact, type SiteSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';
import { CopyEmailButton } from './CopyEmailButton';
import s from './site.module.css';

/** Interface strings and the fixed target (addendum §1.2, §3.7). */
const EMAIL = 'Email';
const COMPANY = 'Company';
const REQUESTS_HREF = '/privacy/requests';

/** A bold run-in lead as spec §9.5.6 sets them: "Email:", "A mistake in a story?". */
function Lead({ children }: { children: string }) {
  const t = children.trim();
  return <strong className="text-fg">{/[?!:.]$/.test(t) ? `${t} ` : `${t}: `}</strong>;
}

/**
 * "Other ways" on /contact (spec §5.6, §9.5.6), with the bold run-in leads
 * of §9.5.6: the email address as text with "Copy email address"; "Your
 * data and privacy", a sentence and the link to the privacy requests page;
 * "A mistake in a story?"; the company's legal name and postal address
 * (from the settings, as the privacy notice states them). Server
 * component; the copy button is its only client code.
 */
export function ContactAside({
  aside,
  settings,
  values,
}: {
  aside: ContactContent['aside'];
  settings: SiteSettings;
  values: LiveValues;
}) {
  const email = settings.contactEmail || SITE.email;
  const company = privacyContact(settings);
  const address = String(company.postalAddress ?? '').trim();
  const privacyText = factText(aside.privacy.text, values);
  return (
    <aside aria-labelledby="other-ways-title" className={s.aside}>
      <h2 id="other-ways-title" className={s.h3}>
        {aside.title}
      </h2>
      <div className={cn(s.asideBlock, s.emailRow, 't-body text-fg-2')}>
        <span>
          <Lead>{EMAIL}</Lead>
          <span className="text-fg">{email}</span>
        </span>
        <CopyEmailButton email={email} />
      </div>
      <p className={cn(s.asideBlock, 't-body text-fg-2')}>
        <Lead>{aside.privacy.title}</Lead>
        {privacyText ? `${privacyText} ` : null}
        <Link href={REQUESTS_HREF} className={s.link}>
          {aside.privacy.linkLabel}
        </Link>
      </p>
      <p className={cn(s.asideBlock, 't-body text-fg-2')}>
        <Lead>{aside.mistake.title}</Lead>
        {aside.mistake.text}
      </p>
      <p className={cn(s.asideBlock, 't-body text-fg-2')}>
        <Lead>{COMPANY}</Lead>
        {company.legalName}
        {address ? ` · ${address}` : null}
      </p>
    </aside>
  );
}

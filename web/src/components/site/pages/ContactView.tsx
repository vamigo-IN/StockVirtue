import { ContactForm } from '@/app/(public)/(site)/contact/ContactForm';
import { RichInline } from '@/components/site-content/RichInline';
import type { ContactContent } from '@/content/site/types';
import type { SiteSettings } from '@/lib/settings';
import { resolveLiveValues } from '@/lib/site-content/tokens';
import { cn } from '@/lib/utils';
import { BandHead } from '../BandHead';
import { ContactAside } from '../ContactAside';
import s from '../site.module.css';

/**
 * /contact (spec §5.6, copy §9.5.6): a pure view of the page's content (W7
 * addendum §11.3). Emerald Terminal (6 Nov 2026): the emerald BandHead,
 * then the form on a white card (cols 1–7; 1–5 on tablets) with the
 * collection notice under the button, verbatim; "Other ways" on its own
 * card in cols 9–12 (6–8 on tablets); phones put the form first. The
 * form's labels, ids, button, honeypot and messages stay code
 * (contact/ContactForm.tsx, actions.ts). Server component; the form and the
 * copy button are its client code.
 */
export function ContactView({
  content,
  settings,
}: {
  content: ContactContent;
  settings: SiteSettings;
  data?: Record<string, never>;
}) {
  const values = resolveLiveValues(settings);
  return (
    <>
      <BandHead title={content.head.title} lead={content.head.summary} />
      <div className={s.section}>
        <div className="sv-container">
          <div className={s.contactGrid}>
            <div className={s.contactForm}>
              <div className={cn(s.card, s.formCard)}>
                <ContactForm />
                {/* Legal-locked, verbatim (spec §4.12). */}
                <p className={cn('t-small text-fg-2', s.notice)} data-verbatim="">
                  <RichInline value={content.form.collectionNotice} values={values} linkClassName={s.link} />
                </p>
              </div>
            </div>
            <div className={s.contactAside}>
              <ContactAside aside={content.aside} settings={settings} values={values} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

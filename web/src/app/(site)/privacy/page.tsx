import type { Metadata } from 'next';
import { LegalShell } from '@/components/motion/LegalShell';
import { CookieSettingsButton } from '@/components/consent/CookieSettingsButton';
import { optionalServices } from '@/lib/consent-services';
import { NOTICE_VERSION } from '@/lib/privacy-notice';
import { getSettings, privacyContact } from '@/lib/settings';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy notice',
  description: `What personal data ${SITE.name} collects, why, who it is shared with, how long it is kept, and your rights under India's Digital Personal Data Protection Act, 2023.`,
  alternates: {
    canonical: '/privacy',
    languages: { 'en-IN': '/privacy', 'hi-IN': '/privacy/hi' },
  },
};

const UPDATED = '3 November 2026';

/** What we collect, why, and what it lets you do (DPDP Rules 2025, rule 3). */
const DATA: { data: string; why: string; enables: string }[] = [
  {
    data: 'Your email address, mobile number and the name you choose; a password if you sign up with email (we store only a scrambled hash of it); your Google name and photo if you sign in with Google.',
    why: 'To create your account, sign you in, keep it secure and contact you about it (sign-in codes, password resets, account notices).',
    enables: 'Having a StockVirtue account on the app.',
  },
  {
    data: 'Your confirmation that you are 18 or older, the version of this notice you accepted and when, and your choices about optional purposes.',
    why: 'To show what you agreed to, and to keep the service for adults only.',
    enables: 'Opening and keeping your account.',
  },
  {
    data: 'Your virtual wallet, orders, positions, portfolio history, watchlists and price alerts.',
    why: 'To run the trading simulator for you. Everything uses virtual money.',
    enables: 'Practising trades, tracking your portfolio and getting alerts.',
  },
  {
    data: 'Your display name, rank and returns; the rooms you create or join.',
    why: 'To run leaderboards and rooms, where other users see your display name and returns. Use a nickname if you prefer.',
    enables: 'Competing with other traders.',
  },
  {
    data: 'Lessons and quizzes you complete, and badges you earn.',
    why: 'To track your learning progress and achievements.',
    enables: 'The academy and badges.',
  },
  {
    data: 'Stories you save, your news alert choices, and the stories you open (counted without identifying you).',
    why: 'To keep your saved stories, send the alerts you chose, and see which stories are read.',
    enables: 'The news reader and news alerts.',
  },
  {
    data: 'Your referral code, who invited you and how many people you invited.',
    why: 'To run invitations and their rewards.',
    enables: 'Referral rewards.',
  },
  {
    data: 'Your device’s push token and the notifications we send you.',
    why: 'To deliver notifications such as order fills, price alerts and news alerts.',
    enables: 'Notifications on your phone.',
  },
  {
    data: 'Your IP address, device and browser type, app version and the time of each request; sign-in attempts.',
    why: 'To keep the service secure, stop abuse and investigate incidents. The law asks us to keep these logs for a year.',
    enables: 'A safe service.',
  },
  {
    data: 'Messages you send us, privacy requests and complaints, and the nominee you name.',
    why: 'To answer you and to act on your rights.',
    enables: 'Support and your privacy rights.',
  },
  {
    data: 'Only if you agree: which screens and features of the app you use (Google Analytics for Firebase).',
    why: 'To understand what works and improve the app. Never your trades, and not linked to your name.',
    enables: 'A better app. Saying no changes nothing else.',
  },
  {
    data: 'Only if you agree, on this website: analytics and advertising cookies (see “Cookies” below).',
    why: 'To measure readership and to show ads that suit you.',
    enables: 'A free news site. Saying no changes nothing else.',
  },
];

const RETENTION: [string, string][] = [
  ['Your account and its activity', 'While your account is open.'],
  [
    'A deleted account',
    'It stops being used at once. A locked copy is kept for one year, as the DPDP Rules 2025 require, then erased for good.',
  ],
  [
    'An account nobody has used for 3 years',
    'Erased, after an email at least 48 hours before. Signing in keeps it.',
  ],
  ['Security logs (IP address, device, sign-ins)', 'One year, then deleted.'],
  ['Messages you send us', 'One year after our last reply.'],
  ['In-app notifications', 'One year.'],
  [
    'Push tokens',
    'Until you sign out or delete the account, or 270 days after your device was last seen.',
  ],
  ['Privacy requests and complaints', 'Three years after we answer them.'],
  [
    'Your cookie choice on this website',
    'Kept in your browser for 180 days; our record of it, two years.',
  ],
];

export default async function PrivacyPage() {
  const settings = await getSettings();
  const contact = privacyContact(settings);
  const services = optionalServices(settings.config);
  const officer = contact.name
    ? `${contact.name}, Grievance Officer`
    : 'Our Grievance Officer';
  return (
    <LegalShell
      title="Privacy notice"
      updated={UPDATED}
      summary={`What personal data ${SITE.name} collects, why, who sees it, how long we keep it, and your rights under India's Digital Personal Data Protection Act, 2023.`}
    >
      <p>
        This notice explains how {contact.legalName} (&quot;we&quot;,
        &quot;us&quot;) uses personal data when you use the {SITE.name} app and
        the stockvirtue.com website. Under India&apos;s Digital Personal Data
        Protection Act, 2023 (the DPDP Act) we are the{' '}
        <strong>Data Fiduciary</strong>: we decide how your data is used and we
        answer for it. Notice version {NOTICE_VERSION}.{' '}
        <a href="/privacy/hi" lang="hi">
          यह सूचना हिंदी में पढ़ें
        </a>
        . For another language listed in the Eighth Schedule to the
        Constitution, write to the grievance officer below.
      </p>
      <p>
        <strong>{SITE.name} is for adults.</strong> You must be 18 or older to
        have an account. It is a simulator: every trade uses virtual money, and
        we never ask for bank, demat, card, PAN or Aadhaar details.
      </p>

      <h2>1. What we collect and why</h2>
      <div
        className="legal-table"
        role="region"
        aria-label="What we collect"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Personal data</th>
              <th scope="col">What we use it for</th>
              <th scope="col">What it lets you do</th>
            </tr>
          </thead>
          <tbody>
            {DATA.map((d) => (
              <tr key={d.data}>
                <td>{d.data}</td>
                <td>{d.why}</td>
                <td>{d.enables}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        We don&apos;t collect your contacts, your precise location, or any real
        money or brokerage data, and we never sell personal data.
      </p>

      <h2>2. Your consent, and when we don&apos;t need it</h2>
      <p>
        When you create an account, the app shows a short version of this notice
        and asks you to confirm you are 18 or older and agree. That consent
        covers what the account needs (section 1). App analytics, and analytics
        or advertising cookies on this website, are separate: they are off
        unless you say yes, and saying no changes nothing else.
      </p>
      <p>
        Some things we do without asking because the law requires or allows
        them: keeping security logs for a year (DPDP Rules 2025), answering
        lawful requests from authorities, and acting to protect someone&apos;s
        safety.
      </p>

      <h2>3. Changing your mind</h2>
      <p>Withdrawing consent is as easy as giving it:</p>
      <ul>
        <li>
          <strong>App analytics:</strong> app → Profile → Privacy &amp; your
          data → turn off “Help improve the app”.
        </li>
        <li>
          <strong>Website cookies:</strong> “Cookie settings” at the bottom of
          every page
          {services.analytics.length + services.advertising.length > 0 ? (
            <>
              {' '}
              (or <CookieSettingsButton className="inline-link" /> now)
            </>
          ) : null}
          .
        </li>
        <li>
          <strong>Your account:</strong> app → Profile → Privacy &amp; your data
          → Delete my account. Withdrawing consent for the account means closing
          it, because we can&apos;t run it without that data.
        </li>
      </ul>
      <p>
        Withdrawing doesn&apos;t undo what was lawfully done before. We stop
        within a reasonable time, and so do the providers working for us.
      </p>

      <h2>4. Who we share it with</h2>
      <p>
        Only with providers who process it for us, under contract, for the
        purposes above:
      </p>
      <ul>
        <li>
          <strong>Google Firebase</strong>: signing in (email, phone, Google
          account), push notifications (your device token and the notification),
          and app analytics if you allow it.
        </li>
        <li>
          <strong>Our email delivery provider</strong>: your email address and
          the emails we send you.
        </li>
        <li>
          <strong>Our cloud hosting and storage providers</strong>: your account
          and activity, stored and processed for us.
        </li>
        <li>
          <strong>Financial Modeling Prep and TradingView</strong>: the app
          loads company logos and charts from them, so they see your IP address
          and the symbols shown.
        </li>
        <li>
          <strong>On this website, only if you agree</strong>: Google
          (Analytics, Tag Manager, AdSense), Microsoft (Clarity) and Meta
          (Pixel). See “Cookies”.
        </li>
        <li>
          <strong>Authorities</strong>, when the law requires it.
        </li>
      </ul>
      <p>
        These providers may process data in India and other countries. We only
        transfer data where the DPDP Act allows it.
      </p>

      <h2>5. How long we keep it</h2>
      <div
        className="legal-table"
        role="region"
        aria-label="How long we keep it"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            {RETENTION.map(([what, how]) => (
              <tr key={what}>
                <td>{what}</td>
                <td>{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>6. Your rights</h2>
      <p>Under the DPDP Act you can:</p>
      <ul>
        <li>
          <strong>Get a summary of your data</strong> and who we shared it with:
          app → Privacy &amp; your data → Download my data.
        </li>
        <li>
          <strong>Correct or update it</strong>: edit your profile in the app,
          or ask us.
        </li>
        <li>
          <strong>Have it erased</strong>: delete your account in the app, or
          ask us.
        </li>
        <li>
          <strong>Nominate someone</strong> to act for you if you die or
          can&apos;t act: app → Privacy &amp; your data → Nominee.
        </li>
        <li>
          <strong>Withdraw consent</strong> (section 3) and{' '}
          <strong>complain</strong> (section 8).
        </li>
      </ul>
      <p>
        Ask in the app (Privacy &amp; your data → Make a request), on our{' '}
        <a href="/privacy/requests">privacy requests page</a>, or by email to
        the grievance officer. To find your account we need the email address or
        mobile number registered with it, and we may ask you to confirm it. We
        answer within <strong>{contact.responseDays} days</strong>. Please give
        accurate information and don&apos;t make false or frivolous complaints:
        the DPDP Act asks that of everyone (section 15).
      </p>

      <h2>7. Security, and if something goes wrong</h2>
      <p>
        Data travels encrypted (HTTPS). Passwords and sign-in codes are stored
        only as hashes, access is limited to the people who need it and
        recorded, and we keep backups. If a breach affects your data we will
        tell you without delay, by email or in the app, with what happened and
        what you can do, and report it to the Data Protection Board of India as
        the law requires.
      </p>

      <h2>8. Questions and complaints</h2>
      <p>
        {officer}, {contact.legalName}
        {contact.postalAddress ? `, ${contact.postalAddress}` : ''}. Email:{' '}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
        {contact.phone ? `, phone: ${contact.phone}` : ''}.
      </p>
      <p>
        If you are not satisfied with our answer, you can complain to the{' '}
        <strong>Data Protection Board of India</strong> once you have used our
        grievance process.
      </p>

      <h2 id="cookies">9. Cookies</h2>
      <p>
        <strong>Necessary</strong>, always on: the cookie that remembers your
        cookie choice (<code>sv_consent</code>, 180 days) and, for newsroom
        staff only, the sign-in cookie of the staff portal.
      </p>
      <p>
        <strong>Analytics</strong>, only if you agree: Google Analytics (
        <code>_ga</code>), Google Tag Manager and Microsoft Clarity (
        <code>_clck</code>, <code>_clsk</code>), to see which pages are read.
      </p>
      <p>
        <strong>Advertising</strong>, only if you agree: personalised Google
        AdSense ads (<code>__gads</code>, <code>__gpi</code>) and the Meta Pixel
        (<code>_fbp</code>). If you say no, ads, where shown, are chosen from
        the page you are reading, not from you.
      </p>
      <p>
        {services.analytics.length + services.advertising.length > 0
          ? `In use on this site right now: ${[...services.analytics, ...services.advertising].join(', ')}.`
          : 'This site uses no analytics or advertising services right now.'}{' '}
        Nothing optional loads until you choose, and you can change your choice
        at any time from “Cookie settings”.
      </p>

      <h2>10. Children</h2>
      <p>
        {SITE.name} is not for anyone under 18. We ask everyone to confirm their
        age when they sign up. If we learn that a child&apos;s data reached us,
        we delete it; tell the grievance officer if you think this has happened.
      </p>

      <h2>11. Changes to this notice</h2>
      <p>
        When we change this notice in a way that matters, we update the version
        and date above and ask you to read and accept it again in the app before
        you carry on.
      </p>
    </LegalShell>
  );
}

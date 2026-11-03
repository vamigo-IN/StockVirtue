/**
 * The privacy notice the app and the website show (DPDP Act 2023 s.5; DPDP
 * Rules 2025, rule 3). Bump it when the notice changes in substance: everyone
 * with an account is asked to read and accept it again (the app checks
 * `needsNotice`). Keep the website's notice (web/src/app/(site)/privacy) in
 * step: it shows the same version.
 */
export const PRIVACY_NOTICE_VERSION = '2026-11';

/** Purposes a person can say yes or no to. "account" is the service itself. */
export const PURPOSES = ['account', 'analytics', 'advertising'] as const;
export type Purpose = (typeof PURPOSES)[number];

const DAY_MS = 86_400_000;

/**
 * A deleted account's restricted copy is erased this long after deletion:
 * the DPDP Rules keep personal data and logs of processing for at least a
 * year (rule 8(3)), and no longer (s.8(7)).
 */
export const DELETED_RETENTION_MS = 365 * DAY_MS;
/** Inactive accounts hear this long before erasure (rule 8(2): 48 hours). */
export const INACTIVITY_NOTICE_MS = 48 * 3_600_000;
/** The law's ceiling for answering a request or grievance (rule 14(3)). */
export const MAX_RESPONSE_DAYS = 90;

/** How long each kind of record is kept (the published retention schedule). */
export const RETENTION = {
  /** Contact-form messages, after the last reply. */
  contactMessages: 365 * DAY_MS,
  /** In-app notifications (order fills, alerts): the orders themselves stay. */
  notifications: 365 * DAY_MS,
  /** Push tokens of devices not seen for this long (FCM drops them too). */
  deviceTokens: 270 * DAY_MS,
  /** Expired, revoked or accepted staff invitations. */
  staffInvitations: 365 * DAY_MS,
  /** Newsroom audit log: accountability for published journalism. */
  auditLog: 3 * 365 * DAY_MS,
  /** Website cookie choices (each lasts 180 days). */
  visitorConsents: 2 * 365 * DAY_MS,
  /** Closed privacy requests and grievances: proof they were answered. */
  closedRequests: 3 * 365 * DAY_MS,
  /** Admin console sign-ins, sessions and devices. */
  adminSecurity: 365 * DAY_MS,
} as const;

/**
 * Who receives personal data from us and what (the right to a summary,
 * s.11(1)(b)–(c)). Mirrors "Who we share it with" in the website's notice.
 */
export const RECIPIENTS: readonly { name: string; data: string }[] = [
  {
    name: 'Google Firebase Authentication',
    data: 'Your sign-in identity: email address, phone number, and your Google profile name and photo if you use Google.',
  },
  {
    name: 'Google Firebase Cloud Messaging',
    data: 'Your device push token and the notifications we send you (for example order fills and price alerts).',
  },
  {
    name: 'Google Analytics for Firebase',
    data: 'App usage events (screens and features used), only if you allowed analytics. Never your trades or your identity.',
  },
  {
    name: 'Our email delivery provider',
    data: 'Your email address and the emails we send you.',
  },
  {
    name: 'Our cloud hosting and storage providers',
    data: 'Your account and activity, stored and processed on our behalf.',
  },
  {
    name: 'Financial Modeling Prep and TradingView',
    data: 'The app loads company logos and charts from them; they see your IP address and the symbols shown.',
  },
];

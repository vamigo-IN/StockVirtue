import { escapeHtml, MailService } from '../mail/mail.service';
import { PrivacyConfig } from '../site/site-config';

const IST = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});
const DAY = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'long',
  timeZone: 'Asia/Kolkata',
});

export const istDate = (d: Date) => DAY.format(d);
export const istDateTime = (d: Date) => `${IST.format(d)} IST`;

/** Every privacy message names who answers for it (DPDP Rules 2025, rule 9). */
function footer(mail: MailService, c: PrivacyConfig) {
  const who = c.officerName
    ? `${c.officerName}, Grievance Officer`
    : 'Our Grievance Officer';
  const html = mail.note(
    `<b>${escapeHtml(who)}</b>, ${escapeHtml(c.legalName)}: <a href="mailto:${escapeHtml(c.officerEmail)}">${escapeHtml(c.officerEmail)}</a>${c.officerPhone ? `, ${escapeHtml(c.officerPhone)}` : ''}. If you are not satisfied with our answer, you can complain to the Data Protection Board of India.`,
  );
  const text = `${who}, ${c.legalName}: ${c.officerEmail}${c.officerPhone ? `, ${c.officerPhone}` : ''}. If you are not satisfied with our answer, you can complain to the Data Protection Board of India.`;
  return { html, text };
}

/** Labels for request types, as people see them. */
export const REQUEST_LABELS: Record<string, string> = {
  ACCESS: 'A copy or summary of my data',
  CORRECTION: 'Correct or update my data',
  ERASURE: 'Delete my data',
  NOMINATION: 'Nominate someone',
  WITHDRAW_CONSENT: 'Withdraw my consent',
  GRIEVANCE: 'A complaint (grievance)',
  OTHER: 'Something else',
};

const CHANNELS: Record<string, string> = { web: 'Website', app: 'App' };

/** The privacy emails, built on the shared layout. */
export class PrivacyMail {
  constructor(
    private readonly mail: MailService,
    private readonly contact: () => Promise<PrivacyConfig>,
  ) {}

  async accountDeleted(
    to: string,
    opts: { name: string | null; eraseAfter: Date },
  ) {
    const c = await this.contact();
    const f = footer(this.mail, c);
    const hello = opts.name ? `Hi ${escapeHtml(opts.name)},` : 'Hello,';
    await this.mail.notify(
      to,
      'Your StockVirtue account has been deleted',
      'Your account is deleted',
      [
        this.mail.para(hello),
        this.mail.para(
          'Your StockVirtue account is deleted. You have been signed out everywhere, and your name, email and phone number are no longer used or shown anywhere: not on leaderboards, not in rooms.',
        ),
        this.mail.para(
          `The law asks us to keep a locked copy of your account and its activity records for one year, only to deal with security incidents or legal requests. It is erased for good on <b>${escapeHtml(istDate(opts.eraseAfter))}</b>.`,
        ),
        this.mail.para(
          'You can sign up again at any time with the same email or number; you would start with a fresh account.',
        ),
        f.html,
      ].join(''),
      `Your StockVirtue account is deleted. You have been signed out everywhere and your details are no longer used or shown. The law asks us to keep a locked copy for one year, only for security incidents or legal requests; it is erased for good on ${istDate(opts.eraseAfter)}. ${f.text}`,
    );
  }

  async inactivityNotice(
    to: string,
    opts: { name: string | null; eraseAt: Date },
  ) {
    const c = await this.contact();
    const f = footer(this.mail, c);
    const hello = opts.name ? `Hi ${escapeHtml(opts.name)},` : 'Hello,';
    await this.mail.notify(
      to,
      'Your StockVirtue account will be deleted in 48 hours',
      'We will delete your account soon',
      [
        this.mail.para(hello),
        this.mail.para(
          'You haven’t used StockVirtue for a long time, so we no longer need your data. To protect your privacy we delete accounts that have been unused for this long.',
        ),
        this.mail.para(
          `Your account will be deleted after <b>${escapeHtml(istDateTime(opts.eraseAt))}</b>. <b>To keep it, just sign in to the app before then.</b>`,
        ),
        f.html,
      ].join(''),
      `You haven't used StockVirtue for a long time, so your account will be deleted after ${istDateTime(opts.eraseAt)}. To keep it, sign in to the app before then. ${f.text}`,
    );
  }

  async requestReceived(
    to: string,
    r: { reference: string; type: string; dueAt: Date; name: string | null },
  ) {
    const c = await this.contact();
    const f = footer(this.mail, c);
    await this.mail.notify(
      to,
      `We received your privacy request ${r.reference}`,
      'We received your request',
      [
        this.mail.para(r.name ? `Hi ${escapeHtml(r.name)},` : 'Hello,'),
        this.mail.para(
          'Thank you. A person on our team will look at your request and reply by email.',
        ),
        this.mail.detailTable([
          { label: 'Reference', value: r.reference },
          { label: 'Request', value: REQUEST_LABELS[r.type] ?? r.type },
          { label: 'We reply by', value: istDate(r.dueAt) },
        ]),
        f.html,
      ].join(''),
      `We received your privacy request ${r.reference} (${REQUEST_LABELS[r.type] ?? r.type}). We reply by ${istDate(r.dueAt)}. ${f.text}`,
    );
  }

  async requestAnswered(
    to: string,
    r: {
      reference: string;
      type: string;
      resolved: boolean;
      response: string;
      name: string | null;
    },
  ) {
    const c = await this.contact();
    const f = footer(this.mail, c);
    const body = escapeHtml(r.response).replace(/\n/g, '<br>');
    await this.mail.notify(
      to,
      `Your privacy request ${r.reference}: ${r.resolved ? 'done' : 'our answer'}`,
      r.resolved ? 'Your request is done' : 'Our answer to your request',
      [
        this.mail.para(r.name ? `Hi ${escapeHtml(r.name)},` : 'Hello,'),
        this.mail.detailTable([
          { label: 'Reference', value: r.reference },
          { label: 'Request', value: REQUEST_LABELS[r.type] ?? r.type },
        ]),
        this.mail.para(body),
        f.html,
      ].join(''),
      `Privacy request ${r.reference} (${REQUEST_LABELS[r.type] ?? r.type}): ${r.response}\n\n${f.text}`,
    );
  }

  /** Tells the grievance officer a request came in. */
  async newRequestForOfficer(r: {
    reference: string;
    type: string;
    channel: string;
    email: string | null;
    phone: string | null;
    name: string | null;
    details: string;
    dueAt: Date;
    portalUrl: string;
  }) {
    const c = await this.contact();
    await this.mail.notify(
      c.officerEmail,
      `Privacy request ${r.reference}: ${REQUEST_LABELS[r.type] ?? r.type}`,
      'New privacy request',
      [
        this.mail.detailTable([
          { label: 'Reference', value: r.reference },
          { label: 'Request', value: REQUEST_LABELS[r.type] ?? r.type },
          { label: 'From', value: r.name || r.email || r.phone || 'App user' },
          {
            label: 'Contact',
            value: [r.email, r.phone].filter(Boolean).join(', ') || '—',
          },
          { label: 'Came in via', value: CHANNELS[r.channel] ?? r.channel },
          { label: 'Answer by', value: istDate(r.dueAt) },
        ]),
        this.mail.quote(r.details),
        this.mail.button('Open privacy requests', r.portalUrl),
      ].join(''),
      `Privacy request ${r.reference} (${REQUEST_LABELS[r.type] ?? r.type}) from ${r.name || r.email || r.phone || 'an app user'}, via ${r.channel}. Answer by ${istDate(r.dueAt)}.\n\n${r.details}\n\nHandle it at ${r.portalUrl}`,
    );
  }
}

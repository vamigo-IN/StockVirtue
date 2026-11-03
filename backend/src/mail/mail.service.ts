import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../config/configuration';

/**
 * Transactional email via SMTP (nodemailer) with a shared, branded template
 * layer. Used for: email-OTP (sign-up), password reset, and high-signal
 * notifications (referral redeemed, trade fills, digests).
 *
 * The layout is one open white column, not a card inside a card: the logo,
 * the message, a hairline, then a quiet footer with the app icon and links.
 * The logo and icon load from the website (`<site>/email/logo.png` and
 * `icon.png`, or MAIL_ASSETS_URL) instead of travelling as attachments, which
 * many mail apps list as a "stockvirtue.png" file on every message. With
 * images off the logo's alt text reads "StockVirtue". Templates are
 * table-based with inline CSS, the only layout email clients render
 * consistently.
 *
 * If SMTP_HOST/USER/PASS aren't configured the service runs in a dev fallback:
 * it logs a line (incl. the OTP, in dev only) to the console instead of
 * sending, so flows are testable without a mailbox. In production an unset
 * SMTP config makes send() throw rather than silently log secrets.
 */

/** Brand palette: the app's greens with slate text. */
const BRAND = {
  green: '#16A34A',
  greenDark: '#15803D',
  greenTint: '#F0FDF4',
  heading: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  surface: '#F1F5F9',
  page: '#FFFFFF',
};

/** Who sends these emails, as on the website's footer. */
const COMPANY = 'Vamigo Media (OPC) Pvt. Ltd.';
const TAGLINE = 'Learn | Practice | Invest better';

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO =
  "'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono','Courier New',monospace";

/** Keeps inbox previews to the preheader instead of the email's first lines. */
const PREHEADER_PAD = '&#8199;&#65279;&#847; '.repeat(60);

/** Accent tones for highlighted values (green = positive/buy, red = sell). */
type HeroTone = 'green' | 'red' | 'neutral';
const HERO_TONES: Record<HeroTone, { bar: string; value: string }> = {
  green: { bar: BRAND.green, value: BRAND.greenDark },
  red: { bar: '#DC2626', value: '#B91C1C' },
  neutral: { bar: '#CBD5E1', value: BRAND.heading },
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly isProd: boolean;
  private readonly siteUrl: string;
  private readonly logoUrl: string;
  private readonly iconUrl: string;
  readonly configured: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    const smtp = config.get('smtp', { infer: true });
    this.isProd = config.get('nodeEnv', { infer: true }) === 'production';
    this.from = smtp.from;
    this.siteUrl = smtp.siteUrl;
    this.logoUrl = `${smtp.assetsUrl}/logo.png`;
    this.iconUrl = `${smtp.assetsUrl}/icon.png`;
    if (!smtp.host || !smtp.user || !smtp.pass) {
      this.configured = false;
      this.transporter = null;
      this.logger.warn(
        'SMTP not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS). Emails will be logged to the console instead of sent.',
      );
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      // Pooled connections. Without this every message pays a fresh
      // TCP + TLS + AUTH handshake, which against a hosted SMTP provider is
      // most of the send latency; reusing a warm connection turns a
      // multi-second send into a fast one.
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      // Bound every stage so a hung or blackholed SMTP server can't pin a
      // connection (and, with the background dispatch, can't leave a login
      // sitting on "Sending…" forever).
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    this.configured = true;
    this.logger.log(`SMTP configured (${smtp.host}:${smtp.port})`);
  }

  // ── Public senders ───────────────────────────────────────────────

  /** Sign-up verification OTP. */
  async sendOtpEmail(
    to: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const minutes = this.minutes(ttlSeconds);
    await this.send(
      to,
      'Your StockVirtue verification code',
      this.codeEmail({
        heading: 'Verify your email',
        intro:
          'Welcome to StockVirtue! Enter this code in the app to finish setting up your account and start practising the markets.',
        code,
        minutes,
        preheader: `${code} is your StockVirtue verification code (expires in ${minutes} min).`,
      }),
      `Your StockVirtue verification code is ${code}. It expires in ${minutes} minute(s).`,
      `code ${code}`,
    );
  }

  /** Password-reset OTP. */
  async sendPasswordResetEmail(
    to: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const minutes = this.minutes(ttlSeconds);
    await this.send(
      to,
      'Reset your StockVirtue password',
      this.codeEmail({
        heading: 'Reset your password',
        intro:
          "Use this code in the app to set a new password. If you didn't request this, you can safely ignore this email — your password won't change.",
        code,
        minutes,
        preheader: `${code} is your StockVirtue password reset code (expires in ${minutes} min).`,
      }),
      `Your StockVirtue password reset code is ${code}. It expires in ${minutes} minute(s).`,
      `reset code ${code}`,
    );
  }

  /** Proves an email address before a privacy request is taken on the website. */
  async sendPrivacyCode(
    to: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const minutes = this.minutes(ttlSeconds);
    await this.send(
      to,
      'Your StockVirtue privacy request code',
      this.codeEmail({
        heading: 'Confirm your email',
        intro:
          "Enter this code on stockvirtue.com to send your privacy request. If you didn't ask for it, ignore this email: nothing happens without the code.",
        code,
        minutes,
        preheader: `${code} is your StockVirtue privacy request code (expires in ${minutes} min).`,
      }),
      `Your StockVirtue privacy request code is ${code}. It expires in ${minutes} minute(s). If you didn't ask for it, ignore this email.`,
      `privacy code ${code}`,
    );
  }

  /** Second step of a newsroom portal sign-in. */
  async sendStaffLoginCode(
    to: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const minutes = this.minutes(ttlSeconds);
    await this.send(
      to,
      'Your StockVirtue newsroom sign-in code',
      this.codeEmail({
        heading: 'Newsroom sign-in',
        intro:
          "Enter this code to finish signing in to the StockVirtue newsroom. If you didn't just sign in, change your password now — someone else knows it.",
        code,
        minutes,
        preheader: `${code} is your StockVirtue newsroom sign-in code (expires in ${minutes} min).`,
      }),
      `Your StockVirtue newsroom sign-in code is ${code}. It expires in ${minutes} minute(s). If you didn't just sign in, change your password now.`,
      `newsroom code ${code}`,
    );
  }

  /** Code for choosing a new password on the newsroom portal. */
  async sendStaffPasswordReset(
    to: string,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const minutes = this.minutes(ttlSeconds);
    await this.send(
      to,
      'Reset your StockVirtue newsroom password',
      this.codeEmail({
        heading: 'Reset your password',
        intro:
          "Enter this code on the newsroom's password reset page to choose a new password. It's also your StockVirtue app password. If you didn't ask for this, ignore this email: your password stays as it is.",
        code,
        minutes,
        preheader: `${code} is your StockVirtue newsroom password reset code (expires in ${minutes} min).`,
      }),
      `Your StockVirtue newsroom password reset code is ${code}. It expires in ${minutes} minute(s). If you didn't ask for this, ignore this email.`,
      `newsroom reset code ${code}`,
    );
  }

  /** Invitation to join the newsroom with the given roles. */
  async sendStaffInvitation(
    to: string,
    opts: {
      inviterName: string;
      roleNames: string[];
      acceptUrl: string;
      expiresAt: Date;
    },
  ): Promise<void> {
    const roles = opts.roleNames.join(', ');
    const expires = opts.expiresAt.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    });
    const heading = 'Join the StockVirtue newsroom';
    const bodyHtml = [
      this.para(
        `<b>${escapeHtml(opts.inviterName)}</b> invited you to the StockVirtue newsroom as <b>${escapeHtml(roles)}</b>.`,
      ),
      this.button('Accept the invitation', opts.acceptUrl),
      this.detailTable([
        { label: 'Role', value: roles },
        { label: 'Link expires', value: `${expires} IST` },
      ]),
      this.para(
        "If you already use StockVirtue, sign in with the same email and password. If you weren't expecting this, you can ignore this email: nothing happens until the invitation is accepted.",
      ),
    ].join('');
    const bodyText = `${opts.inviterName} invited you to the StockVirtue newsroom as ${roles}. Accept here: ${opts.acceptUrl} (expires ${expires} IST). If you weren't expecting this, ignore this email.`;
    // Same layout as notify(), but the link goes in the dev-console note so a
    // local setup without SMTP can still follow it.
    await this.send(
      to,
      `${opts.inviterName} invited you to the StockVirtue newsroom`,
      this.layout(
        this.body(heading, bodyHtml),
        bodyText.slice(0, 140),
        heading,
      ),
      bodyText,
      `invite ${opts.acceptUrl}`,
    );
  }

  /**
   * Generic high-signal notification (no code). Used by referral/trade/digest
   * emails. `bodyHtml` is trusted HTML the caller built from escaped values;
   * pass plain text in `bodyText` for non-HTML clients.
   */
  async notify(
    to: string,
    subject: string,
    heading: string,
    bodyHtml: string,
    bodyText: string,
  ): Promise<void> {
    await this.send(
      to,
      subject,
      this.layout(
        this.body(heading, bodyHtml),
        bodyText.slice(0, 140),
        heading,
      ),
      bodyText,
    );
  }

  // ── Reusable body components (compose into notify() bodyHtml) ─────
  // Each returns trusted HTML; plain-text inputs are HTML-escaped here so
  // callers pass raw strings. `para()` takes trusted HTML for inline emphasis.

  /** A highlighted value (wallet credit, trade fill…) with an accent bar. */
  heroCard(opts: {
    eyebrow: string;
    value: string;
    caption?: string;
    tone?: HeroTone;
  }): string {
    const t = HERO_TONES[opts.tone ?? 'green'];
    const caption = opts.caption
      ? `<div style="font-family:${FONT};font-size:14px;line-height:20px;color:${BRAND.muted};margin-top:4px;">${escapeHtml(opts.caption)}</div>`
      : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr>
      <td style="border-left:3px solid ${t.bar};padding:4px 0 4px 18px;">
        <div style="font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(opts.eyebrow)}</div>
        <div style="font-family:${FONT};font-size:30px;line-height:38px;font-weight:800;letter-spacing:-0.5px;color:${t.value};margin-top:6px;">${escapeHtml(opts.value)}</div>
        ${caption}
      </td></tr></table>`;
  }

  /** Key→value rows divided by hairlines (e.g. order type / product). */
  detailTable(rows: Array<{ label: string; value: string }>): string {
    const cells = rows
      .map(
        (r) => `<tr>
        <td valign="top" style="padding:12px 16px 12px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT};font-size:14px;line-height:20px;color:${BRAND.muted};white-space:nowrap;">${escapeHtml(r.label)}</td>
        <td align="right" valign="top" style="padding:12px 0;border-bottom:1px solid ${BRAND.line};font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:${BRAND.heading};word-break:break-word;">${escapeHtml(r.value)}</td>
      </tr>`,
      )
      .join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border-top:1px solid ${BRAND.line};">${cells}</table>`;
  }

  /** A badge glyph in a soft circle beside its title (achievements). */
  badgeTile(opts: { glyph: string; title: string; subtitle?: string }): string {
    const subtitle = opts.subtitle
      ? `<div style="font-family:${FONT};font-size:14px;line-height:21px;color:${BRAND.muted};margin-top:2px;">${escapeHtml(opts.subtitle)}</div>`
      : '';
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr>
      <td width="60" height="60" align="center" valign="middle" bgcolor="${BRAND.greenTint}" style="width:60px;height:60px;border-radius:30px;background:${BRAND.greenTint};font-size:30px;line-height:60px;text-align:center;">${escapeHtml(opts.glyph)}</td>
      <td valign="middle" style="padding-left:16px;">
        <div style="font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;color:${BRAND.heading};">${escapeHtml(opts.title)}</div>
        ${subtitle}
      </td></tr></table>`;
  }

  /** A call-to-action button that also renders in Outlook. */
  button(label: string, url: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
      <td align="center" bgcolor="${BRAND.green}" style="border-radius:8px;background:${BRAND.green};">
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
      </td></tr></table>`;
  }

  /** Someone's own words (a message, a request), set apart from ours. */
  quote(text: string): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr>
      <td style="border-left:3px solid ${BRAND.line};padding:2px 0 2px 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${BRAND.muted};">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</td>
    </tr></table>`;
  }

  /** Standard body paragraph. `html` is trusted (allows <b>/<a> emphasis). */
  para(html: string): string {
    return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.body};">${html}</p>`;
  }

  /** Smaller, quieter paragraph for small print (who to contact…). */
  note(html: string): string {
    return `<p style="margin:8px 0 16px;font-family:${FONT};font-size:14px;line-height:22px;color:${BRAND.muted};">${html}</p>`;
  }

  // ── Internals ────────────────────────────────────────────────────

  private minutes(ttlSeconds: number): number {
    return Math.max(1, Math.round(ttlSeconds / 60));
  }

  /** Low-level send with the dev console fallback. */
  private async send(
    to: string,
    subject: string,
    html: string,
    text: string,
    devNote?: string,
  ): Promise<void> {
    if (!this.transporter) {
      if (this.isProd) {
        throw new ServiceUnavailableException(
          'Email service is not configured',
        );
      }
      this.logger.warn(
        `[DEV-EMAIL] to ${to} — ${subject}${devNote ? ` (${devNote})` : ''}`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject,
      text: `${text}\n\n-- \nStockVirtue · ${TAGLINE}\n${this.siteUrl}\nThis is an automated email, so replies aren't read. To reach us: ${this.siteUrl}/contact`,
      html,
    });
  }

  private headingHtml(heading: string): string {
    return `<h1 class="sv-h1" style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.3px;color:${BRAND.heading};">${escapeHtml(heading)}</h1>`;
  }

  /** A heading over trusted body HTML. */
  private body(heading: string, bodyHtml: string): string {
    return `${this.headingHtml(heading)}
      <div style="font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.body};">${bodyHtml}</div>`;
  }

  /**
   * Full branded HTML document. `inner` is the body content (already-built,
   * trusted HTML); `preheader` is the hidden inbox preview snippet.
   */
  private layout(inner: string, preheader = '', title = 'StockVirtue'): string {
    const year = new Date().getFullYear();
    const site = escapeHtml(this.siteUrl);
    const link = (path: string, label: string) =>
      `<a href="${site}${path}" target="_blank" style="color:${BRAND.muted};text-decoration:underline;">${label}</a>`;
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(title)}</title>
<style>
  @media (max-width:620px) {
    .sv-px { padding-left:24px !important; padding-right:24px !important; }
    .sv-h1 { font-size:22px !important; line-height:30px !important; }
    .sv-code { font-size:30px !important; letter-spacing:6px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${BRAND.page};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.page};">${escapeHtml(preheader)}${PREHEADER_PAD}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.page}" style="background:${BRAND.page};">
  <tr>
    <td align="center">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr>
          <td class="sv-px" style="padding:40px 40px 0;">
            <a href="${site}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(this.logoUrl)}" width="208" height="62" alt="StockVirtue" style="display:block;width:208px;height:62px;margin-left:-8px;border:0;outline:none;text-decoration:none;font-family:${FONT};font-size:24px;font-weight:800;line-height:62px;color:${BRAND.green};" /></a>
          </td>
        </tr>
        <tr>
          <td class="sv-px" style="padding:28px 40px 8px;font-family:${FONT};">
            ${styleLinks(inner)}
          </td>
        </tr>
        <tr>
          <td class="sv-px" style="padding:24px 40px 44px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-top:1px solid ${BRAND.line};padding-top:24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td valign="middle" style="padding-right:12px;">
                        <a href="${site}" target="_blank"><img src="${escapeHtml(this.iconUrl)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;border-radius:8px;" /></a>
                      </td>
                      <td valign="middle" style="font-family:${FONT};">
                        <div style="font-size:14px;line-height:18px;font-weight:700;color:${BRAND.heading};">StockVirtue</div>
                        <div style="font-size:10px;line-height:16px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${BRAND.muted};">${TAGLINE}</div>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:19px;color:${BRAND.muted};">StockVirtue is a stock-market simulator for learning: every trade uses virtual money, never real funds, and nothing here is investment advice.</p>
                  <p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:19px;color:${BRAND.muted};">${link('/privacy', 'Privacy notice')}&nbsp;&nbsp;&middot;&nbsp;&nbsp;${link('/terms', 'Terms')}&nbsp;&nbsp;&middot;&nbsp;&nbsp;${link('/contact', 'Contact us')}</p>
                  <p style="margin:12px 0 0;font-family:${FONT};font-size:11px;line-height:17px;color:${BRAND.faint};">This is an automated email, so replies aren't read. &copy; ${year} ${COMPANY}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
  }

  private codeEmail(opts: {
    heading: string;
    intro: string;
    code: string;
    minutes: number;
    preheader: string;
  }): string {
    const { heading, intro, code, minutes, preheader } = opts;
    const inner = `
      ${this.headingHtml(heading)}
      ${this.para(escapeHtml(intro))}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
        <tr>
          <td align="center" bgcolor="${BRAND.surface}" style="background:${BRAND.surface};border-radius:12px;padding:24px 12px;">
            <div class="sv-code" style="font-family:${MONO};font-size:36px;line-height:44px;font-weight:700;letter-spacing:10px;color:${BRAND.heading};padding-left:10px;">${escapeHtml(code)}</div>
          </td>
        </tr>
      </table>
      <p style="margin:0;font-family:${FONT};font-size:14px;line-height:22px;color:${BRAND.muted};">This code expires in <strong style="color:${BRAND.body};">${minutes} minute${minutes === 1 ? '' : 's'}</strong>. Never share it with anyone: StockVirtue staff will never ask you for it.</p>`;
    return this.layout(inner, preheader, heading);
  }
}

/** Gives links without a style of their own the brand colour. */
function styleLinks(html: string): string {
  return html.replace(
    /<a\s(?![^>]*\bstyle=)/gi,
    `<a style="color:${BRAND.green};font-weight:600;text-decoration:underline;" `,
  );
}

/// HTML-escape interpolated values so a crafted displayName / symbol can't
/// break out of the email markup.
export function escapeHtml(value: unknown): string {
  if (value == null) return '';
  const s =
    typeof value === 'string'
      ? value
      : typeof value === 'number' ||
          typeof value === 'boolean' ||
          typeof value === 'bigint'
        ? value.toString()
        : (JSON.stringify(value) ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

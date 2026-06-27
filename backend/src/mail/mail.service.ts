import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../config/configuration';
import { LOGO_PNG_BASE64 } from './logo-asset';

/**
 * Transactional email via SMTP (nodemailer) with a shared, branded template
 * layer. Used for: email-OTP (sign-up), password reset, and high-signal
 * notifications (referral redeemed, trade fills, digests).
 *
 * The brand logo is embedded inline via a CID attachment (no static hosting /
 * CDN dependency) so it renders reliably in Gmail, Apple Mail and Outlook.
 * Templates are table-based with inline CSS — the only layout email clients
 * render consistently.
 *
 * If SMTP_HOST/USER/PASS aren't configured the service runs in a dev fallback:
 * it logs a line (incl. the OTP, in dev only) to the console instead of
 * sending, so flows are testable without a mailbox. In production an unset
 * SMTP config makes send() throw rather than silently log secrets.
 */

/** Content-ID the HTML references (`cid:`) for the inline brand logo. */
const LOGO_CID = 'stockvirtue-logo';

/** Brand palette — kept in sync with the app theme (lib/core/theme.dart). */
const BRAND = {
  green: '#16A34A',
  greenLight: '#22C55E',
  ink: '#0B0F14',
  heading: '#18181B',
  body: '#52525B',
  muted: '#8B9097',
  faint: '#A8ADB4',
  backdrop: '#EEF1F4',
  cardBorder: '#E6E8EB',
  codeBg: '#F0FDF4',
  codeBorder: '#BBF7D0',
  codeText: '#15803D',
  footerBg: '#FAFAFA',
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Accent tones for hero cards (green = positive/buy, red = sell, neutral). */
type HeroTone = 'green' | 'red' | 'neutral';
const HERO_TONES: Record<
  HeroTone,
  { bg: string; border: string; accent: string }
> = {
  green: { bg: BRAND.codeBg, border: BRAND.codeBorder, accent: BRAND.codeText },
  red: { bg: '#FEF2F2', border: '#FECACA', accent: '#B91C1C' },
  neutral: { bg: '#F4F4F5', border: '#E4E4E7', accent: BRAND.heading },
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly isProd: boolean;
  private readonly logoBuffer = Buffer.from(LOGO_PNG_BASE64, 'base64');
  readonly configured: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    const smtp = config.get('smtp', { infer: true });
    this.isProd = config.get('nodeEnv', { infer: true }) === 'production';
    this.from = smtp.from;
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
    const inner = `
      ${this.headingHtml(heading)}
      <div style="font-size:15px;line-height:23px;color:${BRAND.body}">${bodyHtml}</div>`;
    await this.send(
      to,
      subject,
      this.layout(inner, bodyText.slice(0, 140)),
      bodyText,
    );
  }

  // ── Reusable body components (compose into notify() bodyHtml) ─────
  // Each returns trusted HTML; plain-text inputs are HTML-escaped here so
  // callers pass raw strings. `para()` takes trusted HTML for inline emphasis.

  /** Centred highlight card for a hero value (wallet credit, trade fill…). */
  heroCard(opts: {
    eyebrow: string;
    value: string;
    caption?: string;
    tone?: HeroTone;
  }): string {
    const t = HERO_TONES[opts.tone ?? 'green'];
    const caption = opts.caption
      ? `<div style="font-family:${FONT};font-size:13px;color:${BRAND.body};margin-top:8px;">${escapeHtml(opts.caption)}</div>`
      : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 4px;"><tr>
      <td align="center" style="background:${t.bg};border:1px solid ${t.border};border-radius:14px;padding:22px 16px;">
        <div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:${t.accent};">${escapeHtml(opts.eyebrow)}</div>
        <div style="font-family:${FONT};font-size:30px;font-weight:800;letter-spacing:-0.5px;line-height:1.15;color:${t.accent};margin-top:8px;">${escapeHtml(opts.value)}</div>
        ${caption}
      </td></tr></table>`;
  }

  /** Clean key→value detail table (e.g. order type / product). */
  detailTable(rows: Array<{ label: string; value: string }>): string {
    const cells = rows
      .map((r, i) => {
        const top = i ? 'border-top:1px solid #F1F2F4;' : '';
        return `<tr>
        <td style="padding:11px 2px;${top}font-family:${FONT};font-size:13px;color:${BRAND.muted};">${escapeHtml(r.label)}</td>
        <td align="right" style="padding:11px 2px;${top}font-family:${FONT};font-size:13px;font-weight:600;color:${BRAND.heading};">${escapeHtml(r.value)}</td>
      </tr>`;
      })
      .join('');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;border-top:1px solid #EEF0F2;">${cells}</table>`;
  }

  /** Circular glyph badge with a title + optional subtitle (achievements). */
  badgeTile(opts: { glyph: string; title: string; subtitle?: string }): string {
    const subtitle = opts.subtitle
      ? `<div style="font-family:${FONT};font-size:14px;line-height:21px;color:${BRAND.body};margin-top:6px;">${escapeHtml(opts.subtitle)}</div>`
      : '';
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:4px 0 2px;">
      <div style="width:74px;height:74px;line-height:74px;border-radius:50%;background:${BRAND.codeBg};border:1px solid ${BRAND.codeBorder};font-size:34px;text-align:center;">${escapeHtml(opts.glyph)}</div>
      <div style="font-family:${FONT};font-size:19px;font-weight:800;letter-spacing:-0.2px;color:${BRAND.heading};margin-top:14px;">${escapeHtml(opts.title)}</div>
      ${subtitle}
    </td></tr></table>`;
  }

  /** Standard body paragraph. `html` is trusted (allows <b>/<a> emphasis). */
  para(html: string): string {
    return `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:23px;color:${BRAND.body};">${html}</p>`;
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
      text,
      html,
      attachments: [
        {
          filename: 'stockvirtue.png',
          content: this.logoBuffer,
          cid: LOGO_CID,
          contentType: 'image/png',
        },
      ],
    });
  }

  private headingHtml(heading: string): string {
    return `<h1 style="margin:0 0 10px;font-size:22px;font-weight:700;letter-spacing:-0.4px;color:${BRAND.heading}">${escapeHtml(heading)}</h1>`;
  }

  /**
   * Full branded HTML document. `inner` is the body content (already-built,
   * trusted HTML); `preheader` is the hidden inbox preview snippet.
   */
  private layout(inner: string, preheader = ''): string {
    const year = new Date().getFullYear();
    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light" />
<title>StockVirtue</title>
</head>
<body style="margin:0;padding:0;width:100%;background:${BRAND.backdrop};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.backdrop};">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.backdrop};">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.cardBorder};border-radius:16px;overflow:hidden;">
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background:${BRAND.green};background:linear-gradient(90deg,${BRAND.greenLight},${BRAND.green});">&nbsp;</td>
        </tr>
        <tr>
          <td align="center" style="padding:36px 36px 10px;">
            <img src="cid:${LOGO_CID}" width="56" height="56" alt="StockVirtue" style="display:block;width:56px;height:56px;border-radius:14px;border:1px solid #ECEEF1;" />
            <div style="font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-0.3px;color:${BRAND.ink};margin-top:14px;">StockVirtue</div>
            <div style="font-family:${FONT};font-size:12px;font-weight:500;letter-spacing:0.3px;color:${BRAND.muted};margin-top:3px;">Virtual trading. Real skills.</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 36px 30px;font-family:${FONT};">
            ${inner}
          </td>
        </tr>
        <tr>
          <td style="padding:22px 36px 26px;background:${BRAND.footerBg};border-top:1px solid #EEF0F2;font-family:${FONT};">
            <p style="margin:0 0 6px;font-size:12px;line-height:18px;color:${BRAND.muted};">StockVirtue is a virtual stock-market simulator built for learning — all trades use virtual money, never real funds.</p>
            <p style="margin:0;font-size:11px;line-height:17px;color:${BRAND.faint};">This is an automated message — please don't reply. &copy; ${year} StockVirtue. All rights reserved.</p>
          </td>
        </tr>
      </table>
      <div style="font-family:${FONT};font-size:11px;color:${BRAND.faint};margin-top:16px;">You're receiving this because you have a StockVirtue account.</div>
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
      <p style="margin:0 0 26px;font-size:15px;line-height:23px;color:${BRAND.body};">${escapeHtml(intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="background:${BRAND.codeBg};border:1px solid ${BRAND.codeBorder};border-radius:14px;padding:24px 16px;">
            <div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.green};margin-bottom:10px;">Your code</div>
            <div style="font-family:${FONT};font-size:38px;font-weight:800;letter-spacing:10px;line-height:1;color:${BRAND.codeText};padding-left:10px;">${escapeHtml(code)}</div>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#71717A;">This code expires in <strong style="color:${BRAND.heading};">${minutes} minute${minutes === 1 ? '' : 's'}</strong>. For your security, never share it with anyone — StockVirtue staff will never ask you for it.</p>`;
    return this.layout(inner, preheader);
  }
}

/// HTML-escape interpolated values so a crafted displayName / symbol can't
/// break out of the email markup.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

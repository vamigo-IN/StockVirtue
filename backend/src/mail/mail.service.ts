import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../config/configuration';

/**
 * Transactional email via SMTP (nodemailer) with a small shared template
 * layer. Used for: email-OTP (sign-up), password reset, and high-signal
 * notifications (referral redeemed, trade fills, digests).
 *
 * If SMTP_HOST/USER/PASS aren't configured the service runs in a dev fallback:
 * it logs a line (incl. the OTP, in dev only) to the console instead of
 * sending, so flows are testable without a mailbox. In production an unset
 * SMTP config makes send() throw rather than silently log secrets.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  private readonly isProd: boolean;
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
  async sendOtpEmail(to: string, code: string, ttlSeconds: number): Promise<void> {
    const minutes = this.minutes(ttlSeconds);
    await this.send(
      to,
      'Your StockVirtue verification code',
      this.codeEmail(
        'Verify your email',
        'Enter this code in the StockVirtue app to finish creating your account.',
        code,
        minutes,
      ),
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
      this.codeEmail(
        'Reset your password',
        "Use this code in the app to set a new password. If you didn't request this, you can safely ignore this email.",
        code,
        minutes,
      ),
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
    await this.send(
      to,
      subject,
      this.layout(
        `<h2 style="margin:0 0 12px;font-size:20px">${escapeHtml(heading)}</h2>${bodyHtml}`,
      ),
      bodyText,
    );
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
        throw new ServiceUnavailableException('Email service is not configured');
      }
      this.logger.warn(
        `[DEV-EMAIL] to ${to} — ${subject}${devNote ? ` (${devNote})` : ''}`,
      );
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }

  private layout(inner: string): string {
    return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#18181b">
      <div style="font-weight:800;font-size:18px;margin-bottom:18px">StockVirtue</div>
      ${inner}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
      <p style="color:#999;font-size:12px;margin:0">StockVirtue — a virtual stock-market simulator. This is an automated message; please don't reply.</p>
    </div>`;
  }

  private codeEmail(
    heading: string,
    intro: string,
    code: string,
    minutes: number,
  ): string {
    return this.layout(`
      <h2 style="margin:0 0 8px;font-size:20px">${escapeHtml(heading)}</h2>
      <p style="color:#555;margin:0 0 20px">${escapeHtml(intro)}</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#f4f4f5;border-radius:12px;padding:16px;text-align:center">${escapeHtml(code)}</div>
      <p style="color:#888;font-size:13px;margin:20px 0 0">This code expires in ${minutes} minute${minutes === 1 ? '' : 's'}.</p>`);
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

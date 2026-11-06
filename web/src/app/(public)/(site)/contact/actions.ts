'use server';

import { getSettings, sendContact } from '@/lib/settings';
import { SITE } from '@/lib/site';

export interface ContactState {
  ok: boolean;
  message: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The server's messages (spec §9.5.6). */
const SENT = "Thanks. Your message has reached us, and we'll reply by email.";

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot — bots fill hidden fields; humans don't.
  if (String(formData.get('company') || '').trim()) {
    return { ok: true, message: SENT };
  }
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const subject = String(formData.get('subject') || '').trim();
  const message = String(formData.get('message') || '').trim();

  if (!name || !email || !message) {
    return { ok: false, message: 'Please fill in your name, email and message.' };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, message: 'Please enter a valid email address.' };
  }
  if (message.length > 5000) {
    return { ok: false, message: 'Your message is too long. Please keep it under 5,000 characters.' };
  }

  const res = await sendContact({
    name,
    email,
    subject: subject || 'Website contact',
    message,
  });
  if (!res.ok) {
    // The address the page shows (Settings, else the site's own).
    const settings = await getSettings();
    const to = settings.contactEmail || SITE.email;
    return {
      ok: false,
      message: `We couldn't send your message just now. Please try again, or email us at ${to}.`,
    };
  }
  return { ok: true, message: SENT };
}

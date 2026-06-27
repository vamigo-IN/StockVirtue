'use server';

import { sendContact } from '@/lib/settings';

export interface ContactState {
  ok: boolean;
  message: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot — bots fill hidden fields; humans don't.
  if (String(formData.get('company') || '').trim()) {
    return { ok: true, message: 'Thanks! Your message has been sent.' };
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
    return { ok: false, message: 'Your message is too long (max 5000 characters).' };
  }

  const res = await sendContact({
    name,
    email,
    subject: subject || 'Website contact',
    message,
  });
  if (!res.ok) {
    return {
      ok: false,
      message:
        'Sorry, we couldn’t send your message right now. Please email us directly.',
    };
  }
  return {
    ok: true,
    message: 'Thanks! Your message has been sent — we’ll get back to you soon.',
  };
}

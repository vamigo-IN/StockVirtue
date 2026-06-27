'use client';

import { useActionState } from 'react';
import { submitContact, type ContactState } from './actions';

const INITIAL: ContactState = { ok: false, message: '' };

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, INITIAL);

  if (state.ok) {
    return (
      <div className="alert alert-ok" role="status">
        {state.message}
      </div>
    );
  }

  return (
    <form action={action}>
      {state.message && (
        <div className="alert alert-err" role="alert">
          {state.message}
        </div>
      )}
      {/* Honeypot — visually hidden */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px' }}
        aria-hidden="true"
      />
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" className="input" required maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          required
          maxLength={160}
        />
      </div>
      <div className="field">
        <label htmlFor="subject">Subject</label>
        <input id="subject" name="subject" className="input" maxLength={160} />
      </div>
      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" className="textarea" required />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}

'use client';

import { useActionState } from 'react';
import { Button } from '@/components/public/Button';
import { Field, FormMessage, Input, Textarea } from '@/components/public/forms/Field';
import { submitContact, type ContactState } from './actions';

const INITIAL: ContactState = { ok: false, message: '' };

/**
 * The contact form (spec §4.12, §5.6, §9.5.6): the fields "Your name",
 * "Email", "What it's about (optional)" (the `subject` field) and "Message",
 * then "Send message" (full width below 640 px). The ids name, email,
 * subject and message, the honeypot `company` and the button label are
 * kept exactly. The server's message shows inside the form (role="alert");
 * on success the form gives way to a role="status" panel. The page renders
 * the collection notice under it.
 */
export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, INITIAL);

  if (state.ok) {
    return <FormMessage tone="success">{state.message}</FormMessage>;
  }

  return (
    <form action={action} className="grid gap-4">
      {state.message ? <FormMessage tone="error">{state.message}</FormMessage> : null}
      {/* Honeypot: visually hidden; bots fill hidden fields, people don't. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px' }}
        aria-hidden="true"
      />
      <Field id="name" label="Your name">
        <Input name="name" required maxLength={120} autoComplete="name" />
      </Field>
      <Field id="email" label="Email">
        <Input name="email" type="email" required maxLength={160} autoComplete="email" inputMode="email" />
      </Field>
      <Field
        id="subject"
        label="What it's about (optional)"
        hint="For example, a question about orders, or a correction to a story."
      >
        <Input name="subject" maxLength={160} autoComplete="off" />
      </Field>
      <Field id="message" label="Message">
        <Textarea name="message" required />
      </Field>
      <div>
        <Button variant="primary" type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Sending…' : 'Send message'}
        </Button>
      </div>
    </form>
  );
}

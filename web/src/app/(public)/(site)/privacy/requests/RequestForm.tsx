'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/public/Button';
import { Field, FormMessage, Input, Select, Textarea } from '@/components/public/forms/Field';
import styles from '@/components/public/legal/legal.module.css';
import {
  type ActionResult,
  requestCode,
  type RequestType,
  sendRequest,
} from './actions';

const TYPES: { value: RequestType; label: string }[] = [
  { value: 'ACCESS', label: 'A summary of my data and who it was shared with' },
  { value: 'CORRECTION', label: 'Correct or update my data' },
  { value: 'ERASURE', label: 'Delete my account and data' },
  { value: 'WITHDRAW_CONSENT', label: 'Withdraw my consent' },
  { value: 'NOMINATION', label: 'Nominate someone to act for me' },
  { value: 'GRIEVANCE', label: 'A complaint about how my data was handled' },
  { value: 'OTHER', label: 'Something else' },
];

const DATE = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'long',
  timeZone: 'Asia/Kolkata',
});

/**
 * A privacy request from the website: the address is proved with an emailed
 * code first, so nobody can act on someone else's data.
 *
 * Styled with the shared form fields (spec §4.12), on a mint panel of the
 * reading sheet (legal.module.css .requestForm): the ids #pr-email,
 * #pr-code, #pr-name, #pr-type and #pr-details, the labels, the button
 * labels and "Request received." (once) are kept exactly; messages sit
 * inside the form (role="alert" for errors, role="status" otherwise).
 */
export function RequestForm() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'email' | 'details'>('email');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<RequestType>('ACCESS');
  const [details, setDetails] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok && result.reference) {
    return (
      <FormMessage tone="success">
        <strong>Request received.</strong> Your reference is{' '}
        <strong>{result.reference}</strong>. We emailed you a copy and will
        reply by{' '}
        {result.dueAt ? DATE.format(new Date(result.dueAt)) : 'the due date'}.
      </FormMessage>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          if (step === 'email') {
            const r = await requestCode(email);
            setResult(r);
            if (r.ok) setStep('details');
          } else {
            setResult(await sendRequest({ email, code, name, type, details }));
          }
        });
      }}
      noValidate
      className={styles.requestForm}
    >
      {result && (
        <FormMessage tone={result.ok ? 'success' : 'error'}>{result.message}</FormMessage>
      )}
      <Field id="pr-email" label="The email address on your StockVirtue account">
        <Input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (step === 'details') setStep('email');
          }}
          autoComplete="email"
          required
          maxLength={160}
        />
      </Field>
      {step === 'details' && (
        <>
          <Field id="pr-code" label="6-digit code from the email">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              required
            />
          </Field>
          <Field id="pr-name" label="Your name (optional)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
            />
          </Field>
          <Field id="pr-type" label="What would you like us to do?">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as RequestType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="pr-details" label="Details">
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={4000}
              required
              placeholder="For a correction, what should change. For a nominee, their name and how to reach them. For a complaint, what happened."
            />
          </Field>
        </>
      )}
      <div>
        <Button variant="primary" type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending
            ? 'Sending…'
            : step === 'email'
              ? 'Email me a code'
              : 'Send my request'}
        </Button>
      </div>
    </form>
  );
}

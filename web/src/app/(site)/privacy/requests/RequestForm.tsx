'use client';

import { useState, useTransition } from 'react';
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
      <div className="alert alert-ok" role="status">
        <strong>Request received.</strong> Your reference is{' '}
        <strong>{result.reference}</strong>. We emailed you a copy and will
        reply by{' '}
        {result.dueAt ? DATE.format(new Date(result.dueAt)) : 'the due date'}.
      </div>
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
    >
      {result && (
        <div
          className={result.ok ? 'alert alert-ok' : 'alert alert-err'}
          role={result.ok ? 'status' : 'alert'}
        >
          {result.message}
        </div>
      )}
      <div className="field">
        <label htmlFor="pr-email">
          The email address on your StockVirtue account
        </label>
        <input
          id="pr-email"
          type="email"
          className="input"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (step === 'details') setStep('email');
          }}
          autoComplete="email"
          required
          maxLength={160}
        />
      </div>
      {step === 'details' && (
        <>
          <div className="field">
            <label htmlFor="pr-code">6-digit code from the email</label>
            <input
              id="pr-code"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pr-name">Your name (optional)</label>
            <input
              id="pr-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="pr-type">What would you like us to do?</label>
            <select
              id="pr-type"
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as RequestType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pr-details">Details</label>
            <textarea
              id="pr-details"
              className="textarea"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={4000}
              required
              placeholder="For a correction, what should change. For a nominee, their name and how to reach them. For a complaint, what happened."
            />
          </div>
        </>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending
          ? 'Sending…'
          : step === 'email'
            ? 'Email me a code'
            : 'Send my request'}
      </button>
    </form>
  );
}

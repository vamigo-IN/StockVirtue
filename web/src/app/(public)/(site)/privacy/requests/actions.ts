'use server';

import { headers } from 'next/headers';
import { API_V1, backendHeaders, clientFromHeaders } from '@/portal/backend';

export interface ActionResult {
  ok: boolean;
  message: string;
  reference?: string;
  dueAt?: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export type RequestType =
  | 'ACCESS'
  | 'CORRECTION'
  | 'ERASURE'
  | 'NOMINATION'
  | 'WITHDRAW_CONSENT'
  | 'GRIEVANCE'
  | 'OTHER';
const TYPES = new Set<RequestType>([
  'ACCESS',
  'CORRECTION',
  'ERASURE',
  'NOMINATION',
  'WITHDRAW_CONSENT',
  'GRIEVANCE',
  'OTHER',
]);

/** The API's message, or a plain fallback. */
async function messageOf(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as {
      message?: string | string[] | { message?: string };
    };
    const m = body.message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.length ? String(m[0]) : fallback;
    if (m && typeof m.message === 'string') return m.message;
  } catch {
    // not JSON
  }
  return fallback;
}

async function post(path: string, body: unknown): Promise<Response> {
  const client = clientFromHeaders(await headers());
  return fetch(`${API_V1}/privacy/${path}`, {
    method: 'POST',
    headers: backendHeaders(undefined, client, true),
    body: JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
}

/** Step 1: a code to the address, proving it is theirs. */
export async function requestCode(email: string): Promise<ActionResult> {
  const address = email.trim().toLowerCase();
  if (!EMAIL_RE.test(address) || address.length > 160) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  try {
    const res = await post('requests/code', { email: address });
    if (!res.ok) {
      return {
        ok: false,
        message: await messageOf(res, 'We couldn’t send a code right now.'),
      };
    }
    return {
      ok: true,
      message: `We emailed a 6-digit code to ${address}. It works for 15 minutes.`,
    };
  } catch {
    return {
      ok: false,
      message:
        'We couldn’t send a code right now. Please try again, or email the grievance officer.',
    };
  }
}

/** Step 2: the code and the request. */
export async function sendRequest(input: {
  email: string;
  code: string;
  name: string;
  type: RequestType;
  details: string;
}): Promise<ActionResult> {
  const details = input.details.trim();
  if (!TYPES.has(input.type)) {
    return { ok: false, message: 'Choose what you would like us to do.' };
  }
  if (!/^\d{6}$/.test(input.code.trim())) {
    return { ok: false, message: 'Enter the 6-digit code from the email.' };
  }
  if (details.length < 5) {
    return { ok: false, message: 'Tell us a little more about your request.' };
  }
  try {
    const res = await post('requests', {
      email: input.email.trim().toLowerCase(),
      code: input.code.trim(),
      ...(input.name.trim() ? { name: input.name.trim() } : {}),
      type: input.type,
      details: details.slice(0, 4000),
    });
    if (!res.ok) {
      return {
        ok: false,
        message: await messageOf(
          res,
          'We couldn’t take your request right now.',
        ),
      };
    }
    const body = (await res.json()) as { reference: string; dueAt: string };
    return {
      ok: true,
      message: 'Request received.',
      reference: body.reference,
      dueAt: body.dueAt,
    };
  } catch {
    return {
      ok: false,
      message:
        'We couldn’t take your request right now. Please try again, or email the grievance officer.',
    };
  }
}

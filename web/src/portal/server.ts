import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { API_V1, backendHeaders, clientFromHeaders } from './backend';
import { isSessionEnd, STAFF_COOKIE } from './session';
import type { StaffMe } from './types';

type MeResult = { me: StaffMe } | { me: null; reason: string };

/**
 * The signed-in staff member for this request, checked with the API (once per
 * request, shared by the layout and the page). Suspension, blocking and role
 * changes therefore apply on the very next page load.
 */
export const getMe = cache(async (): Promise<MeResult> => {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return { me: null, reason: 'staff_session_required' };
  const res = await fetch(`${API_V1}/staff/auth/me`, {
    headers: backendHeaders(token, clientFromHeaders(await headers()), false),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) return { me: (await res.json()) as StaffMe };
  const body = (await res.json().catch(() => null)) as {
    message?: { code?: string };
  } | null;
  const code = body?.message?.code;
  if (res.status === 401 || isSessionEnd(code)) {
    return { me: null, reason: code ?? 'staff_session_required' };
  }
  throw new Error(`The newsroom API answered ${res.status}.`);
});

/** The signed-in staff member, or a redirect to the sign-in page. */
export async function requireMe(): Promise<StaffMe> {
  const result = await getMe();
  if (result.me) return result.me;
  const path = (await headers()).get('x-portal-path') ?? '/admin';
  const params = new URLSearchParams({ next: path, reason: result.reason });
  redirect(`/admin/login?${params.toString()}`);
}

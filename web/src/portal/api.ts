import { isSessionEnd } from './session';

/** A failed portal API call, with the API's own message (safe to show). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The API wraps errors as { statusCode, message } where message is a string,
 * a validation list, or { message, code } for session problems.
 */
function readError(body: unknown, status: number) {
  let msg: unknown = (body as { message?: unknown } | null)?.message;
  let code: string | undefined;
  if (msg && typeof msg === 'object' && !Array.isArray(msg)) {
    const inner = msg as { message?: unknown; code?: unknown };
    code = typeof inner.code === 'string' ? inner.code : undefined;
    msg = inner.message;
  }
  if (Array.isArray(msg)) msg = msg[0];
  if (typeof msg === 'string' && msg.trim()) return { message: msg, code };
  if (status === 429) {
    return { message: 'Too many requests. Wait a moment and try again.', code };
  }
  if (status >= 500) {
    return {
      message: 'Something went wrong on our side. Try again in a moment.',
      code,
    };
  }
  return { message: `The request failed (${status}).`, code };
}

let leaving = false;

/** The session is over: back to sign-in, then return to this page. */
function endSession(code: string) {
  if (leaving || typeof window === 'undefined') return;
  leaving = true;
  const next = window.location.pathname + window.location.search;
  window.location.assign(
    `/admin/login?${new URLSearchParams({ reason: code, next }).toString()}`,
  );
}

type Query = Record<string, string | number | null | undefined>;

export async function api<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    query?: Query;
    /** Sign-in pages handle session errors themselves. */
    signInFlow?: boolean;
  } = {},
): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.size ? `?${params.toString()}` : '';
  let res: Response;
  try {
    res = await fetch(`/admin/api/${path}${qs}`, {
      method: opts.method ?? 'GET',
      headers: {
        'x-sv-portal': '1',
        ...(opts.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(
      0,
      "Couldn't reach the newsroom. Check your connection and try again.",
    );
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const { message, code } = readError(data, res.status);
    if (isSessionEnd(code) && !opts.signInFlow) endSession(code);
    throw new ApiError(res.status, message, code);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Try again.';
}

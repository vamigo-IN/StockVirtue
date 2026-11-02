import { AiProviderError, httpError } from './types';

const RETRY_DELAYS_MS = [2_000, 6_000];

/**
 * POST JSON with a timeout, retrying rate limits, server errors and network
 * failures twice. For providers without an official SDK in this codebase.
 */
export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    let error: AiProviderError;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      if (res.ok) {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new AiProviderError(
            'The provider sent an answer that isn’t JSON.',
            'bad_output',
            false,
          );
        }
      }
      error = httpError(res.status, errorDetail(text));
      const wait = Number(res.headers.get('retry-after'));
      if (error.retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(
          Number.isFinite(wait) && wait > 0
            ? Math.min(wait * 1000, 20_000)
            : RETRY_DELAYS_MS[attempt],
        );
        continue;
      }
      throw error;
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      const timeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError');
      error = timeout
        ? new AiProviderError(
            'The provider took too long to answer.',
            'timeout',
            true,
          )
        : new AiProviderError(
            'Couldn’t reach the provider. Check its address.',
            'network',
            true,
          );
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw error;
    }
  }
}

/** The provider's own error message, if it sent one. */
function errorDetail(text: string): string {
  try {
    const body = JSON.parse(text) as {
      error?: string | { message?: string };
      message?: string;
    };
    const e = body.error;
    return (typeof e === 'string' ? e : e?.message) ?? body.message ?? '';
  } catch {
    return '';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Base URL without a trailing slash. */
export function trimBase(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

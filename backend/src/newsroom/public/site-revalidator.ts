import { createHmac } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';

/// Changes inside this window go out as one refresh.
const DEBOUNCE_MS = 1_000;
const RETRY_DELAYS_MS = [2_000, 10_000];
const TIMEOUT_MS = 5_000;

/** Header names shared with the website's /api/revalidate route. */
export const REVALIDATE_TIMESTAMP_HEADER = 'x-sv-timestamp';
export const REVALIDATE_SIGNATURE_HEADER = 'x-sv-signature';

/** Hex HMAC-SHA256 of `${timestamp}.${body}` under the shared site key. */
export function revalidateSignature(
  key: string,
  timestamp: string,
  body: string,
): string {
  return createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex');
}

/**
 * Asks the website (stockvirtue.com) to refresh its news pages after a
 * publish, unpublish or edit, so readers see the change within seconds rather
 * than at the pages' own 30-second refresh. Calls are coalesced, signed with
 * SITE_ADMIN_KEY and retried; a failure only delays the refresh and never
 * fails the editor's action. Runs in both the API and the worker.
 */
@Injectable()
export class SiteRevalidator implements OnModuleDestroy {
  private readonly logger = new Logger(SiteRevalidator.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly reasons = new Set<string>();
  private readonly tags = new Set<string>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Queue a refresh of the website's pages that use these cache tags: "news"
   * (stories and listings) or "market" (ticker and market widgets).
   */
  schedule(reason: string, tags: readonly string[] = ['news']): void {
    const { adminKey, revalidateUrl } = this.config.get('site', {
      infer: true,
    });
    if (!adminKey || !revalidateUrl) return;
    this.reasons.add(reason);
    for (const tag of tags) this.tags.add(tag);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const reasons = [...this.reasons];
      const tagList = [...this.tags];
      this.reasons.clear();
      this.tags.clear();
      void this.send(reasons, tagList, 0);
    }, DEBOUNCE_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private async send(
    reasons: string[],
    tags: string[],
    attempt: number,
  ): Promise<void> {
    const { adminKey, revalidateUrl } = this.config.get('site', {
      infer: true,
    });
    const body = JSON.stringify({ tags, reasons: reasons.slice(0, 20) });
    const timestamp = String(Date.now());
    try {
      const res = await fetch(revalidateUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [REVALIDATE_TIMESTAMP_HEADER]: timestamp,
          [REVALIDATE_SIGNATURE_HEADER]: revalidateSignature(
            adminKey,
            timestamp,
            body,
          ),
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        this.logger.warn(
          `Website refresh failed (${(err as Error).message}); news pages will update at their next 30-second refresh.`,
        );
        return;
      }
      setTimeout(
        () => void this.send(reasons, tags, attempt + 1),
        delay,
      ).unref();
    }
  }
}

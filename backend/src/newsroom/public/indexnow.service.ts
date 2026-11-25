import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { readConfig, SearchConfig } from '../../site/site-config';

/**
 * Instant search-engine & news-publisher notifications when stories go live
 * or change:
 * 1. IndexNow (`https://api.indexnow.org/indexnow`) — notifies Bing, Yandex,
 *    Naver, Seznam, Yep and participating engines. Key verification is served
 *    by the Next.js site at `/{key}.txt`.
 * 2. WebSub / PubSubHubbub — pings Google's hub and Superfeedr with
 *    `/news/feed.xml` so Google News/Discover, Flipboard, Feedly and other
 *    news aggregators pick up new stories within seconds.
 *
 * Calls are best-effort and never throw or block editorial actions.
 *
 * @see https://www.indexnow.org/documentation
 * @see https://www.w3.org/TR/websub/
 */

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const WEBSUB_HUBS = [
  'https://pubsubhubbub.appspot.com/',
  'https://pubsubhubbub.superfeedr.com/',
] as const;
const TIMEOUT_MS = 10_000;
const SINGLETON = 'singleton';

@Injectable()
export class IndexNowService {
  private readonly logger = new Logger(IndexNowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Notify search engines and news hubs for a published/updated article. */
  async submitArticle(slug: string): Promise<void> {
    if (!slug) return;
    await this.submitPaths([`/news/${slug}`]);
  }

  /** Submit one or more site-relative paths using the configured publicUrl. */
  async submitPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const base = this.config
      .get('site', { infer: true })
      .publicUrl.replace(/\/+$/, '');
    const urls = paths.map((p) =>
      p.startsWith('/') ? `${base}${p}` : `${base}/${p}`,
    );

    const search = await this.loadSearchConfig();
    if (!search || search.noindex) return;

    await Promise.allSettled([
      this.submitIndexNow(urls, search),
      this.pingWebSub(`${base}/news/feed.xml`, search),
    ]);
  }

  /**
   * Submit one or more absolute URLs directly to IndexNow.
   * Best-effort: errors are logged but never thrown.
   */
  async submit(urls: string[]): Promise<void> {
    if (urls.length === 0) return;
    const search = await this.loadSearchConfig();
    if (!search || search.noindex) return;
    await this.submitIndexNow(urls, search);
  }

  private async loadSearchConfig(): Promise<SearchConfig | null> {
    try {
      const row = await this.prisma.siteSetting.findUnique({
        where: { id: SINGLETON },
        select: { config: true },
      });
      return readConfig(row?.config).search;
    } catch (err) {
      this.logger.warn(
        `Failed to read site search config: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async submitIndexNow(
    urls: string[],
    search: SearchConfig,
  ): Promise<void> {
    if (!search.indexNowEnabled || !search.indexNowApiKey) return;
    const host = this.hostFrom(urls[0]);
    if (!host) return;

    try {
      const body = JSON.stringify({
        host,
        key: search.indexNowApiKey,
        keyLocation: `https://${host}/${search.indexNowApiKey}.txt`,
        urlList: urls.slice(0, 10_000), // IndexNow accepts up to 10 000 URLs per call
      });

      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok || res.status === 202) {
        this.logger.log(
          `IndexNow: submitted ${urls.length} URL(s) → ${res.status}`,
        );
      } else {
        this.logger.warn(
          `IndexNow: ${res.status} ${res.statusText} for ${urls.length} URL(s)`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `IndexNow submission failed: ${(err as Error).message}`,
      );
    }
  }

  private async pingWebSub(
    feedUrl: string,
    search: SearchConfig,
  ): Promise<void> {
    if (!search.websubEnabled) return;
    const body = new URLSearchParams({
      'hub.mode': 'publish',
      'hub.url': feedUrl,
    }).toString();

    await Promise.allSettled(
      WEBSUB_HUBS.map(async (hub) => {
        try {
          const res = await fetch(hub, {
            method: 'POST',
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
            },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (res.ok || res.status === 204) {
            this.logger.log(`WebSub pinged ${hub} → ${res.status}`);
          } else {
            this.logger.warn(`WebSub ${hub}: ${res.status} ${res.statusText}`);
          }
        } catch (err) {
          this.logger.warn(
            `WebSub ping to ${hub} failed: ${(err as Error).message}`,
          );
        }
      }),
    );
  }

  /** Extract the hostname from a URL, or null. */
  private hostFrom(url: string): string | null {
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }
}

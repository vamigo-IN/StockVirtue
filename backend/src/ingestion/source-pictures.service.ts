import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsSourceItem } from '@prisma/client';
import { AuditActor } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { MediaService } from '../newsroom/media/media.service';
import { NEWSROOM_USER_AGENT, safeFetch } from './safe-fetch';

const IMAGE_ACCEPT =
  'image/avif, image/webp, image/png, image/jpeg, image/gif;q=0.9, */*;q=0.5';

/** A file name for the library, from the address the picture came from. */
function fileName(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return decodeURIComponent(last ?? '') || 'picture';
  } catch {
    return 'picture';
  }
}

/**
 * Pictures for stories made from incoming items. An item only has one when
 * its source's licence covers pictures (`useImages`, full-text sources); it
 * is fetched as safely as the feed itself and goes into the media library
 * credited to the source. Never throws: a story simply goes without.
 */
@Injectable()
export class SourcePicturesService {
  private readonly logger = new Logger(SourcePicturesService.name);

  constructor(
    private readonly media: MediaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** The media library asset for the item's picture, or null. */
  async forItem(
    item: Pick<NewsSourceItem, 'id' | 'imageUrl' | 'title' | 'attribution'>,
    actor: AuditActor,
  ): Promise<string | null> {
    if (!item.imageUrl) return null;
    try {
      const res = await safeFetch(item.imageUrl, {
        headers: { accept: IMAGE_ACCEPT, 'user-agent': NEWSROOM_USER_AGENT },
        timeoutMs: 15_000,
        maxBytes: this.media.maxImportBytes,
        privateHosts: this.config.get('newsroom', { infer: true })
          .ingestPrivateHosts,
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const asset = await this.media.importImage(res.body, {
        name: fileName(res.url),
        alt: item.title,
        credit: item.attribution,
        actor,
      });
      return asset.id;
    } catch (err) {
      this.logger.warn(
        `No picture for item ${item.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaffStatus } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { escapeHtml, MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { RedisService } from '../redis/redis.service';

/** One email per source per half hour at most; the Incoming list has the rest. */
const QUIET_SECONDS = 30 * 60;
const MAX_RECIPIENTS = 50;

/**
 * Step 9 of ingestion: tell editors when a source they flagged ("Email
 * editors" on the source) delivers new items. Everyone else sees the count
 * on the Incoming news page.
 */
@Injectable()
export class EditorAlertsService {
  private readonly logger = new Logger(EditorAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async newItems(
    source: { id: string; name: string },
    items: { title: string }[],
  ): Promise<void> {
    if (items.length === 0) return;
    const first = await this.redis.client.set(
      `ingest:alert:${source.id}`,
      '1',
      'EX',
      QUIET_SECONDS,
      'NX',
    );
    if (!first) return;
    const editors = await this.prisma.staffProfile.findMany({
      where: {
        status: StaffStatus.ACTIVE,
        user: {
          roles: {
            some: {
              role: {
                OR: [
                  { key: SUPER_ADMIN },
                  { permissions: { some: { permissionKey: 'news.approve' } } },
                ],
              },
            },
          },
        },
      },
      select: { user: { select: { emailAlias: true } } },
      take: MAX_RECIPIENTS,
    });
    const to = [
      ...new Set(
        editors.map((e) => e.user.emailAlias).filter((e): e is string => !!e),
      ),
    ];
    if (to.length === 0) return;

    const n = items.length;
    const link = `${this.config.get('newsroom', { infer: true }).portalUrl}/inbox?source=${source.id}`;
    const list = items.slice(0, 5);
    const subject = `${n} new ${n === 1 ? 'item' : 'items'} from ${source.name}`;
    const html = [
      this.mail.para(
        `${escapeHtml(source.name)} delivered ${n} new ${n === 1 ? 'item' : 'items'} for the newsroom.`,
      ),
      this.mail.para(
        list.map((i) => `• ${escapeHtml(i.title)}`).join('<br>') +
          (n > list.length ? `<br>…and ${n - list.length} more.` : ''),
      ),
      this.mail.para(
        `<a href="${escapeHtml(link)}" style="font-weight:700;">Open Incoming news</a> to start a story or dismiss them. Nothing is published until an editor approves it.`,
      ),
    ].join('');
    const text = `${source.name} delivered ${n} new items:\n${list
      .map((i) => `- ${i.title}`)
      .join('\n')}\n\nOpen Incoming news: ${link}`;
    for (const address of to) {
      try {
        await this.mail.notify(address, subject, subject, html, text);
      } catch (err) {
        this.logger.warn(
          `Couldn't email the new-items alert: ${(err as Error).message}`,
        );
      }
    }
  }
}

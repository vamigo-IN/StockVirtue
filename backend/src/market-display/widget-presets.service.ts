import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { WidgetValidation } from '../newsroom/content/widget-validation.service';
import {
  cleanWidget,
  WIDGET_TYPES,
  WidgetConfigError,
  WidgetType,
} from '../newsroom/content/widget-registry';
import { NewsCache } from '../newsroom/public/news-cache';
import { PrismaService } from '../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';

export class CreateWidgetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsIn(WIDGET_TYPES)
  type!: WidgetType;

  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateWidgetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

/**
 * The saved-widget library: named widget settings that stories embed by
 * reference, so one edit (a market-wrap ticker, the standard F&O disclaimer)
 * updates every story using it. Each save is validated like an article's.
 */
@Injectable()
export class WidgetPresetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly validation: WidgetValidation,
    private readonly newsCache: NewsCache,
  ) {}

  async list() {
    const [rows, uses] = await Promise.all([
      this.prisma.marketWidget.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.usage(),
    ]);
    return rows.map((w) => ({ ...w, uses: uses.get(w.id) ?? 0 }));
  }

  async get(id: string) {
    const w = await this.prisma.marketWidget.findUnique({ where: { id } });
    if (!w) throw new NotFoundException('Saved widget not found.');
    const uses = await this.usage([id]);
    return { ...w, uses: uses.get(id) ?? 0 };
  }

  /** Stories (drafts included) embedding each saved widget. */
  private async usage(ids?: string[]): Promise<Map<string, number>> {
    const pairs = await this.prisma.newsWidgetInstance.groupBy({
      by: ['widgetId', 'articleId'],
      where: { widgetId: ids ? { in: ids } : { not: null } },
    });
    const uses = new Map<string, number>();
    for (const p of pairs) {
      if (p.widgetId) uses.set(p.widgetId, (uses.get(p.widgetId) ?? 0) + 1);
    }
    return uses;
  }

  async create(
    actor: StaffPrincipal,
    dto: CreateWidgetDto,
    client: ClientInfo,
  ) {
    const clean = await this.cleanAndCheck(dto.type, dto.config);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.marketWidget.create({
        data: {
          name: dto.name.trim(),
          type: clean.widget,
          version: clean.v,
          config: clean.config as Prisma.InputJsonValue,
          symbols: this.validation.symbolsOf(clean),
          createdById: actor.staffId,
          updatedById: actor.staffId,
        },
      });
      await this.log(tx, actor, 'widget.create', created.id, client, {
        name: created.name,
        type: created.type,
      });
      return created;
    });
    return this.get(row.id);
  }

  async update(
    actor: StaffPrincipal,
    id: string,
    dto: UpdateWidgetDto,
    client: ClientInfo,
  ) {
    const before = await this.get(id);
    const clean = dto.config
      ? await this.cleanAndCheck(before.type, dto.config)
      : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.marketWidget.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(clean
            ? {
                version: clean.v,
                config: clean.config as Prisma.InputJsonValue,
                symbols: this.validation.symbolsOf(clean),
              }
            : {}),
          updatedById: actor.staffId,
        },
      });
      await this.log(tx, actor, 'widget.update', id, client, {
        name: dto.name?.trim() ?? before.name,
        config: clean ? 'changed' : 'unchanged',
      });
    });
    // Every story embedding it now shows the new version.
    if (clean && before.uses > 0)
      await this.newsCache.invalidate('saved widget');
    return this.get(id);
  }

  async remove(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const before = await this.get(id);
    if (before.uses > 0) {
      throw new ConflictException(
        `This widget is in ${before.uses} ${before.uses === 1 ? 'story' : 'stories'}. Remove it from ${before.uses === 1 ? 'that story' : 'them'} first.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.marketWidget.delete({ where: { id } });
      await this.log(tx, actor, 'widget.delete', id, client, {
        name: before.name,
        type: before.type,
      });
    });
  }

  private async cleanAndCheck(type: unknown, config: unknown) {
    let clean: ReturnType<typeof cleanWidget>;
    try {
      clean = cleanWidget(type, config);
    } catch (err) {
      if (err instanceof WidgetConfigError)
        throw new BadRequestException(err.message);
      throw err;
    }
    await this.validation.check([
      { widget: clean.widget, config: clean.config },
    ]);
    return clean;
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: StaffPrincipal,
    action: string,
    id: string,
    client: ClientInfo,
    after: Prisma.InputJsonValue,
  ) {
    return this.audit.record(
      {
        actor: { userId: actor.userId, email: actor.email },
        action,
        entityType: 'MarketWidget',
        entityId: id,
        after,
        ...client,
      },
      tx,
    );
  }
}

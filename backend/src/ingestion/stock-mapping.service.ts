import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { AliasDto } from './ingestion.dto';
import { DEFAULT_ALIASES, phraseKey } from './stock-matcher';
import { StockMatcherService } from './stock-matcher.service';

/**
 * Stock mapping (portal): how headlines are matched to listed companies.
 * Company names and NSE tickers match on their own; aliases add nicknames
 * ("RIL") and block phrases that only look like a company.
 */
@Injectable()
export class StockMappingService implements OnModuleInit {
  private readonly logger = new Logger(StockMappingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: CompanyDirectoryService,
    private readonly matcher: StockMatcherService,
    private readonly audit: AuditService,
  ) {}

  /** First boot: the starting aliases (only into an empty table, so deletions stick). */
  async onModuleInit(): Promise<void> {
    try {
      if ((await this.prisma.newsStockAlias.count()) > 0) return;
      await this.prisma.newsStockAlias.createMany({
        data: DEFAULT_ALIASES.map((a) => ({
          alias: phraseKey(a.label),
          label: a.label,
          exchange: a.symbol ? 'NSE' : null,
          symbol: a.symbol,
          createdBy: 'StockVirtue',
        })),
        skipDuplicates: true,
      });
    } catch (err) {
      this.logger.warn(
        `Couldn't add the starting stock aliases: ${(err as Error).message}`,
      );
    }
  }

  async list() {
    const rows = await this.prisma.newsStockAlias.findMany({
      orderBy: { label: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      phrase: r.label,
      exchange: r.exchange,
      symbol: r.symbol,
      company: r.symbol ? this.directory.nameFor(r.symbol) : null,
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));
  }

  async create(actor: StaffPrincipal, dto: AliasDto, client: ClientInfo) {
    const alias = phraseKey(dto.phrase);
    if (alias.replace(/\s/g, '').length < 2) {
      throw new BadRequestException(
        'The phrase needs at least two letters or digits.',
      );
    }
    const symbol = dto.symbol ? dto.symbol.trim().toUpperCase() : null;
    if (symbol && !this.directory.nameFor(symbol)) {
      throw new BadRequestException(`${symbol} isn’t an NSE-listed company.`);
    }
    const clash = await this.prisma.newsStockAlias.findUnique({
      where: { alias },
    });
    if (clash) {
      throw new ConflictException(
        `“${clash.label}” is already in the stock mapping.`,
      );
    }
    const row = await this.prisma.newsStockAlias.create({
      data: {
        alias,
        label: dto.phrase.trim().slice(0, 80),
        exchange: symbol ? 'NSE' : null,
        symbol,
        note: dto.note?.trim() || null,
        createdBy: actor.displayName,
      },
    });
    this.matcher.invalidate();
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'news.stock_alias.create',
      entityType: 'NewsStockAlias',
      entityId: row.id,
      after: { phrase: row.label, symbol: row.symbol },
      ...client,
    });
    return (await this.list()).find((a) => a.id === row.id);
  }

  async remove(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const row = await this.prisma.newsStockAlias.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That alias no longer exists.');
    await this.prisma.newsStockAlias.delete({ where: { id } });
    this.matcher.invalidate();
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'news.stock_alias.delete',
      entityType: 'NewsStockAlias',
      entityId: id,
      before: { phrase: row.label, symbol: row.symbol },
      ...client,
    });
  }

  /** What the matcher finds in a headline, and why. */
  async test(text: string) {
    const matches = await this.matcher.match(text, 12);
    return { matches, companies: (await this.matcher.matcher()).size };
  }
}

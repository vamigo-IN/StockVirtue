import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MarketInstrument, MarketInstrumentKind, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { ScripMasterService } from '../market/scrip-master.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { MarketCache } from './market-cache';
import { MarketConfigService, SOURCE_KEY } from './market-config.service';
import { CreateInstrumentDto, UpdateInstrumentDto } from './market-config.dto';
import { MarketSnapshotService } from './market-snapshot.service';

/** The curated list can never grow past this: it is not an open price feed. */
export const MAX_ENABLED_INSTRUMENTS = 60;

type Seed = Pick<
  MarketInstrument,
  'kind' | 'exchange' | 'symbol' | 'name' | 'inTicker'
> & { unit?: string };

// One instrument per line: this is a table.
// prettier-ignore
const DEFAULTS: Seed[] = [
  { kind: 'INDEX', exchange: 'NSE', symbol: 'NIFTY', name: 'Nifty 50', inTicker: true },
  { kind: 'INDEX', exchange: 'BSE', symbol: 'SENSEX', name: 'Sensex', inTicker: true },
  { kind: 'INDEX', exchange: 'NSE', symbol: 'BANKNIFTY', name: 'Bank Nifty', inTicker: true },
  { kind: 'INDEX', exchange: 'NSE', symbol: 'NIFTY IT', name: 'Nifty IT', inTicker: true },
  { kind: 'INDEX', exchange: 'NSE', symbol: 'FINNIFTY', name: 'Nifty Financial Services', inTicker: true },
  { kind: 'INDEX', exchange: 'NSE', symbol: 'NIFTYNXT50', name: 'Nifty Next 50', inTicker: false },
  { kind: 'INDEX', exchange: 'NSE', symbol: 'INDIA VIX', name: 'India VIX', inTicker: false },
  { kind: 'STOCK', exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries', inTicker: true },
  { kind: 'STOCK', exchange: 'NSE', symbol: 'HDFCBANK', name: 'HDFC Bank', inTicker: true },
  { kind: 'STOCK', exchange: 'NSE', symbol: 'TCS', name: 'TCS', inTicker: true },
  { kind: 'STOCK', exchange: 'NSE', symbol: 'INFY', name: 'Infosys', inTicker: true },
  { kind: 'STOCK', exchange: 'NSE', symbol: 'ICICIBANK', name: 'ICICI Bank', inTicker: false },
  { kind: 'COMMODITY', exchange: 'MCX', symbol: 'GOLD', name: 'Gold', unit: '10 g', inTicker: true },
  { kind: 'COMMODITY', exchange: 'MCX', symbol: 'SILVER', name: 'Silver', unit: '1 kg', inTicker: true },
  { kind: 'COMMODITY', exchange: 'MCX', symbol: 'CRUDEOIL', name: 'Crude Oil', unit: '1 bbl', inTicker: true },
  { kind: 'COMMODITY', exchange: 'MCX', symbol: 'NATURALGAS', name: 'Natural Gas', unit: '1 mmBtu', inTicker: false },
  { kind: 'CURRENCY', exchange: 'CDS', symbol: 'USDINR', name: 'USD/INR', unit: '₹ per $1', inTicker: true },
  { kind: 'CURRENCY', exchange: 'CDS', symbol: 'EURINR', name: 'EUR/INR', unit: '₹ per €1', inTicker: false },
];

const KIND_EXCHANGES: Record<MarketInstrumentKind, readonly string[]> = {
  INDEX: ['NSE', 'BSE'],
  STOCK: ['NSE', 'BSE'],
  COMMODITY: ['MCX'],
  CURRENCY: ['CDS'],
};

/**
 * The curated instruments: what the ticker and the market widgets may show.
 * Seeded with sensible defaults on first boot; edited in the portal by
 * holders of `market.configure`.
 */
@Injectable()
export class InstrumentsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scripMaster: ScripMasterService,
    private readonly directory: CompanyDirectoryService,
    private readonly snapshot: MarketSnapshotService,
    private readonly cache: MarketCache,
    private readonly settings: MarketConfigService,
  ) {}

  async onModuleInit() {
    if ((await this.prisma.marketInstrument.count()) > 0) return;
    // The instruments reference the licence row, created by the same call
    // MarketConfigService's start hook makes (they run side by side).
    await this.settings.ensureSource();
    await this.prisma.marketInstrument.createMany({
      data: DEFAULTS.map((d, position) => ({
        ...d,
        position,
        sourceKey: SOURCE_KEY,
      })),
      skipDuplicates: true,
    });
    // Start hooks run side by side: make sure the feed sees the new list.
    await this.snapshot.reload();
  }

  list() {
    return this.prisma.marketInstrument.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { quote: { select: { ltp: true, asOf: true } } },
    });
  }

  async create(
    actor: StaffPrincipal,
    dto: CreateInstrumentDto,
    client: ClientInfo,
  ) {
    const symbol = dto.symbol.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!KIND_EXCHANGES[dto.kind].includes(dto.exchange)) {
      throw new BadRequestException(
        `${this.kindLabel(dto.kind)} come from ${KIND_EXCHANGES[dto.kind].join(' or ')}.`,
      );
    }
    this.assertListed(dto.kind, dto.exchange, symbol);
    await this.assertRoom();
    const last = await this.prisma.marketInstrument.findFirst({
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    let row: MarketInstrument;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.marketInstrument.create({
          data: {
            kind: dto.kind,
            exchange: dto.exchange,
            symbol,
            name: dto.name.trim(),
            unit: dto.unit?.trim() || null,
            inTicker: dto.inTicker ?? false,
            position: (last?.position ?? -1) + 1,
            sourceKey: SOURCE_KEY,
          },
        });
        await this.log(
          tx,
          actor,
          'market.instrument.create',
          created.id,
          client,
          undefined,
          {
            ref: `${dto.exchange}:${symbol}`,
            name: created.name,
          },
        );
        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `${dto.exchange}:${symbol} is already on the list.`,
        );
      }
      throw err;
    }
    await this.changed('instrument added');
    return row;
  }

  async update(
    actor: StaffPrincipal,
    id: string,
    dto: UpdateInstrumentDto,
    client: ClientInfo,
  ) {
    const before = await this.find(id);
    if (dto.isEnabled && !before.isEnabled) await this.assertRoom();
    const data = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit.trim() || null } : {}),
      ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
      ...(dto.inTicker !== undefined ? { inTicker: dto.inTicker } : {}),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.marketInstrument.update({ where: { id }, data });
      await this.log(
        tx,
        actor,
        'market.instrument.update',
        id,
        client,
        {
          name: before.name,
          isEnabled: before.isEnabled,
          inTicker: before.inTicker,
        },
        data,
      );
      return updated;
    });
    await this.changed('instrument changed');
    return row;
  }

  async remove(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const before = await this.find(id);
    // Stories name instruments by ref and are re-checked on every save, so
    // removing one in use would stop those stories saving. Off is safe.
    const ref = `${before.exchange}:${before.symbol}`;
    const [stories, saved] = await Promise.all([
      this.prisma.newsWidgetInstance.findMany({
        where: { symbols: { has: ref } },
        distinct: ['articleId'],
        select: { articleId: true },
      }),
      this.prisma.marketWidget.count({ where: { symbols: { has: ref } } }),
    ]);
    if (stories.length || saved) {
      const uses = [
        stories.length &&
          `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}`,
        saved && `${saved} saved ${saved === 1 ? 'widget' : 'widgets'}`,
      ]
        .filter(Boolean)
        .join(' and ');
      throw new ConflictException(
        `${before.name} is in widgets in ${uses}, so it can’t be removed. Switch it off instead; those widgets will say it isn’t available.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.marketInstrument.delete({ where: { id } });
      await this.log(tx, actor, 'market.instrument.delete', id, client, {
        ref: `${before.exchange}:${before.symbol}`,
        name: before.name,
      });
    });
    await this.changed('instrument removed');
  }

  async reorder(actor: StaffPrincipal, ids: string[], client: ClientInfo) {
    const rows = await this.prisma.marketInstrument.findMany({
      select: { id: true },
    });
    const known = new Set(rows.map((r) => r.id));
    if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
      throw new BadRequestException(
        'The list changed while you were ordering it. Reload and try again.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [position, id] of ids.entries()) {
        await tx.marketInstrument.update({ where: { id }, data: { position } });
      }
      await this.log(
        tx,
        actor,
        'market.instrument.reorder',
        null,
        client,
        undefined,
        {
          count: ids.length,
        },
      );
    });
    await this.changed('instruments reordered');
    return this.list();
  }

  /** Index / stock / commodity / currency names for the "add" pickers. */
  suggestions(kind: MarketInstrumentKind, q: string) {
    const term = q.trim().toUpperCase();
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException(
        'The stock list is still loading. Try again in a minute.',
      );
    }
    if (kind === 'STOCK') {
      return this.scripMaster.searchEquities(term, 'NSE', 10).map((i) => ({
        exchange: i.exchange,
        symbol: i.name,
        name: this.directory.nameFor(i.name) ?? i.name,
      }));
    }
    if (kind === 'INDEX') {
      return this.scripMaster
        .searchInstruments(term, 'NSE', 200)
        .concat(this.scripMaster.searchInstruments(term, 'BSE', 200))
        .filter(
          (i) => i.instrumentType === 'AMXIDX' || i.instrumentType === 'INDEX',
        )
        .slice(0, 12)
        .map((i) => ({ exchange: i.exchange, symbol: i.name, name: i.symbol }));
    }
    const exchange = kind === 'COMMODITY' ? 'MCX' : 'CDS';
    const names =
      kind === 'CURRENCY'
        ? ['USDINR', 'EURINR', 'GBPINR', 'JPYINR']
        : [
            'GOLD',
            'GOLDM',
            'SILVER',
            'SILVERM',
            'CRUDEOIL',
            'CRUDEOILM',
            'NATURALGAS',
            'COPPER',
            'ZINC',
            'ALUMINIUM',
            'LEAD',
            'NICKEL',
          ];
    return names
      .filter((n) => !term || n.includes(term))
      .filter((n) => this.scripMaster.getNearestFuture(n, exchange))
      .map((n) => ({ exchange, symbol: n, name: n }));
  }

  // ── Internals ──────────────────────────────────────────────────────

  private assertListed(
    kind: MarketInstrumentKind,
    exchange: 'NSE' | 'BSE' | 'MCX' | 'CDS',
    symbol: string,
  ) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException(
        'The stock list is still loading. Try again in a minute.',
      );
    }
    const inst =
      kind === 'STOCK'
        ? this.scripMaster.getEquity(symbol, exchange)
        : kind === 'INDEX'
          ? this.scripMaster.getInstrument(symbol, exchange)
          : this.scripMaster.getNearestFuture(symbol, exchange);
    const isIndex =
      inst &&
      (inst.instrumentType === 'AMXIDX' || inst.instrumentType === 'INDEX');
    if (!inst || (kind === 'INDEX' && !isIndex)) {
      throw new BadRequestException(
        `${exchange}:${symbol} isn’t a listed ${this.kindLabel(kind, true)}.`,
      );
    }
  }

  private async assertRoom() {
    const enabled = await this.prisma.marketInstrument.count({
      where: { isEnabled: true },
    });
    if (enabled >= MAX_ENABLED_INSTRUMENTS) {
      throw new ConflictException(
        `The list holds up to ${MAX_ENABLED_INSTRUMENTS} active instruments. Switch one off first.`,
      );
    }
  }

  private async find(id: string) {
    const row = await this.prisma.marketInstrument.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Instrument not found.');
    return row;
  }

  private kindLabel(kind: MarketInstrumentKind, one = false) {
    const labels = {
      INDEX: 'index',
      STOCK: 'stock',
      COMMODITY: 'commodity',
      CURRENCY: 'currency pair',
    };
    const label = labels[kind];
    if (one) return label;
    return {
      INDEX: 'Indices',
      STOCK: 'Stocks',
      COMMODITY: 'Commodities',
      CURRENCY: 'Currency pairs',
    }[kind];
  }

  private async changed(reason: string) {
    await this.snapshot.reload();
    await this.cache.invalidate(reason);
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: StaffPrincipal,
    action: string,
    entityId: string | null,
    client: ClientInfo,
    before?: Prisma.InputJsonValue,
    after?: Prisma.InputJsonValue,
  ) {
    return this.audit.record(
      {
        actor: { userId: actor.userId, email: actor.email },
        action,
        entityType: 'MarketInstrument',
        ...(entityId ? { entityId } : {}),
        ...(before ? { before } : {}),
        ...(after ? { after } : {}),
        ...client,
      },
      tx,
    );
  }
}

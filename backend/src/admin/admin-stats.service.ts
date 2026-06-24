import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paiseToRupees } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /// One call → everything the dashboard's hero cards show. We bundle
  /// the queries in Promise.all so the page renders in a single DB
  /// round-trip group rather than serial waits.
  async getOverview() {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const startOfTodayIst = istStartOfDay(now);
    const startOfWeek = new Date(now.getTime() - 7 * day);
    const last24h = new Date(now.getTime() - day);

    const [
      totalUsers,
      newToday,
      newThisWeek,
      activeUsers,
      blockedUsers,
      ordersToday,
      filledToday,
      pendingOrders,
      cancelledOrders,
      feesAgg,
      walletAgg,
      positionsCount,
      activeRooms,
      tournaments,
      referralCount,
      lastSnapshot,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: startOfTodayIst } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: last24h } } }),
      this.prisma.user.count({ where: { status: 'BLOCKED' } }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfTodayIst } } }),
      this.prisma.order.count({
        where: { status: 'FILLED', filledAt: { gte: startOfTodayIst } },
      }),
      this.prisma.order.count({ where: { status: 'PENDING' } }),
      this.prisma.order.count({
        where: { status: 'CANCELLED', createdAt: { gte: startOfTodayIst } },
      }),
      this.prisma.order.aggregate({
        where: { status: 'FILLED' },
        _sum: { feesP: true },
      }),
      this.prisma.wallet.aggregate({
        _sum: { balanceP: true, marginReservedP: true, reservedP: true },
      }),
      this.prisma.position.count({ where: { quantity: { not: 0 } } }),
      this.prisma.room.count(),
      this.prisma.room.count({
        where: { isTournament: true, endsAt: { gt: now } },
      }),
      this.prisma.user.count({ where: { referredById: { not: null } } }),
      this.prisma.portfolioSnapshot.findFirst({
        orderBy: { asOfDate: 'desc' },
        select: { asOfDate: true, createdAt: true },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        newToday,
        newThisWeek,
        active24h: activeUsers,
        blocked: blockedUsers,
      },
      orders: {
        today: ordersToday,
        filledToday,
        pending: pendingOrders,
        cancelledToday: cancelledOrders,
      },
      money: {
        totalCash: paiseToRupees(walletAgg._sum.balanceP ?? 0n),
        totalReserved: paiseToRupees(
          (walletAgg._sum.reservedP ?? 0n) +
            (walletAgg._sum.marginReservedP ?? 0n),
        ),
        lifetimeFees: paiseToRupees(feesAgg._sum.feesP ?? 0n),
      },
      activity: {
        openPositions: positionsCount,
        rooms: activeRooms,
        liveTournaments: tournaments,
        referralsCompleted: referralCount,
      },
      lastSnapshot,
    };
  }

  /// Paginated user list with optional search by phone / email / name
  /// / referralCode. Used by /admin/users.
  async listUsers(opts: { page?: number; q?: string }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = 25;
    const q = opts.q?.trim() ?? '';
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { displayName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { emailAlias: { contains: q.toLowerCase() } },
            { referralCode: { equals: q.toUpperCase() } },
            { id: { equals: q } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          wallet: { select: { balanceP: true } },
          _count: { select: { orders: true, positions: true, referrals: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      q,
      rows: rows.map((u) => ({
        id: u.id,
        phone: u.phone,
        email: u.emailAlias,
        displayName: u.displayName,
        status: u.status,
        referralCode: u.referralCode,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        balance: u.wallet ? paiseToRupees(u.wallet.balanceP) : 0,
        orderCount: u._count.orders,
        positionCount: u._count.positions,
        referralCount: u._count.referrals,
      })),
    };
  }

  /// Full picture for one user — drives /admin/users/:id. We assemble
  /// the response explicitly (rather than spreading the Prisma row)
  /// because the include shape doesn't flow through `...user` when the
  /// caller iterates the response — keeps the view layer's types crisp.
  async getUserDetail(userId: string) {
    const [user, wallet, positions, orders, referrals, rooms] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          include: {
            referredBy: {
              select: { id: true, displayName: true, emailAlias: true },
            },
          },
        }),
        this.prisma.wallet.findUnique({ where: { userId } }),
        this.prisma.position.findMany({
          where: { userId },
          orderBy: { openedAt: 'desc' },
        }),
        this.prisma.order.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        this.prisma.user.count({ where: { referredById: userId } }),
        this.prisma.roomMember.count({ where: { userId } }),
      ]);
    if (!user) return null;
    return {
      id: user.id,
      phone: user.phone,
      emailAlias: user.emailAlias,
      displayName: user.displayName,
      status: user.status,
      referralCode: user.referralCode,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      referredBy: user.referredBy
        ? {
            id: user.referredBy.id,
            displayName: user.referredBy.displayName,
            email: user.referredBy.emailAlias,
          }
        : null,
      balanceRupees: wallet ? paiseToRupees(wallet.balanceP) : 0,
      reservedRupees: wallet ? paiseToRupees(wallet.reservedP) : 0,
      marginRupees: wallet ? paiseToRupees(wallet.marginReservedP) : 0,
      positionsPretty: positions.map((p) => ({
        symbol: p.symbol,
        exchange: p.exchange,
        product: p.product,
        quantity: p.quantity,
        avgPrice: paiseToRupees(p.avgPriceP),
        realizedPnL: paiseToRupees(p.realizedPnLP),
        openedAt: p.openedAt.toISOString(),
      })),
      ordersPretty: orders.map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side as string,
        type: o.type as string,
        product: o.product as string,
        status: o.status as string,
        quantity: o.quantity,
        fillPrice: o.fillPriceP ? paiseToRupees(o.fillPriceP) : null,
        limitPrice: o.limitPriceP ? paiseToRupees(o.limitPriceP) : null,
        fees: paiseToRupees(o.feesP),
        createdAt: o.createdAt.toISOString(),
      })),
      referralsCount: referrals,
      roomsCount: rooms,
    };
  }

  /// Recent orders feed — /admin/trading.
  async listRecentOrders(opts: { status?: string; limit?: number }) {
    const limit = Math.min(opts.limit ?? 100, 500);
    const where: Prisma.OrderWhereInput = {};
    if (opts.status && opts.status !== 'ALL') {
      where.status = opts.status as Prisma.OrderWhereInput['status'];
    }
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, displayName: true, phone: true } },
      },
    });
    return orders.map((o) => ({
      id: o.id,
      userName: o.user.displayName ?? o.user.phone ?? o.userId.slice(0, 8),
      userId: o.userId,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      product: o.product,
      status: o.status,
      quantity: o.quantity,
      fillPrice: o.fillPriceP ? paiseToRupees(o.fillPriceP) : null,
      limitPrice: o.limitPriceP ? paiseToRupees(o.limitPriceP) : null,
      fees: paiseToRupees(o.feesP),
      createdAt: o.createdAt.toISOString(),
      filledAt: o.filledAt?.toISOString() ?? null,
    }));
  }

  /// Toggle a user's status between ACTIVE and BLOCKED. BLOCKED is a
  /// soft state — the user can still hold positions and see their
  /// portfolio, but JwtAuthGuard's `findById` returns null when status
  /// isn't ACTIVE so login + every authed endpoint 401s. The mobile
  /// client treats that as "your session expired" → forces re-auth →
  /// PhoneScreen blocks further progress because the user row's
  /// status flags can't be flipped via the user-facing API.
  async setUserBlocked(userId: string, blocked: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: blocked ? 'BLOCKED' : 'ACTIVE' },
    });
  }

  /// All rooms with member counts — /admin/rooms.
  async listRooms() {
    const rooms = await this.prisma.room.findMany({
      orderBy: [{ isTournament: 'desc' }, { createdAt: 'desc' }],
      include: {
        owner: { select: { displayName: true, phone: true } },
        _count: { select: { members: true } },
      },
    });
    return rooms.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isPublic: r.isPublic,
      isTournament: r.isTournament,
      memberCount: r._count.members,
      maxMembers: r.maxMembers,
      ownerName: r.owner.displayName ?? r.owner.phone ?? 'Unknown',
      startsAt: r.startsAt?.toISOString() ?? null,
      endsAt: r.endsAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /// Top referrers — /admin/referrals. Aggregates by referredById and
  /// joins back to the User row for the display name.
  async topReferrers(limit = 50) {
    const grouped = await this.prisma.user.groupBy({
      by: ['referredById'],
      where: { referredById: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { referredById: 'desc' } },
      take: limit,
    });
    if (grouped.length === 0) return [];
    const referrerIds = grouped
      .map((g) => g.referredById)
      .filter((id): id is string => id != null);
    const referrers = await this.prisma.user.findMany({
      where: { id: { in: referrerIds } },
      select: {
        id: true,
        displayName: true,
        phone: true,
        emailAlias: true,
        referralCode: true,
      },
    });
    const byId = new Map(referrers.map((r) => [r.id, r]));
    return grouped.map((g) => {
      const r = g.referredById != null ? byId.get(g.referredById) : null;
      return {
        userId: g.referredById!,
        displayName: r?.displayName ?? r?.phone ?? 'Unknown',
        email: r?.emailAlias ?? null,
        referralCode: r?.referralCode ?? null,
        count: g._count._all,
      };
    });
  }
}

/// Start of today in IST (midnight 00:00 local), returned as UTC Date.
/// Matches the timezone the snapshot job + the mobile market-hours
/// helper use so "today" is consistent across the dashboard.
function istStartOfDay(now: Date): Date {
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(now.getTime() + istOffsetMs);
  const midnightIst = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate(),
  );
  return new Date(midnightIst - istOffsetMs);
}

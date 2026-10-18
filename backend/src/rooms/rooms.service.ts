import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AchievementsService } from '../achievements/achievements.service';
import { paiseToRupees } from '../common/money';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';

interface CreateRoomInput {
  name: string;
  description?: string | null;
  isPublic: boolean;
  isTournament: boolean;
  startsAt?: string | null; // ISO timestamp
  endsAt?: string | null;
  maxMembers?: number | null;
}

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolio: PortfolioService,
    private readonly achievements: AchievementsService,
  ) {}

  /// Creates a room and adds the owner as the first member with their
  /// current totalEquity snapshotted as the baseline. Codes are random
  /// 6-char strings from a confusables-free alphabet (no 0/O, 1/I/L);
  /// we retry on the unique-index collision until one lands free.
  async create(userId: string, input: CreateRoomInput) {
    const name = input.name?.trim();
    if (!name || name.length < 3 || name.length > 60) {
      throw new BadRequestException('Room name must be 3–60 characters');
    }
    if (input.isTournament) {
      if (!input.startsAt || !input.endsAt) {
        throw new BadRequestException(
          'Tournament rooms require startsAt and endsAt',
        );
      }
      const s = new Date(input.startsAt);
      const e = new Date(input.endsAt);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        throw new BadRequestException('Invalid startsAt / endsAt');
      }
      if (e.getTime() <= s.getTime()) {
        throw new BadRequestException('endsAt must be after startsAt');
      }
      // startsAt must be in the future (allow 1 min of clock skew). Otherwise
      // the join-window gate immediately rejects everyone, creating a
      // tournament nobody but the owner can ever enter.
      if (s.getTime() <= Date.now() - 60_000) {
        throw new BadRequestException('startsAt must be in the future');
      }
    }
    const max = input.maxMembers ?? 0;
    if (max < 0 || max > 1000) {
      throw new BadRequestException('maxMembers out of range');
    }

    const baseline = await this.portfolio.computeTotalsP(userId);

    // Retry up to 5x; the alphabet is 32 chars over 6 positions = ~1B
    // codes, so collisions are vanishingly rare even with many rooms.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateCode();
      try {
        const room = await this.prisma.room.create({
          data: {
            code,
            name,
            description: input.description?.trim() || null,
            ownerId: userId,
            isPublic: input.isPublic,
            isTournament: input.isTournament,
            startsAt: input.startsAt ? new Date(input.startsAt) : null,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            maxMembers: max,
            members: {
              create: {
                userId,
                baselineEquityP: baseline.totalEquityP,
              },
            },
          },
          include: { _count: { select: { members: true } } },
        });
        return this.toListItem(room, baseline.totalEquityP);
      } catch (err) {
        if (this.isUniqueViolation(err, 'rooms_code_key')) continue;
        throw err;
      }
    }
    throw new BadRequestException(
      'Could not allocate a unique room code; please retry',
    );
  }

  /// Joins a private room by its invite code. The same baseline-snapshot
  /// rule applies as for create. Tournament joiners are rejected once the
  /// tournament's start time has passed — the ladder must be fair.
  async joinByCode(userId: string, codeRaw: string) {
    const code = codeRaw?.trim().toUpperCase();
    if (!code || code.length !== 6) {
      throw new BadRequestException('Invite code must be exactly 6 characters');
    }
    const room = await this.prisma.room.findUnique({
      where: { code },
      include: { _count: { select: { members: true } } },
    });
    if (!room) {
      throw new NotFoundException('No room found for that code');
    }
    return this.joinInternal(userId, room);
  }

  /// Joins a public room by id. Mirrors [joinByCode] but only succeeds
  /// when the room is publicly listed.
  async joinPublic(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { _count: { select: { members: true } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (!room.isPublic) {
      throw new ForbiddenException(
        'This room is private — ask the owner for the invite code',
      );
    }
    return this.joinInternal(userId, room);
  }

  private async joinInternal(
    userId: string,
    room: Prisma.RoomGetPayload<{
      include: { _count: { select: { members: true } } };
    }>,
  ) {
    // Tournament-window enforcement (re-validated under the lock below).
    if (
      room.isTournament &&
      room.startsAt &&
      Date.now() >= room.startsAt.getTime()
    ) {
      throw new BadRequestException(
        'Tournament has already started — join window closed',
      );
    }

    // Idempotent fast-path — already a member, no lock needed.
    const already = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });
    if (already) {
      return this.toListItem(room, already.baselineEquityP);
    }

    // Compute the baseline OUTSIDE the transaction: it makes an external
    // SmartAPI quote call, and we must not hold the room row lock across a
    // network round-trip.
    const baseline = await this.portfolio.computeTotalsP(userId);

    // Capacity must be enforced atomically — without this lock, concurrent
    // joins on the last slot all read members < maxMembers and all insert,
    // blowing past maxMembers. Locking the room row serialises joins for this
    // room, so the count → check → insert is atomic.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "rooms" WHERE id = ${room.id} FOR UPDATE`;

      if (room.maxMembers > 0) {
        const count = await tx.roomMember.count({ where: { roomId: room.id } });
        if (count >= room.maxMembers) {
          throw new BadRequestException('Room is full');
        }
      }

      try {
        await tx.roomMember.create({
          data: {
            roomId: room.id,
            userId,
            baselineEquityP: baseline.totalEquityP,
          },
        });
      } catch (err) {
        // A concurrent duplicate join (raced past the fast-path) trips the
        // @@unique([roomId,userId]) — treat as idempotent success.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const existing = await tx.roomMember.findUnique({
            where: { roomId_userId: { roomId: room.id, userId } },
          });
          const c = await tx.roomMember.count({ where: { roomId: room.id } });
          return this.toListItem(
            { ...room, _count: { members: c } },
            existing?.baselineEquityP ?? baseline.totalEquityP,
          );
        }
        throw err;
      }

      const count = await tx.roomMember.count({ where: { roomId: room.id } });
      return this.toListItem(
        { ...room, _count: { members: count } },
        baseline.totalEquityP,
      );
    });
  }

  /// Drops a member from a room. Owners can't leave their own room — they
  /// must close it instead (DELETE /rooms/:id, not yet wired). Anyone
  /// else can leave at any time, even mid-tournament.
  async leave(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, ownerId: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.ownerId === userId) {
      throw new BadRequestException(
        'Owners cannot leave their own room — close it instead',
      );
    }
    await this.prisma.roomMember
      .delete({
        where: { roomId_userId: { roomId, userId } },
      })
      .catch(() => {
        throw new NotFoundException('You are not a member of this room');
      });
    return { ok: true };
  }

  /// Lists rooms the caller is a member of, plus rooms they own (which
  /// they're always a member of by construction). Each row carries the
  /// caller's baseline and current TRADING return % (bonus credits
  /// excluded) so the list screen renders the chip without a per-row request.
  async listMine(userId: string) {
    const memberships = await this.prisma.roomMember.findMany({
      where: { userId },
      include: {
        room: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    if (memberships.length === 0) return { rooms: [] };
    const earliest = memberships.reduce(
      (min, m) => (m.baselineAt < min ? m.baselineAt : min),
      memberships[0].baselineAt,
    );
    const [totals, credits] = await Promise.all([
      this.portfolio.computeTotalsP(userId),
      this.creditsSince([userId], earliest),
    ]);
    const now = new Date();
    return {
      rooms: memberships.map((m) => {
        const standing = this.standingOf(
          m,
          m.room,
          totals.totalEquityP,
          credits.get(userId) ?? [],
          now,
        );
        return {
          ...this.toListItem(m.room, m.baselineEquityP, true),
          joinedAt: m.joinedAt.toISOString(),
          phase: this.phaseOf(m.room, now),
          returnPct: standing.returnPct,
          bonusExcluded: paiseToRupees(standing.creditsP),
        };
      }),
    };
  }

  // ─── fair-return maths ───────────────────────────────────────────────

  /// Non-trading credits (referral bonuses, promos) for each user since
  /// `since`, oldest first. One query for the whole room.
  private async creditsSince(
    userIds: string[],
    since: Date,
  ): Promise<Map<string, { amountP: bigint; createdAt: Date }[]>> {
    const rows = await this.prisma.walletCredit.findMany({
      where: { userId: { in: userIds }, createdAt: { gte: since } },
      select: { userId: true, amountP: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const out = new Map<string, { amountP: bigint; createdAt: Date }[]>();
    for (const r of rows) {
      const list = out.get(r.userId) ?? [];
      list.push({ amountP: r.amountP, createdAt: r.createdAt });
      out.set(r.userId, list);
    }
    return out;
  }

  private phaseOf(
    room: { isTournament: boolean; startsAt: Date | null; endsAt: Date | null },
    now: Date,
  ): 'open' | 'upcoming' | 'live' | 'ended' {
    if (!room.isTournament) return 'open';
    if (room.startsAt && now < room.startsAt) return 'upcoming';
    if (room.endsAt && now >= room.endsAt) return 'ended';
    return 'live';
  }

  /// A member's standing in a room, measured on trading performance only:
  ///
  ///   change = equity − baseline − credits received since the baseline
  ///   return = change / baseline
  ///
  /// so a referral bonus that lands after you joined grows your balance but
  /// never your ranking. Tournaments score nothing before the start bell and
  /// use the equity captured at the final bell once finalized.
  private standingOf(
    member: {
      baselineEquityP: bigint;
      baselineAt: Date;
      finalEquityP: bigint | null;
      finalCreditsP: bigint | null;
    },
    room: { isTournament: boolean; startsAt: Date | null; endsAt: Date | null },
    liveEquityP: bigint,
    credits: { amountP: bigint; createdAt: Date }[],
    now: Date,
  ): { equityP: bigint; creditsP: bigint; changeP: bigint; returnPct: number } {
    const baselineP = member.baselineEquityP;
    const phase = this.phaseOf(room, now);
    if (phase === 'upcoming') {
      return { equityP: liveEquityP, creditsP: 0n, changeP: 0n, returnPct: 0 };
    }
    let equityP = liveEquityP;
    let creditsP: bigint;
    if (phase === 'ended' && member.finalEquityP !== null) {
      equityP = member.finalEquityP;
      creditsP = member.finalCreditsP ?? 0n;
    } else {
      const until = phase === 'ended' ? room.endsAt : null;
      creditsP = credits
        .filter(
          (c) =>
            c.createdAt >= member.baselineAt && (!until || c.createdAt < until),
        )
        .reduce((sum, c) => sum + c.amountP, 0n);
    }
    const changeP = equityP - baselineP - creditsP;
    const returnPct =
      baselineP === 0n ? 0 : (Number(changeP) / Number(baselineP)) * 100;
    return { equityP, creditsP, changeP, returnPct };
  }

  /// Browseable public rooms. Tournaments are surfaced first, then
  /// evergreen public rooms, both newest-first. Closed tournaments
  /// (endsAt in the past) drop off the list.
  async listPublic(opts: {
    tournament?: boolean;
    search?: string;
    callerId?: string;
  }) {
    const now = new Date();
    const where: Prisma.RoomWhereInput = {
      isPublic: true,
      OR: [
        { isTournament: false },
        { isTournament: true, endsAt: { gt: now } },
      ],
    };
    if (opts.tournament === true) {
      where.isTournament = true;
      delete where.OR;
      where.endsAt = { gt: now };
    } else if (opts.tournament === false) {
      where.isTournament = false;
      delete where.OR;
    }
    if (opts.search && opts.search.trim()) {
      where.name = { contains: opts.search.trim(), mode: 'insensitive' };
    }
    const rooms = await this.prisma.room.findMany({
      where,
      include: { _count: { select: { members: true } } },
      orderBy: [
        { isTournament: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 100,
    });
    // Which of these rooms the caller already belongs to — one query, so the
    // client can hide "Join" on rooms they've joined (or own).
    let joinedIds = new Set<string>();
    if (opts.callerId && rooms.length > 0) {
      const memberships = await this.prisma.roomMember.findMany({
        where: {
          userId: opts.callerId,
          roomId: { in: rooms.map((r) => r.id) },
        },
        select: { roomId: true },
      });
      joinedIds = new Set(memberships.map((m) => m.roomId));
    }
    return {
      rooms: rooms.map((r) =>
        this.toListItem(
          r,
          null,
          joinedIds.has(r.id) || r.ownerId === opts.callerId,
        ),
      ),
    };
  }

  /// Room detail + sorted leaderboard. The leaderboard call is the
  /// expensive bit — we walk every member's current portfolio totals via
  /// [PortfolioService.computeTotalsP] so we can rank by % return since
  /// each member's baseline. Membership is enforced for private rooms.
  async getDetail(roomId: string, callerId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        owner: { select: { id: true, displayName: true } },
        members: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!room) throw new NotFoundException('Room not found');

    const isMember = room.members.some((m) => m.userId === callerId);
    if (!room.isPublic && !isMember) {
      throw new ForbiddenException(
        'This room is private. Ask the owner for the invite code.',
      );
    }
    const now = new Date();
    const phase = this.phaseOf(room, now);
    // Tournament freeze: once finalized, every member's equity at the final
    // bell is stored and the ranking can no longer move.
    const frozen = phase === 'ended';
    const allFinal =
      frozen && room.members.every((m) => m.finalEquityP !== null);

    // ONE batched equity computation for the whole room (skipped entirely
    // when the tournament is finalized — the stored figures are the truth).
    const memberIds = room.members.map((m) => m.userId);
    const totalsMap = allFinal
      ? new Map<string, { totalEquityP: bigint }>()
      : await this.portfolio.computeTotalsForUsersP(memberIds);
    const earliest = room.members.reduce<Date | null>(
      (min, m) => (min === null || m.baselineAt < min ? m.baselineAt : min),
      null,
    );
    const credits =
      allFinal || earliest === null
        ? new Map<string, { amountP: bigint; createdAt: Date }[]>()
        : await this.creditsSince(memberIds, earliest);

    // Named rank per member (achievements unlocked + academy progress).
    const badgeTags = await this.achievements.badgeTagsFor(memberIds);

    const leaderboard = room.members
      .map((m) => {
        const liveP = totalsMap.get(m.userId)?.totalEquityP ?? m.baselineEquityP;
        const s = this.standingOf(m, room, liveP, credits.get(m.userId) ?? [], now);
        return {
          userId: m.userId,
          displayName: m.user.displayName ?? 'Trader',
          badgeTag: badgeTags.get(m.userId) ?? 'Rookie',
          baseline: paiseToRupees(m.baselineEquityP),
          // Account value right now (bonuses included)…
          current: paiseToRupees(s.equityP),
          // …but the score is trading P&L only.
          change: paiseToRupees(s.changeP),
          returnPct: s.returnPct,
          bonusExcluded: paiseToRupees(s.creditsP),
          joinedAt: m.joinedAt.toISOString(),
          isOwner: m.userId === room.ownerId,
          isYou: m.userId === callerId,
        };
      })
      .sort((a, b) => b.returnPct - a.returnPct)
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      id: room.id,
      code: room.code,
      name: room.name,
      description: room.description,
      ownerId: room.ownerId,
      ownerName: room.owner.displayName ?? 'Trader',
      isPublic: room.isPublic,
      isTournament: room.isTournament,
      startsAt: room.startsAt?.toISOString() ?? null,
      endsAt: room.endsAt?.toISOString() ?? null,
      maxMembers: room.maxMembers,
      memberCount: room.members.length,
      createdAt: room.createdAt.toISOString(),
      phase,
      frozen,
      iAmMember: isMember,
      leaderboard,
    };
  }

  /// Owner-only room deletion. CASCADE handles RoomMember rows so we
  /// don't need an explicit transaction.
  async close(userId: string, roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { ownerId: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can close this room');
    }
    await this.prisma.room.delete({ where: { id: roomId } });
    return { ok: true };
  }

  // ─── helpers ─────────────────────────────────────────────────────────

  private toListItem(
    room: Prisma.RoomGetPayload<{
      include: { _count: { select: { members: true } } };
    }>,
    myBaselineP: bigint | null,
    joined = false,
  ) {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      description: room.description,
      ownerId: room.ownerId,
      isPublic: room.isPublic,
      isTournament: room.isTournament,
      startsAt: room.startsAt?.toISOString() ?? null,
      endsAt: room.endsAt?.toISOString() ?? null,
      maxMembers: room.maxMembers,
      memberCount: room._count.members,
      createdAt: room.createdAt.toISOString(),
      // Whether the caller is already a member — lets the client hide the
      // "Join" button on rooms they've already joined (or own).
      joined,
      myBaseline:
        myBaselineP === null ? null : paiseToRupees(myBaselineP),
    };
  }

  /// 31-char alphabet drops 0/O/1/I/L to avoid invite-code copy mistakes.
  /// 6 chars over 31 = ~10^9 codes, ample headroom for any realistic
  /// concurrent room count. Uses `crypto.randomInt` so codes are
  /// cryptographically unpredictable — important because a leaked code
  /// is the only credential to enter a private room.
  private generateCode(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) {
      out += alphabet[randomInt(0, alphabet.length)];
    }
    return out;
  }

  private isUniqueViolation(err: unknown, target: string): boolean {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const meta = err.meta?.target;
      if (Array.isArray(meta) && meta.includes(target)) return true;
      if (typeof meta === 'string' && meta === target) return true;
    }
    return false;
  }
}

import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  /// caller's baseline and current return % so the list screen renders
  /// the leaderboard chip without a per-row request.
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
    const totals = await this.portfolio.computeTotalsP(userId);
    return {
      rooms: memberships.map((m) => ({
        ...this.toListItem(m.room, m.baselineEquityP, true),
        joinedAt: m.joinedAt.toISOString(),
        returnPct: this.returnPct(totals.totalEquityP, m.baselineEquityP),
      })),
    };
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
    // Tournament freeze: after endsAt the leaderboard is locked. We still
    // compute current equities (could change in another room), but the
    // ranking sort below treats them as final-frozen.
    const frozen =
      room.isTournament && room.endsAt && Date.now() >= room.endsAt.getTime();

    // Compute each member's current equity in parallel. Cheap because
    // each call hits the same SmartAPI multi-quote path which is already
    // batched per request internally.
    const totalsByUser = await Promise.all(
      room.members.map(async (m) => ({
        userId: m.userId,
        totals: await this.portfolio.computeTotalsP(m.userId),
      })),
    );
    const totalsMap = new Map(
      totalsByUser.map((t) => [t.userId, t.totals.totalEquityP]),
    );

    const leaderboard = room.members
      .map((m) => {
        const currentP = totalsMap.get(m.userId) ?? m.baselineEquityP;
        const baselineP = m.baselineEquityP;
        const changeP = currentP - baselineP;
        const pct =
          baselineP === 0n
            ? 0
            : (Number(changeP) / Number(baselineP)) * 100;
        return {
          userId: m.userId,
          displayName: m.user.displayName ?? 'Trader',
          baseline: paiseToRupees(baselineP),
          current: paiseToRupees(currentP),
          change: paiseToRupees(changeP),
          returnPct: pct,
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

  private returnPct(currentP: bigint, baselineP: bigint): number {
    if (baselineP === 0n) return 0;
    return (Number(currentP - baselineP) / Number(baselineP)) * 100;
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

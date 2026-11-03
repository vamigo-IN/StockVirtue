import {
  createHash,
  createHmac,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  PrivacyRequestStatus,
  PrivacyRequestType,
  User,
  UserStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { enforceRateLimit } from '../common/rate-limit';
import { AppConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { AccountErasureService } from './account-erasure.service';
import { PrivacyMail } from './privacy-mail';
import { newRequestReference } from './privacy-reference';
import { PrivacyService } from './privacy.service';
import {
  StaffRequestsQuery,
  UpdateRequestDto,
  WebRequestDto,
} from './privacy.dto';

const DAY_MS = 86_400_000;
const PAGE_SIZE = 30;
/// An emailed code proves the address for this long.
const CODE_TTL = 15 * 60;
const OPEN_STATES = [
  PrivacyRequestStatus.OPEN,
  PrivacyRequestStatus.IN_PROGRESS,
];

const REQUEST_SELECT = {
  id: true,
  reference: true,
  type: true,
  details: true,
  channel: true,
  status: true,
  name: true,
  email: true,
  phone: true,
  dueAt: true,
  response: true,
  respondedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      displayName: true,
      status: true,
      createdAt: true,
      eraseAfter: true,
    },
  },
  handledBy: { select: { id: true, displayName: true } },
} satisfies Prisma.PrivacyRequestSelect;

/**
 * Requests to exercise privacy rights, and grievances (DPDP Act s.11–14).
 * They come from the app, from the website (after an emailed code proves the
 * address) or from staff, get a reference and a due date inside the published
 * response time (never past 90 days, rule 14(3)), and are answered by email
 * from the newsroom portal. Every acknowledgement and answer names the
 * grievance officer (rule 9) and the right to complain to the Board.
 */
@Injectable()
export class PrivacyRequestsService {
  private readonly logger = new Logger(PrivacyRequestsService.name);
  private readonly mailer: PrivacyMail;
  private readonly codeKey: string;
  private readonly portalUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly privacy: PrivacyService,
    private readonly erasure: AccountErasureService,
    private readonly mail: MailService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.mailer = new PrivacyMail(mail, () => this.privacy.contact());
    this.codeKey = createHmac(
      'sha256',
      config.get('jwt', { infer: true }).accessSecret,
    )
      .update('stockvirtue:privacy:request-code:v1')
      .digest('hex');
    this.portalUrl = `${config.get('newsroom', { infer: true }).portalUrl}/privacy`;
  }

  // ── Taking requests ─────────────────────────────────────────────────

  /** From the app: the account is known and answers go to its email. */
  async createForUser(
    user: User,
    input: { type: PrivacyRequestType; details: string },
    client: ClientInfo,
  ) {
    await enforceRateLimit(
      this.redis.client,
      `privacy:requests:${user.id}`,
      10,
      24 * 3600,
      'You can send 10 requests a day. Write to the grievance officer if you need more.',
    );
    return this.create(
      {
        userId: user.id,
        name: user.displayName,
        email: user.emailAlias,
        phone: user.phone,
        type: input.type,
        details: input.details,
        channel: 'app',
      },
      client,
    );
  }

  listForUser(userId: string) {
    return this.prisma.privacyRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        reference: true,
        type: true,
        details: true,
        status: true,
        dueAt: true,
        response: true,
        respondedAt: true,
        createdAt: true,
      },
    });
  }

  /** Website, step 1: a 6-digit code to the address, to prove it is theirs. */
  async sendWebCode(email: string, client: ClientInfo) {
    await enforceRateLimit(
      this.redis.client,
      `privacy:code:ip:${client.ip ?? 'unknown'}`,
      10,
      15 * 60,
      'Too many requests from your connection. Try again in 15 minutes.',
    );
    const id = this.emailId(email);
    await enforceRateLimit(
      this.redis.client,
      `privacy:code:send:${id}`,
      3,
      10 * 60,
      'A code was just sent. Wait a few minutes before asking for another.',
    );
    const code = String(randomInt(100000, 1000000));
    await this.redis.client.set(
      `privacy:code:${id}`,
      this.codeHash(email, code),
      'EX',
      CODE_TTL,
    );
    await this.redis.client.del(`privacy:code:tries:${id}`);
    await this.mail.sendPrivacyCode(email, code, CODE_TTL);
    return { ok: true, ttl: CODE_TTL };
  }

  /** Website, step 2: the code, then the request itself. */
  async createFromWeb(dto: WebRequestDto, client: ClientInfo) {
    const id = this.emailId(dto.email);
    const tries = await this.redis.client.incr(`privacy:code:tries:${id}`);
    if (tries === 1) {
      await this.redis.client.expire(`privacy:code:tries:${id}`, CODE_TTL);
    }
    if (tries > 6) {
      throw new UnauthorizedException(
        'Too many wrong codes. Ask for a new code.',
      );
    }
    const stored = await this.redis.client.get(`privacy:code:${id}`);
    const given = this.codeHash(dto.email, dto.code);
    if (
      !stored ||
      stored.length !== given.length ||
      !timingSafeEqual(Buffer.from(stored), Buffer.from(given))
    ) {
      throw new UnauthorizedException(
        'That code is wrong or has expired. Ask for a new one.',
      );
    }
    await this.redis.client.del(
      `privacy:code:${id}`,
      `privacy:code:tries:${id}`,
    );
    const account = await this.prisma.user.findFirst({
      where: { emailAlias: dto.email, status: { not: UserStatus.DELETED } },
      select: { id: true, displayName: true, phone: true },
    });
    return this.create(
      {
        userId: account?.id ?? null,
        name: dto.name?.trim() || account?.displayName || null,
        email: dto.email,
        phone: account?.phone ?? null,
        type: dto.type,
        details: dto.details,
        channel: 'web',
      },
      client,
    );
  }

  private async create(
    r: {
      userId: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      type: PrivacyRequestType;
      details: string;
      channel: string;
    },
    client: ClientInfo,
  ) {
    const contact = await this.privacy.contact();
    const dueAt = new Date(Date.now() + contact.responseDays * DAY_MS);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.privacyRequest.create({
        data: {
          reference: await newRequestReference(tx),
          userId: r.userId,
          name: r.name,
          email: r.email,
          phone: r.phone,
          type: r.type,
          details: r.details,
          channel: r.channel,
          dueAt,
        },
      });
      await this.audit.record(
        {
          actor: { userId: r.userId, email: r.email },
          action: 'privacy.request.create',
          entityType: 'PrivacyRequest',
          entityId: row.id,
          after: { reference: row.reference, type: r.type, channel: r.channel },
          ...client,
        },
        tx,
      );
      return row;
    });
    if (r.email) {
      await this.mailer
        .requestReceived(r.email, {
          reference: created.reference,
          type: r.type,
          dueAt,
          name: r.name,
        })
        .catch((err: Error) =>
          this.logger.warn(`Request acknowledgement failed: ${err.message}`),
        );
    }
    await this.mailer
      .newRequestForOfficer({
        reference: created.reference,
        type: r.type,
        channel: r.channel,
        email: r.email,
        phone: r.phone,
        name: r.name,
        details: r.details,
        dueAt,
        portalUrl: this.portalUrl,
      })
      .catch((err: Error) =>
        this.logger.warn(`Grievance officer alert failed: ${err.message}`),
      );
    return {
      reference: created.reference,
      type: created.type,
      status: created.status,
      dueAt: created.dueAt,
      createdAt: created.createdAt,
    };
  }

  // ── Handling them (newsroom portal) ─────────────────────────────────

  async list(q: StaffRequestsQuery) {
    const page = q.page ?? 1;
    const where: Prisma.PrivacyRequestWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.overdue
        ? { status: { in: OPEN_STATES }, dueAt: { lt: new Date() } }
        : {}),
    };
    const [total, items, open, overdue] = await Promise.all([
      this.prisma.privacyRequest.count({ where }),
      this.prisma.privacyRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: REQUEST_SELECT,
      }),
      this.prisma.privacyRequest.count({
        where: { status: { in: OPEN_STATES } },
      }),
      this.prisma.privacyRequest.count({
        where: { status: { in: OPEN_STATES }, dueAt: { lt: new Date() } },
      }),
    ]);
    return {
      items,
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      counts: { open, overdue },
    };
  }

  async get(id: string) {
    const r = await this.prisma.privacyRequest.findUnique({
      where: { id },
      select: REQUEST_SELECT,
    });
    if (!r) throw new NotFoundException('That request no longer exists.');
    return r;
  }

  async update(
    actor: StaffPrincipal,
    id: string,
    dto: UpdateRequestDto,
    client: ClientInfo,
  ) {
    const before = await this.get(id);
    const closing =
      dto.status === PrivacyRequestStatus.RESOLVED ||
      dto.status === PrivacyRequestStatus.REJECTED;
    const response = dto.response?.trim() || null;
    if (closing && (!response || response.length < 5)) {
      throw new BadRequestException(
        'Write the answer the person will receive before closing the request.',
      );
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.privacyRequest.update({
        where: { id },
        data: {
          status: dto.status,
          handledById: actor.staffId,
          ...(response !== null ? { response } : {}),
          ...(closing ? { respondedAt: now } : {}),
        },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'privacy.request.update',
          entityType: 'PrivacyRequest',
          entityId: id,
          before: { status: before.status },
          after: { status: dto.status, answered: closing },
          ...client,
        },
        tx,
      );
    });
    if (closing && before.email && response) {
      await this.mailer
        .requestAnswered(before.email, {
          reference: before.reference,
          type: before.type,
          resolved: dto.status === PrivacyRequestStatus.RESOLVED,
          response,
          name: before.name,
        })
        .catch((err: Error) =>
          this.logger.warn(`Request answer email failed: ${err.message}`),
        );
    }
    return this.get(id);
  }

  /** An erasure request from someone whose account we matched: deletes it. */
  async eraseAccount(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const r = await this.get(id);
    if (!r.user || r.user.status === UserStatus.DELETED) {
      throw new BadRequestException(
        'There is no active account linked to this request. Check the person’s details, then answer them without deleting anything.',
      );
    }
    await this.erasure.deleteAccount(r.user.id, {
      source: 'staff',
      actor: { userId: actor.userId, email: actor.email },
      requestId: r.id,
      ip: client.ip,
      userAgent: client.userAgent,
    });
    await this.prisma.privacyRequest.update({
      where: { id },
      data: { handledById: actor.staffId },
    });
    return this.get(id);
  }

  /** The data of the linked account, to answer an access request. */
  async exportAccount(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const r = await this.get(id);
    if (!r.user) {
      throw new BadRequestException(
        'There is no account linked to this request.',
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: r.user.id },
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'privacy.request.export',
      entityType: 'PrivacyRequest',
      entityId: id,
      after: { reference: r.reference },
      ...client,
    });
    return this.privacy.export(user);
  }

  private emailId(email: string): string {
    return createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
  }

  private codeHash(email: string, code: string): string {
    return createHmac('sha256', this.codeKey)
      .update(`${email.trim().toLowerCase()}:${code}`)
      .digest('hex');
  }
}

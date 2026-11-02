import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiJobStatus,
  AiProvider,
  AiProviderKind,
  AiTask,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SecretBoxService, SecretUnreadableError } from '../common/secret-box';
import { PrismaService } from '../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { TASK_ORDER, taskDef } from './ai-tasks';
import {
  AiProviderClient,
  AiProviderError,
  CLAUDE_MODELS,
  providerClient,
} from './providers';
import type { ProviderInput, SettingsInput } from './ai.dto';

const SETTINGS_ID = 'default';

/** A provider as the portal sees it: never the key itself. */
export interface ProviderView {
  id: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string | null;
  model: string;
  hasKey: boolean;
  /** False when the saved key was sealed with a different secrets key. */
  keyReadable: boolean;
  inputCostPerMTok: number | null;
  outputCostPerMTok: number | null;
  timeoutSeconds: number;
  updatedAt: Date;
}

/** Whether the assistant can run right now, and if not why. */
export type Readiness =
  | {
      ok: true;
      provider: AiProvider;
      client: AiProviderClient;
      disabledTasks: string[];
      autoDraft: boolean;
      monthlyBudgetUsd: number | null;
      dailyJobsPerUser: number;
    }
  | { ok: false; reason: string };

const KEY_OPTIONAL = new Set<AiProviderKind>([
  AiProviderKind.OPENAI_COMPATIBLE,
  AiProviderKind.OLLAMA,
]);

/** Start of the current calendar month in India. */
export function monthStartIst(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 330 * 60_000,
  );
}

/**
 * The AI switch, the active provider and the limits (AI assistant page,
 * ai.configure). Off by default: nothing reaches a provider until a Super
 * Admin adds one and switches the assistant on.
 */
@Injectable()
export class AiSettingsService {
  private ensured: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBoxService,
    private readonly audit: AuditService,
  ) {}

  /** The single settings row, created on first use. */
  private ensure(): Promise<void> {
    this.ensured ??= this.prisma.aiSettings
      .createMany({ data: [{ id: SETTINGS_ID }], skipDuplicates: true })
      .then(() => undefined)
      .catch((err: unknown) => {
        this.ensured = null;
        throw err;
      });
    return this.ensured;
  }

  async row() {
    await this.ensure();
    return this.prisma.aiSettings.findUniqueOrThrow({
      where: { id: SETTINGS_ID },
      include: { provider: true },
    });
  }

  providerView(p: AiProvider): ProviderView {
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      baseUrl: p.baseUrl,
      model: p.model,
      hasKey: !!p.apiKey,
      keyReadable: !p.apiKey || this.secrets.ownsValue(p.apiKey),
      inputCostPerMTok: p.inputCostPerMTok,
      outputCostPerMTok: p.outputCostPerMTok,
      timeoutSeconds: p.timeoutSeconds,
      updatedAt: p.updatedAt,
    };
  }

  async view() {
    const s = await this.row();
    const providers = await this.prisma.aiProvider.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return {
      enabled: s.enabled,
      providerId: s.providerId,
      autoDraft: s.autoDraft,
      disabledTasks: s.disabledTasks,
      monthlyBudgetUsd: s.monthlyBudgetUsd,
      dailyJobsPerUser: s.dailyJobsPerUser,
      version: s.version,
      updatedAt: s.updatedAt,
      updatedBy: s.updatedBy,
      providers: providers.map((p) => this.providerView(p)),
      tasks: TASK_ORDER.map((task) => ({
        task,
        label: taskDef(task).label,
      })),
      models: { ANTHROPIC: CLAUDE_MODELS },
    };
  }

  /** An adapter for a saved provider, with its key opened. */
  clientFor(p: AiProvider): AiProviderClient {
    let apiKey: string | null = null;
    if (p.apiKey) {
      try {
        apiKey = this.secrets.open(p.apiKey, 'ai-provider');
      } catch (err) {
        if (err instanceof SecretUnreadableError) {
          throw new AiProviderError(
            `${err.message} (AI provider “${p.name}”)`,
            'auth',
            false,
          );
        }
        throw err;
      }
    }
    return providerClient({
      kind: p.kind,
      baseUrl: p.baseUrl,
      model: p.model,
      apiKey,
      timeoutSeconds: p.timeoutSeconds,
    });
  }

  async readiness(): Promise<Readiness> {
    const s = await this.row();
    if (!s.enabled) {
      return {
        ok: false,
        reason:
          'The AI assistant is switched off. A Super Admin can set it up on the AI assistant page.',
      };
    }
    if (!s.provider) {
      return {
        ok: false,
        reason:
          'The AI assistant has no provider. Pick one on the AI assistant page.',
      };
    }
    try {
      return {
        ok: true,
        provider: s.provider,
        client: this.clientFor(s.provider),
        disabledTasks: s.disabledTasks,
        autoDraft: s.autoDraft,
        monthlyBudgetUsd: s.monthlyBudgetUsd,
        dailyJobsPerUser: s.dailyJobsPerUser,
      };
    } catch (err) {
      return {
        ok: false,
        reason:
          err instanceof AiProviderError
            ? err.message
            : 'The AI provider isn’t set up correctly.',
      };
    }
  }

  /** Estimated spend this calendar month (IST), in US dollars. */
  async monthSpend(): Promise<number> {
    const agg = await this.prisma.aiJob.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: monthStartIst() } },
    });
    return Math.round((agg._sum.costUsd ?? 0) * 1e4) / 1e4;
  }

  async usage() {
    const since = monthStartIst();
    const [byTask, spend, failed] = await Promise.all([
      this.prisma.aiJob.groupBy({
        by: ['task'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      }),
      this.monthSpend(),
      this.prisma.aiJob.count({
        where: { createdAt: { gte: since }, status: AiJobStatus.FAILED },
      }),
    ]);
    return {
      since,
      spendUsd: spend,
      failed,
      jobs: byTask.reduce((n, t) => n + t._count._all, 0),
      byTask: byTask.map((t) => ({
        task: t.task,
        label: taskDef(t.task).label,
        jobs: t._count._all,
        costUsd: t._sum.costUsd ?? 0,
        inputTokens: t._sum.inputTokens ?? 0,
        outputTokens: t._sum.outputTokens ?? 0,
      })),
    };
  }

  // ── Changes (ai.configure) ─────────────────────────────────────────

  async update(actor: StaffPrincipal, dto: SettingsInput, client: ClientInfo) {
    const before = await this.row();
    if (dto.version !== before.version) {
      throw new ConflictException(
        'Someone else changed the AI settings. Reload to see their changes.',
      );
    }
    const providerId =
      dto.providerId === undefined ? before.providerId : dto.providerId;
    const provider = providerId
      ? await this.prisma.aiProvider.findUnique({ where: { id: providerId } })
      : null;
    if (providerId && !provider) {
      throw new BadRequestException('That provider no longer exists.');
    }
    const enabled = dto.enabled ?? before.enabled;
    if (enabled) {
      if (!provider) {
        throw new BadRequestException(
          'Pick a provider before switching the assistant on.',
        );
      }
      this.assertUsable(provider);
    }
    const disabledTasks =
      dto.disabledTasks === undefined
        ? before.disabledTasks
        : [...new Set(dto.disabledTasks)].filter((t) =>
            (Object.values(AiTask) as string[]).includes(t),
          );
    const res = await this.prisma.aiSettings.updateMany({
      where: { id: SETTINGS_ID, version: before.version },
      data: {
        enabled,
        providerId,
        autoDraft: dto.autoDraft ?? before.autoDraft,
        disabledTasks,
        monthlyBudgetUsd:
          dto.monthlyBudgetUsd === undefined
            ? before.monthlyBudgetUsd
            : dto.monthlyBudgetUsd,
        dailyJobsPerUser: dto.dailyJobsPerUser ?? before.dailyJobsPerUser,
        version: { increment: 1 },
        updatedBy: actor.displayName,
      },
    });
    if (res.count === 0) {
      throw new ConflictException(
        'Someone else changed the AI settings. Reload to see their changes.',
      );
    }
    const after = await this.row();
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'ai.settings.update',
      entityType: 'AiSettings',
      entityId: SETTINGS_ID,
      before: this.auditable(before),
      after: this.auditable(after),
      ...client,
    });
    return this.view();
  }

  private auditable(s: Awaited<ReturnType<AiSettingsService['row']>>) {
    return {
      enabled: s.enabled,
      provider: s.provider ? `${s.provider.name} (${s.provider.model})` : null,
      autoDraft: s.autoDraft,
      disabledTasks: s.disabledTasks,
      monthlyBudgetUsd: s.monthlyBudgetUsd,
      dailyJobsPerUser: s.dailyJobsPerUser,
    } satisfies Prisma.InputJsonValue;
  }

  private assertUsable(p: AiProvider) {
    if (!p.apiKey && !KEY_OPTIONAL.has(p.kind)) {
      throw new BadRequestException(`Add an API key to “${p.name}” first.`);
    }
    if (p.apiKey && !this.secrets.ownsValue(p.apiKey)) {
      throw new BadRequestException(
        `The key saved for “${p.name}” was encrypted with a different secrets key. Enter it again.`,
      );
    }
  }

  private cleanProvider(dto: ProviderInput, existing?: AiProvider) {
    const kind = dto.kind ?? existing?.kind;
    if (!kind) throw new BadRequestException('Choose the kind of provider.');
    const baseUrl =
      dto.baseUrl === undefined
        ? (existing?.baseUrl ?? null)
        : dto.baseUrl.trim()
          ? dto.baseUrl.trim().replace(/\/+$/, '')
          : null;
    if (baseUrl) {
      let u: URL;
      try {
        u = new URL(baseUrl);
      } catch {
        throw new BadRequestException(
          'The API address isn’t a valid web address.',
        );
      }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new BadRequestException(
          'The API address must start with https:// or http://.',
        );
      }
      if (u.username || u.password) {
        throw new BadRequestException(
          'Put the key in the API key field, not in the address.',
        );
      }
    }
    if (!baseUrl && KEY_OPTIONAL.has(kind)) {
      throw new BadRequestException(
        kind === AiProviderKind.OLLAMA
          ? 'Give the Ollama server’s address, e.g. http://localhost:11434.'
          : 'Give the server’s API address, e.g. https://example.com/v1.',
      );
    }
    const model = (dto.model ?? existing?.model ?? '').trim();
    if (!model) throw new BadRequestException('Name the model to use.');
    const known = CLAUDE_MODELS.find((m) => m.id === model);
    const rate = (v: number | null | undefined, fallback: number | null) =>
      v === undefined ? fallback : v;
    return {
      kind,
      name: (dto.name ?? existing?.name ?? '').trim() || model,
      baseUrl,
      model,
      inputCostPerMTok: rate(
        dto.inputCostPerMTok,
        existing?.inputCostPerMTok ??
          (kind === AiProviderKind.ANTHROPIC && known ? known.input : null),
      ),
      outputCostPerMTok: rate(
        dto.outputCostPerMTok,
        existing?.outputCostPerMTok ??
          (kind === AiProviderKind.ANTHROPIC && known ? known.output : null),
      ),
      timeoutSeconds: dto.timeoutSeconds ?? existing?.timeoutSeconds ?? 120,
    };
  }

  async createProvider(
    actor: StaffPrincipal,
    dto: ProviderInput,
    client: ClientInfo,
  ) {
    const data = this.cleanProvider(dto);
    const apiKey = dto.apiKey?.trim()
      ? this.secrets.seal(dto.apiKey.trim(), 'ai-provider')
      : null;
    if (!apiKey && !KEY_OPTIONAL.has(data.kind)) {
      throw new BadRequestException('Add the provider’s API key.');
    }
    const p = await this.prisma.aiProvider.create({
      data: { ...data, apiKey },
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'ai.provider.create',
      entityType: 'AiProvider',
      entityId: p.id,
      after: {
        name: p.name,
        kind: p.kind,
        model: p.model,
        baseUrl: p.baseUrl,
        hasKey: !!apiKey,
      },
      ...client,
    });
    return this.providerView(p);
  }

  async updateProvider(
    actor: StaffPrincipal,
    id: string,
    dto: ProviderInput,
    client: ClientInfo,
  ) {
    const existing = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException('That provider no longer exists.');
    const data = this.cleanProvider(dto, existing);
    let apiKey = existing.apiKey;
    if (dto.apiKey !== undefined) {
      apiKey = dto.apiKey.trim()
        ? this.secrets.seal(dto.apiKey.trim(), 'ai-provider')
        : null;
    }
    if (!apiKey && !KEY_OPTIONAL.has(data.kind)) {
      throw new BadRequestException('This provider needs an API key.');
    }
    const p = await this.prisma.aiProvider.update({
      where: { id },
      data: { ...data, apiKey },
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'ai.provider.update',
      entityType: 'AiProvider',
      entityId: id,
      before: {
        name: existing.name,
        kind: existing.kind,
        model: existing.model,
        baseUrl: existing.baseUrl,
      },
      after: {
        name: p.name,
        kind: p.kind,
        model: p.model,
        baseUrl: p.baseUrl,
        keyChanged: dto.apiKey !== undefined,
      },
      ...client,
    });
    return this.providerView(p);
  }

  async deleteProvider(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const s = await this.row();
    if (s.providerId === id && s.enabled) {
      throw new ConflictException(
        'This is the provider the assistant uses. Switch to another one, or switch the assistant off, first.',
      );
    }
    const p = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('That provider no longer exists.');
    await this.prisma.aiProvider.delete({ where: { id } });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'ai.provider.delete',
      entityType: 'AiProvider',
      entityId: id,
      before: { name: p.name, kind: p.kind, model: p.model },
      ...client,
    });
  }

  /** One tiny request, so an admin knows the key and model work. */
  async testProvider(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const p = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('That provider no longer exists.');
    const started = Date.now();
    let result: {
      ok: boolean;
      model?: string;
      message?: string;
      ms: number;
      inputTokens?: number | null;
      outputTokens?: number | null;
    };
    try {
      const res = await this.clientFor(p).complete({
        system: 'You are a connection check. Reply only with JSON.',
        prompt: 'Reply with {"ok": true}.',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['ok'],
          properties: { ok: { type: 'boolean' } },
        },
        schemaName: 'connection_check',
        maxTokens: 2000,
      });
      result = {
        ok: (res.data as { ok?: unknown })?.ok === true,
        model: res.model,
        ms: Date.now() - started,
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
      };
      if (!result.ok)
        result.message = 'The provider answered, but not as asked.';
    } catch (err) {
      result = {
        ok: false,
        message:
          err instanceof AiProviderError
            ? err.message
            : 'The test request failed.',
        ms: Date.now() - started,
      };
    }
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'ai.provider.test',
      entityType: 'AiProvider',
      entityId: id,
      meta: {
        ok: result.ok,
        model: result.model ?? p.model,
        message: result.message ?? null,
      },
      ...client,
    });
    return result;
  }
}

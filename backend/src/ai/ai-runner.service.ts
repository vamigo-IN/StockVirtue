import { Injectable, Logger } from '@nestjs/common';
import { AiJobStatus, AiTask, Prisma } from '@prisma/client';
import { StockMatcherService } from '../ingestion/stock-matcher.service';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiSettingsService } from './ai-settings.service';
import {
  AiOutputError,
  RelatedStocksOutput,
  SYSTEM_PROMPT,
  taskDef,
} from './ai-tasks';
import { emptyReport } from './fact-guard';
import { AiProviderError, estimateCost } from './providers';

const DAY_MS = 86_400_000;

/**
 * Runs AI jobs in the worker: the provider call, the answer's validation and
 * automatic checks, and the record of tokens and cost. A job only ever
 * produces a stored result for a person to look at.
 */
@Injectable()
export class AiRunner {
  private readonly logger = new Logger(AiRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
    private readonly stocks: StockMatcherService,
    private readonly directory: CompanyDirectoryService,
  ) {}

  async run(jobId: string): Promise<AiJobStatus | null> {
    const started = new Date();
    // Claim it: a job runs once, whatever the queue does.
    const claimed = await this.prisma.aiJob.updateMany({
      where: { id: jobId, status: AiJobStatus.QUEUED },
      data: { status: AiJobStatus.RUNNING, startedAt: started },
    });
    if (claimed.count === 0) return null;
    const job = await this.prisma.aiJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    const ready = await this.settings.readiness();
    if (!ready.ok) return this.fail(jobId, started, ready.reason);
    if (ready.disabledTasks.includes(job.task)) {
      return this.fail(
        jobId,
        started,
        'This AI tool was switched off before it ran.',
      );
    }

    const def = taskDef(job.task);
    const report = emptyReport();
    const base = {
      providerId: ready.provider.id,
      providerKind: ready.provider.kind,
      model: ready.provider.model,
    };
    try {
      const res = await ready.client.complete({
        system: SYSTEM_PROMPT,
        prompt: def.prompt(job.input),
        schema: def.schema,
        schemaName: def.promptId.replace(/-/g, '_'),
        maxTokens: def.maxTokens,
      });
      let output = def.finish(res.data, job.input, report);
      if (job.task === AiTask.RELATED_STOCKS) {
        output = await this.listedOnly(output as RelatedStocksOutput);
      }
      await this.prisma.aiJob.update({
        where: { id: jobId },
        data: {
          ...base,
          model: res.model,
          status: AiJobStatus.SUCCEEDED,
          output: output as Prisma.InputJsonValue,
          checks: report as unknown as Prisma.InputJsonValue,
          inputTokens: res.inputTokens,
          outputTokens: res.outputTokens,
          costUsd: estimateCost(
            ready.provider,
            res.inputTokens,
            res.outputTokens,
          ),
          durationMs: Date.now() - started.getTime(),
          finishedAt: new Date(),
        },
      });
      return AiJobStatus.SUCCEEDED;
    } catch (err) {
      if (!(err instanceof AiProviderError || err instanceof AiOutputError)) {
        this.logger.error(
          `AI job ${jobId} (${job.task}) crashed`,
          err as Error,
        );
      }
      return this.fail(
        jobId,
        started,
        err instanceof AiProviderError || err instanceof AiOutputError
          ? err.message
          : 'Something went wrong running this request.',
        base,
        report,
      );
    }
  }

  private async fail(
    jobId: string,
    started: Date,
    error: string,
    base: Prisma.AiJobUncheckedUpdateInput = {},
    report?: ReturnType<typeof emptyReport>,
  ): Promise<AiJobStatus> {
    await this.prisma.aiJob.update({
      where: { id: jobId },
      data: {
        ...base,
        status: AiJobStatus.FAILED,
        error,
        ...(report && (report.removed.length || report.withheld.length)
          ? { checks: report as unknown as Prisma.InputJsonValue }
          : {}),
        durationMs: Date.now() - started.getTime(),
        finishedAt: new Date(),
      },
    });
    return AiJobStatus.FAILED;
  }

  /** Company names → NSE-listed companies only; a name with no listed match is dropped. */
  private async listedOnly(
    out: RelatedStocksOutput,
  ): Promise<RelatedStocksOutput> {
    const stocks: NonNullable<RelatedStocksOutput['stocks']> = [];
    for (const c of out.companies) {
      let hit = (await this.stocks.match(c.name, 1))[0];
      if (!hit) {
        const [best, next] = this.directory.matchByName(c.name, 2);
        const clear =
          best && best.score >= 600 && (!next || best.score - next.score > 0.5);
        const name = clear ? this.directory.nameFor(best.symbol) : null;
        if (clear && name)
          hit = { exchange: 'NSE', symbol: best.symbol, name, via: 'name' };
      }
      if (hit && !stocks.some((s) => s.symbol === hit.symbol)) {
        stocks.push({
          exchange: 'NSE',
          symbol: hit.symbol,
          name: hit.name,
          reason: c.reason,
        });
      }
    }
    if (stocks.length === 0 && out.companies.length > 0) {
      throw new AiOutputError(
        'None of the companies the AI named is listed on the NSE.',
      );
    }
    return { ...out, stocks: stocks.slice(0, 8) };
  }

  /**
   * Housekeeping: jobs stuck because a worker died, and old inputs (the story
   * and source text sent to the provider) cleared after 90 days. Results,
   * checks, tokens and cost stay for the history.
   */
  async sweep(now = new Date()): Promise<{ stuck: number; cleared: number }> {
    const stuckRunning = await this.prisma.aiJob.updateMany({
      where: {
        status: AiJobStatus.RUNNING,
        startedAt: { lt: new Date(now.getTime() - 15 * 60_000) },
      },
      data: {
        status: AiJobStatus.FAILED,
        error: 'This request timed out.',
        finishedAt: now,
      },
    });
    const stuckQueued = await this.prisma.aiJob.updateMany({
      where: {
        status: AiJobStatus.QUEUED,
        createdAt: { lt: new Date(now.getTime() - 30 * 60_000) },
      },
      data: {
        status: AiJobStatus.FAILED,
        error:
          'The newsroom worker didn’t pick this up. Check that it is running.',
        finishedAt: now,
      },
    });
    const cleared = await this.prisma.$executeRaw`
      UPDATE ai_jobs SET input = '{}'::jsonb
      WHERE "createdAt" < ${new Date(now.getTime() - 90 * DAY_MS)}
        AND input <> '{}'::jsonb`;
    return { stuck: stuckRunning.count + stuckQueued.count, cleared };
  }
}

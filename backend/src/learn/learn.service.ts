import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AchievementsService } from '../achievements/achievements.service';
import { PrismaService } from '../prisma/prisma.service';
import { TOTAL_LESSONS, isLessonId } from './lesson-catalog';

/**
 * Server-side Academy progress. Lesson content lives in the mobile app; this
 * service persists *completion* and *quiz attempts* so progress is
 * server-authoritative, syncs across devices, and feeds learning achievements.
 */
@Injectable()
export class LearnService {
  private readonly logger = new Logger(LearnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly achievements: AchievementsService,
  ) {}

  /// The caller's completed lessons + best quiz score per lesson.
  async getProgress(userId: string): Promise<{
    completedLessons: string[];
    totalLessons: number;
    quizzes: { lessonId: string; bestScore: number; total: number }[];
  }> {
    const [completed, bestScores] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: { userId },
        select: { lessonId: true },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.quizAttempt.groupBy({
        by: ['lessonId', 'total'],
        where: { userId },
        _max: { score: true },
      }),
    ]);
    return {
      completedLessons: completed.map((c) => c.lessonId),
      totalLessons: TOTAL_LESSONS,
      quizzes: bestScores.map((q) => ({
        lessonId: q.lessonId,
        bestScore: q._max.score ?? 0,
        total: q.total,
      })),
    };
  }

  /**
   * Marks a lesson complete (idempotent) and optionally records the quiz
   * attempt that finished it. Triggers achievement re-evaluation. Returns the
   * refreshed completed-lesson list.
   */
  async completeLesson(
    userId: string,
    lessonId: string,
    score?: number,
    total?: number,
  ): Promise<{ completedLessons: string[] }> {
    if (!isLessonId(lessonId)) {
      throw new BadRequestException(`Unknown lesson "${lessonId}"`);
    }
    if (total != null && score != null && score > total) {
      throw new BadRequestException('score cannot exceed total');
    }

    if (total != null && total > 0) {
      await this.prisma.quizAttempt.create({
        data: {
          userId,
          lessonId,
          score: score ?? 0,
          total,
          passed: (score ?? 0) >= total,
        },
      });
    }

    await this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId },
      update: {}, // completion is permanent; first completedAt stands
    });

    // Re-evaluate learning achievements without blocking the response.
    void this.achievements.evaluate(userId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`achievement eval after lesson failed: ${msg}`);
    });

    const completed = await this.prisma.lessonProgress.findMany({
      where: { userId },
      select: { lessonId: true },
      orderBy: { completedAt: 'asc' },
    });
    return { completedLessons: completed.map((c) => c.lessonId) };
  }

  /// Aggregate learning stats for the admin panel. Read-only.
  async adminStats(): Promise<{
    completions: number;
    learners: number;
    quizAttempts: number;
    quizPassRate: number;
    totalLessons: number;
  }> {
    const [completions, learners, quizAttempts, quizPasses] = await Promise.all([
      this.prisma.lessonProgress.count(),
      this.prisma.lessonProgress
        .findMany({ distinct: ['userId'], select: { userId: true } })
        .then((r) => r.length),
      this.prisma.quizAttempt.count({ where: { total: { gt: 0 } } }),
      this.prisma.quizAttempt.count({ where: { passed: true, total: { gt: 0 } } }),
    ]);
    return {
      completions,
      learners,
      quizAttempts,
      quizPassRate: quizAttempts === 0 ? 0 : quizPasses / quizAttempts,
      totalLessons: TOTAL_LESSONS,
    };
  }
}

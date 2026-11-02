import { NewsSource, NewsSourceFormat } from '@prisma/client';

export type SourceHealth =
  | 'manual'
  | 'paused'
  | 'pending'
  | 'healthy'
  | 'degraded'
  | 'failing';

const MINUTE = 60_000;

/**
 * Paused, failing, behind schedule or fine. Behind schedule (no success for
 * three polling intervals) usually means the newsroom worker isn't running.
 */
export function sourceHealth(
  s: Pick<
    NewsSource,
    | 'format'
    | 'isActive'
    | 'consecutiveFailures'
    | 'lastSuccessAt'
    | 'pollMinutes'
    | 'createdAt'
  >,
  now = Date.now(),
): SourceHealth {
  if (s.format === NewsSourceFormat.NONE) return 'manual';
  if (!s.isActive) return 'paused';
  if (s.consecutiveFailures >= 3) return 'failing';
  if (s.consecutiveFailures > 0) return 'degraded';
  const overdue = (s.pollMinutes * 3 + 10) * MINUTE;
  if (!s.lastSuccessAt) {
    return now - s.createdAt.getTime() > overdue ? 'degraded' : 'pending';
  }
  return now - s.lastSuccessAt.getTime() > overdue ? 'degraded' : 'healthy';
}

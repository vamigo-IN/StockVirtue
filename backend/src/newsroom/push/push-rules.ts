import {
  NewsStatus,
  NotificationCampaignKind,
  NotificationCampaignStatus,
  Prisma,
} from '@prisma/client';

/**
 * When a story may push, shared by the worker's push sweep
 * (news-push.service.ts) and the portal (the Placement card's
 * notification control, ArticleWorkflowService.notifyNow). Pure, so the
 * API never loads the push service (it runs in the worker).
 */

const Kind = NotificationCampaignKind;

/// Pushes wait this long after a story goes live, so a mistake taken down
/// straight away never reaches anyone.
export const GRACE_MS = 30_000;
/// Breaking pushes only for stories first published this recently.
export const BREAKING_WINDOW_MS = 3 * 3600_000;
/// Followed-stock pushes only for stories first published this recently.
export const STOCKS_WINDOW_MS = 6 * 3600_000;
/// An editor's notification ("Send a notification when published", "Send
/// notification now") only for stories first published this recently.
export const EDITORS_PICK_WINDOW_MS = 24 * 3600_000;

/** How long after first publication each kind of push may still start. */
export const PUSH_WINDOW_MS: Record<NotificationCampaignKind, number> = {
  [Kind.BREAKING]: BREAKING_WINDOW_MS,
  [Kind.FOLLOWED_STOCKS]: STOCKS_WINDOW_MS,
  [Kind.EDITORS_PICK]: EDITORS_PICK_WINDOW_MS,
};

/// The first line of an editor's notification; the headline is the second.
export const EDITORS_PICK_TITLE = 'Editors’ pick';

/**
 * The pushes that go to every reader with breaking alerts on. A story sends
 * at most one of them, ever: breaking news, or an editor's notification.
 */
export const EVERY_READER_KINDS: NotificationCampaignKind[] = [
  Kind.BREAKING,
  Kind.EDITORS_PICK,
];

export const editorsPickKey = (articleId: string) =>
  `article:${articleId}:editors-pick`;

/**
 * Breaking news sends (or sent) this story's notification by itself: it is
 * marked breaking and is either not out yet or first went out within
 * BREAKING_WINDOW_MS. An editor's notification would then be a second one.
 */
export function breakingNotifies(
  s: { isBreaking: boolean; firstPublishedAt: Date | null },
  now = new Date(),
): boolean {
  return (
    s.isBreaking &&
    (!s.firstPublishedAt ||
      now.getTime() - s.firstPublishedAt.getTime() <= BREAKING_WINDOW_MS)
  );
}

/** On the website and the app now: published, out, not retracted. */
export function isLive(
  s: {
    status: NewsStatus;
    publishedAt: Date | null;
    retractedAt: Date | null;
  },
  now = new Date(),
): boolean {
  return (
    s.status === NewsStatus.PUBLISHED &&
    !s.retractedAt &&
    !!s.publishedAt &&
    s.publishedAt.getTime() <= now.getTime()
  );
}

/** The editor's notification for a story (one per story: `dedupeKey`). */
export function editorsPickCampaign(
  story: { id: string; title: string; publishedAt: Date | null },
  now = new Date(),
): Prisma.NotificationCampaignUncheckedCreateInput {
  const liveAt = story.publishedAt?.getTime() ?? now.getTime();
  return {
    kind: Kind.EDITORS_PICK,
    dedupeKey: editorsPickKey(story.id),
    articleId: story.id,
    // Never inside the grace period after going live.
    scheduledAt: new Date(Math.max(now.getTime(), liveAt + GRACE_MS)),
    title: EDITORS_PICK_TITLE,
    body: story.title,
    audience: { alerts: 'breaking' },
  };
}

// ── The portal's view ─────────────────────────────────────────────────

/**
 * What the Placement card shows about a story's notification:
 * - switch: not live yet; "Send a notification when published";
 * - breaking: breaking news sends it by itself, so no second one;
 * - pending: live with the switch on; the worker sends it within a minute;
 * - available: live, nothing sent; "Send notification now";
 * - closed: too late (24 hours after it first went live) or retracted;
 * - queued, sent, not_sent: its notification (`campaign`).
 */
export type NotifyState =
  | 'switch'
  | 'breaking'
  | 'pending'
  | 'available'
  | 'closed'
  | 'queued'
  | 'sent'
  | 'not_sent';

export interface NotifyCampaignRow {
  id: string;
  kind: NotificationCampaignKind;
  status: NotificationCampaignStatus;
  scheduledAt: Date;
  sentAt: Date | null;
  recipients: number;
  note: string | null;
}

/** The story's every-reader campaign (BREAKING or EDITORS_PICK), newest first. */
export const NOTIFY_CAMPAIGN_INCLUDE = {
  where: { kind: { in: EVERY_READER_KINDS } },
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: {
    id: true,
    kind: true,
    status: true,
    scheduledAt: true,
    sentAt: true,
    recipients: true,
    note: true,
  },
} satisfies Prisma.NewsArticle$pushCampaignsArgs;

export function notificationView(
  a: {
    status: NewsStatus;
    isBreaking: boolean;
    notifyOnPublish: boolean;
    publishedAt: Date | null;
    firstPublishedAt: Date | null;
    retractedAt: Date | null;
  },
  campaign: NotifyCampaignRow | null,
  now = new Date(),
) {
  const until = a.firstPublishedAt
    ? new Date(a.firstPublishedAt.getTime() + EDITORS_PICK_WINDOW_MS)
    : null;
  let state: NotifyState;
  if (campaign) {
    state =
      campaign.status === NotificationCampaignStatus.SENT
        ? 'sent'
        : campaign.status === NotificationCampaignStatus.QUEUED ||
            campaign.status === NotificationCampaignStatus.SENDING
          ? 'queued'
          : 'not_sent';
  } else if (a.retractedAt) {
    state = 'closed';
  } else if (breakingNotifies(a, now)) {
    state = 'breaking';
  } else if (until && now.getTime() > until.getTime()) {
    state = 'closed';
  } else if (!isLive(a, now)) {
    state = 'switch';
  } else {
    state = a.notifyOnPublish ? 'pending' : 'available';
  }
  return {
    state,
    notifyOnPublish: a.notifyOnPublish,
    /** "Send notification now" works until then (null: not out yet). */
    sendUntil: until?.toISOString() ?? null,
    campaign: campaign
      ? {
          id: campaign.id,
          kind: campaign.kind,
          status: campaign.status,
          scheduledAt: campaign.scheduledAt.toISOString(),
          sentAt: campaign.sentAt?.toISOString() ?? null,
          recipients: campaign.recipients,
          note: campaign.note,
        }
      : null,
  };
}

export type NotificationView = ReturnType<typeof notificationView>;

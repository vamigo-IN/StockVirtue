/** Display helpers for the portal. Times show in India Standard Time. */

const TZ = 'Asia/Kolkata';

const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateOnly = new Intl.DateTimeFormat('en-IN', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '—';
}

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateOnly.format(new Date(iso)) : '—';
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function timeAgo(
  iso: string | null | undefined,
  now = Date.now(),
): string {
  if (!iso) return 'Never';
  const diff = now - new Date(iso).getTime();
  const future = diff < 0;
  const s = Math.abs(diff) / 1000;
  const say = (n: number, unit: string) =>
    future ? `in ${n} ${unit}` : `${n} ${unit} ago`;
  if (s < 45) return future ? 'in a moment' : 'just now';
  if (s < 3600) return say(Math.round(s / 60), 'min');
  if (s < 86_400) return say(Math.round(s / 3600), 'h');
  if (s < 7 * 86_400) {
    const d = Math.round(s / 86_400);
    return say(d, d === 1 ? 'day' : 'days');
  }
  return formatDate(iso);
}

/** "Chrome on Windows" from a user-agent string. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : ''))
    .toUpperCase()
    .slice(0, 2);
}

export function formatINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

/** How an app account signs in (from the API's `signIn` list). */
export const SIGN_IN_LABELS: Record<string, string> = {
  password: 'Email',
  google: 'Google',
  phone: 'Phone',
};

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

const AUDIT_LABELS: Record<string, string> = {
  'staff.login': 'Signed in to the portal',
  'staff.login.failed': 'Failed sign-in: wrong email or password',
  'staff.login.code_failed': 'Failed sign-in: wrong code',
  'staff.logout': 'Signed out',
  'staff.session.revoke': 'Ended one of their sessions',
  'staff.session.revoke_others': 'Signed out their other sessions',
  'staff.session.revoke_admin': "Ended someone's session",
  'staff.session.sign_out_all': 'Signed a staff member out everywhere',
  'staff.roles.set': "Changed a staff member's roles",
  'staff.roles.grant_cli': 'Role granted from the server',
  'staff.suspend': 'Suspended a staff member',
  'staff.reactivate': 'Reactivated a staff member',
  'staff.invite': 'Sent an invitation',
  'staff.invite.revoke': 'Revoked an invitation',
  'staff.invite.accept': 'Accepted an invitation',
  'staff.profile.update': 'Updated their profile',
  'staff.role.create': 'Created a custom role',
  'staff.role.update': 'Edited a custom role',
  'staff.role.delete': 'Deleted a custom role',
  'user.rename': 'Renamed an app user',
  'user.block': 'Blocked an app user',
  'user.unblock': 'Unblocked an app user',
  'site.settings.update': 'Updated website settings',
  'site.settings.code_injection': 'Changed injected website code',
  'news.article.create': 'Started an article',
  'news.article.update': 'Saved an article',
  'news.article.delete': 'Deleted a draft',
  'news.article.restore': 'Restored an older version',
  'news.article.submit': 'Sent an article for review',
  'news.article.withdraw': 'Withdrew an article from review',
  'news.article.approve': 'Approved an article',
  'news.article.request_changes': 'Asked for changes',
  'news.article.reject': 'Rejected an article',
  'news.article.publish': 'Published an article',
  'news.article.schedule': 'Scheduled an article',
  'news.article.unschedule': 'Unscheduled an article',
  'news.article.unpublish': 'Took an article down',
  'news.article.archive': 'Archived an article',
  'news.article.cancel': 'Spiked an article',
  'news.article.reopen': 'Reopened an article',
  // Only in older entries: correction notes were retired on 6 Nov 2026.
  'news.article.correct': 'Added a note to a live article',
  'news.article.retract': 'Retracted an article',
  'news.article.flags': 'Changed featured/breaking',
  'news.article.breaking_expired': 'Breaking label came off after 24 hours',
  'news.article.notify_on_publish': 'Changed the notification on publish',
  'news.article.notify': 'Sent a notification for an article',
  'news.comment.create': 'Commented on an article',
  'news.comment.resolve': 'Resolved a comment',
  'news.comment.reopen': 'Reopened a comment',
  'news.comment.edit': 'Edited a comment',
  'news.comment.delete': 'Deleted a comment',
  'news.assignment.create': 'Assigned work',
  'news.assignment.update': 'Updated an assignment',
  'news.category.create': 'Created a category',
  'news.category.update': 'Edited a category',
  'news.category.delete': 'Deleted a category',
  'news.tag.create': 'Created a tag',
  'news.tag.update': 'Renamed a tag',
  'news.tag.delete': 'Deleted a tag',
  'news.author.create': 'Created a byline',
  'news.author.update': 'Edited a byline',
  'media.upload': 'Uploaded an image',
  'media.update': 'Edited image details',
  'media.delete': 'Deleted an image',
  'media.storage.update': 'Changed media storage',
  'media.storage.disconnect': 'Removed the Cloudflare R2 connection',
  'news.source.create': 'Added a news source',
  'news.source.update': 'Edited a news source',
  'news.source.delete': 'Deleted a news source',
  'news.source.fetch': 'Fetched a news source',
  'news.source.retry': 'Retried a failed fetch',
  'news.item.dismiss': 'Dismissed an incoming item',
  'news.item.restore': 'Restored an incoming item',
  'news.item.draft': 'Started a story from incoming news',
  'news.item.submit': 'Added a tip to incoming news',
  'news.stock_alias.create': 'Added a stock alias',
  'news.stock_alias.delete': 'Removed a stock alias',
  'ai.settings.update': 'Changed the AI assistant settings',
  'ai.provider.create': 'Added an AI provider',
  'ai.provider.update': 'Edited an AI provider',
  'ai.provider.delete': 'Deleted an AI provider',
  'ai.provider.test': 'Tested an AI provider',
  'ai.job.create': 'Asked the AI assistant',
  'ai.job.applied': 'Used an AI suggestion',
};

export function auditLabel(action: string): string {
  return (
    AUDIT_LABELS[action] ??
    action.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** Failed sign-ins and code changes stand out in the log. */
export function auditTone(action: string): 'danger' | 'warning' | 'default' {
  if (action.includes('failed')) return 'danger';
  if (
    /\.(block|suspend|code_injection|revoke_admin|sign_out_all|reject|unpublish|retract|delete)$/.test(
      action,
    )
  ) {
    return 'warning';
  }
  return 'default';
}

export const ARTICLE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
  CANCELLED: 'Spiked',
  ARCHIVED: 'Archived',
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

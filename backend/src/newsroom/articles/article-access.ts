import { NewsAssignmentStatus, NewsStatus } from '@prisma/client';
import { PermissionKey, SUPER_ADMIN } from '../../rbac/rbac.catalog';
import { StaffPrincipal } from '../../staff/staff-request';

/** What the access rules need to know about an article. */
export interface ArticleAccessView {
  status: NewsStatus;
  createdById: string | null;
  firstPublishedAt: Date | null;
  assignments: {
    assigneeId: string;
    role: string;
    status: NewsAssignmentStatus;
  }[];
}

export const has = (actor: StaffPrincipal, p: PermissionKey) =>
  actor.roles.includes(SUPER_ADMIN) || actor.permissions.has(p);

const live = (s: NewsAssignmentStatus) => s !== NewsAssignmentStatus.CANCELLED;

/** Wrote it, or is assigned as its writer. */
export const isOwnWork = (a: ArticleAccessView, actor: StaffPrincipal) =>
  a.createdById === actor.staffId ||
  a.assignments.some(
    (x) =>
      x.assigneeId === actor.staffId && x.role === 'WRITER' && live(x.status),
  );

export const isAssigned = (a: ArticleAccessView, actor: StaffPrincipal) =>
  a.assignments.some((x) => x.assigneeId === actor.staffId && live(x.status));

const S = NewsStatus;
/** A writer edits only before review, or after changes were requested. */
const WRITER_EDITABLE: NewsStatus[] = [S.DRAFT, S.CHANGES_REQUESTED];
/** Editors (news.update_all) can also copy-edit in review and after publishing. */
const EDITOR_EDITABLE: NewsStatus[] = [
  S.DRAFT,
  S.CHANGES_REQUESTED,
  S.IN_REVIEW,
  S.APPROVED,
  S.SCHEDULED,
  S.PUBLISHED,
];

export function canRead(a: ArticleAccessView, actor: StaffPrincipal) {
  if (has(actor, 'news.read_all')) return true;
  return (
    has(actor, 'news.read') && (isOwnWork(a, actor) || isAssigned(a, actor))
  );
}

/**
 * Everything the signed-in person may do with one article. The workflow
 * service enforces exactly these rules; the portal uses the same map to
 * decide which buttons to show.
 */
export function capabilities(a: ArticleAccessView, actor: StaffPrincipal) {
  const own = isOwnWork(a, actor);
  const read = canRead(a, actor);
  const editAll = has(actor, 'news.update_all');
  const editOwn = has(actor, 'news.update_own') && own;
  const edit =
    (editAll && EDITOR_EDITABLE.includes(a.status)) ||
    (editOwn && WRITER_EDITABLE.includes(a.status));
  // Separation of duties: nobody signs off their own story without
  // the explicit news.publish_own permission.
  const signOff = !own || has(actor, 'news.publish_own');
  const review =
    a.status === S.IN_REVIEW && has(actor, 'news.approve') && signOff;
  const publishable =
    a.status === S.APPROVED || a.status === S.SCHEDULED || review;
  const publish = publishable && has(actor, 'news.publish') && signOff;
  const preRelease: NewsStatus[] = editAll
    ? [S.DRAFT, S.CHANGES_REQUESTED, S.APPROVED]
    : [S.DRAFT, S.CHANGES_REQUESTED];
  return {
    ownWork: own,
    read,
    edit,
    editSeo:
      edit ||
      (has(actor, 'news.update_seo') && read && a.status !== S.ARCHIVED),
    submit:
      (a.status === S.DRAFT || a.status === S.CHANGES_REQUESTED) &&
      has(actor, 'news.submit_review') &&
      (own || editAll),
    withdraw:
      a.status === S.IN_REVIEW &&
      has(actor, 'news.submit_review') &&
      (own || editAll),
    review,
    publish,
    schedule:
      (a.status === S.APPROVED || review) &&
      has(actor, 'news.schedule') &&
      has(actor, 'news.publish') &&
      signOff,
    unschedule: a.status === S.SCHEDULED && has(actor, 'news.schedule'),
    unpublish: a.status === S.PUBLISHED && has(actor, 'news.unpublish'),
    archive:
      !([S.IN_REVIEW, S.SCHEDULED, S.ARCHIVED] as NewsStatus[]).includes(
        a.status,
      ) && has(actor, 'news.archive'),
    cancel: preRelease.includes(a.status) && (editAll || editOwn),
    reopen:
      ([S.REJECTED, S.CANCELLED, S.ARCHIVED] as NewsStatus[]).includes(
        a.status,
      ) &&
      (editAll || (has(actor, 'news.update_own') && own)),
    delete:
      has(actor, 'news.delete') &&
      !a.firstPublishedAt &&
      !([S.IN_REVIEW, S.SCHEDULED, S.PUBLISHED] as NewsStatus[]).includes(
        a.status,
      ),
    // Retract a live story. Named after its permission (news.correct), whose
    // key stays for stored roles; correction notes were retired 6 Nov 2026.
    correct: a.status === S.PUBLISHED && has(actor, 'news.correct'),
    feature: has(actor, 'news.feature') && read,
    // "Send a notification when published" / "Send notification now": a push
    // to app readers, so only staff who may publish and place stories (the
    // same people whose Breaking switch already notifies readers).
    notify:
      has(actor, 'news.publish') && has(actor, 'news.feature') && read,
    assign: has(actor, 'news.assign') && read,
    comment: has(actor, 'news.comment') && read,
  };
}

export type ArticleCapabilities = ReturnType<typeof capabilities>;

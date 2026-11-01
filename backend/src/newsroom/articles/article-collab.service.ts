import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NewsAssignmentStatus, NewsStatus, StaffStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import { capabilities, has } from './article-access';
import { ArticlesService } from './articles.service';

const ARTICLE_BRIEF = {
  id: true,
  title: true,
  status: true,
  updatedAt: true,
  scheduledAt: true,
  category: { select: { name: true } },
} as const;

/** Editorial comments, assignments and each person's work queue. */
@Injectable()
export class ArticleCollabService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly articles: ArticlesService,
  ) {}

  // ── Comments ────────────────────────────────────────────────────────

  async listComments(actor: StaffPrincipal, articleId: string) {
    await this.readable(actor, articleId);
    const rows = await this.prisma.newsComment.findMany({
      where: { articleId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, displayName: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      blockId: c.blockId,
      body: c.body,
      author: c.author,
      resolvedAt: c.resolvedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      mine: c.authorId === actor.staffId,
    }));
  }

  async addComment(
    actor: StaffPrincipal,
    articleId: string,
    dto: { body: string; parentId?: string; blockId?: string },
    client: ClientInfo,
  ) {
    const can = await this.readable(actor, articleId);
    if (!can.comment) {
      throw new ForbiddenException(
        'Leaving editorial comments needs news.comment.',
      );
    }
    if (dto.parentId) {
      const parent = await this.prisma.newsComment.findFirst({
        where: { id: dto.parentId, articleId },
      });
      if (!parent)
        throw new BadRequestException('That comment thread no longer exists.');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.newsComment.create({
        data: {
          articleId,
          authorId: actor.staffId,
          parentId: dto.parentId ?? null,
          blockId: dto.blockId ?? null,
          body: dto.body.trim(),
        },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.comment.create',
          entityType: 'NewsArticle',
          entityId: articleId,
          meta: { commentId: c.id },
          ...client,
        },
        tx,
      );
      return c;
    });
    return (await this.listComments(actor, articleId)).find(
      (c) => c.id === created.id,
    );
  }

  async updateComment(
    actor: StaffPrincipal,
    commentId: string,
    dto: { resolved?: boolean; body?: string },
    client: ClientInfo,
  ) {
    const c = await this.prisma.newsComment.findUnique({
      where: { id: commentId },
    });
    if (!c) throw new NotFoundException('Comment not found.');
    await this.readable(actor, c.articleId);
    const mine = c.authorId === actor.staffId;
    if (dto.body !== undefined && !mine) {
      throw new ForbiddenException('You can only edit your own comments.');
    }
    if (dto.resolved !== undefined && !mine && !this.moderates(actor)) {
      throw new ForbiddenException(
        'Only the comment’s author or an editor can resolve it.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.newsComment.update({
        where: { id: commentId },
        data: {
          ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
          ...(dto.resolved !== undefined
            ? dto.resolved
              ? { resolvedAt: new Date(), resolvedById: actor.staffId }
              : { resolvedAt: null, resolvedById: null }
            : {}),
        },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action:
            dto.resolved !== undefined
              ? dto.resolved
                ? 'news.comment.resolve'
                : 'news.comment.reopen'
              : 'news.comment.edit',
          entityType: 'NewsArticle',
          entityId: c.articleId,
          meta: { commentId },
          ...client,
        },
        tx,
      );
    });
    return (await this.listComments(actor, c.articleId)).find(
      (x) => x.id === commentId,
    );
  }

  async deleteComment(
    actor: StaffPrincipal,
    commentId: string,
    client: ClientInfo,
  ) {
    const c = await this.prisma.newsComment.findUnique({
      where: { id: commentId },
    });
    if (!c) throw new NotFoundException('Comment not found.');
    await this.readable(actor, c.articleId);
    if (c.authorId !== actor.staffId && !this.moderates(actor)) {
      throw new ForbiddenException('You can only delete your own comments.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.newsComment.delete({ where: { id: commentId } }); // replies go too
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.comment.delete',
          entityType: 'NewsArticle',
          entityId: c.articleId,
          before: { body: c.body },
          meta: { commentId },
          ...client,
        },
        tx,
      );
    });
  }

  // ── Assignments ─────────────────────────────────────────────────────

  async assign(
    actor: StaffPrincipal,
    articleId: string,
    dto: {
      assigneeId: string;
      role: 'WRITER' | 'EDITOR' | 'REVIEWER';
      dueAt?: string;
      note?: string;
    },
    client: ClientInfo,
  ) {
    const can = await this.readable(actor, articleId);
    if (!can.assign)
      throw new ForbiddenException('Assigning work needs news.assign.');
    const assignee = await this.prisma.staffProfile.findUnique({
      where: { id: dto.assigneeId },
    });
    if (!assignee || assignee.status !== StaffStatus.ACTIVE) {
      throw new BadRequestException('Pick an active member of the newsroom.');
    }
    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    await this.prisma.$transaction(async (tx) => {
      // One open assignment per person and role on a story.
      await tx.newsAssignment.updateMany({
        where: {
          articleId,
          assigneeId: dto.assigneeId,
          role: dto.role,
          status: NewsAssignmentStatus.OPEN,
        },
        data: { status: NewsAssignmentStatus.CANCELLED },
      });
      const created = await tx.newsAssignment.create({
        data: {
          articleId,
          assigneeId: dto.assigneeId,
          role: dto.role,
          dueAt,
          note: dto.note?.trim() || null,
          assignedById: actor.staffId,
        },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.assignment.create',
          entityType: 'NewsArticle',
          entityId: articleId,
          after: {
            assignee: assignee.displayName,
            role: dto.role,
            dueAt: dueAt?.toISOString() ?? null,
          },
          meta: { assignmentId: created.id },
          ...client,
        },
        tx,
      );
    });
    return this.articles.get(actor, articleId);
  }

  /** The assignee marks their part done; people with news.assign can also cancel or reopen. */
  async updateAssignment(
    actor: StaffPrincipal,
    assignmentId: string,
    status: 'OPEN' | 'DONE' | 'CANCELLED',
    client: ClientInfo,
  ) {
    const x = await this.prisma.newsAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!x) throw new NotFoundException('Assignment not found.');
    await this.readable(actor, x.articleId);
    const mine = x.assigneeId === actor.staffId;
    if (!has(actor, 'news.assign') && !(mine && status === 'DONE')) {
      throw new ForbiddenException(
        'You can mark your own assignments done; changing others needs news.assign.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.newsAssignment.update({
        where: { id: assignmentId },
        data: { status: status },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.assignment.update',
          entityType: 'NewsArticle',
          entityId: x.articleId,
          before: { status: x.status },
          after: { status },
          meta: { assignmentId },
          ...client,
        },
        tx,
      );
    });
    return this.articles.get(actor, x.articleId);
  }

  // ── Queues ──────────────────────────────────────────────────────────

  /** One person's desk: their assignments, drafts and stories in flight. */
  async myWork(actor: StaffPrincipal) {
    const mine = (status: NewsStatus[]) =>
      this.prisma.newsArticle.findMany({
        where: { createdById: actor.staffId, status: { in: status } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: ARTICLE_BRIEF,
      });
    const [assignments, drafts, changes, inReview, reviewQueue] =
      await Promise.all([
        this.prisma.newsAssignment.findMany({
          where: {
            assigneeId: actor.staffId,
            status: NewsAssignmentStatus.OPEN,
          },
          orderBy: [
            { dueAt: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'desc' },
          ],
          take: 50,
          include: {
            article: { select: ARTICLE_BRIEF },
            assignedBy: { select: { id: true, displayName: true } },
          },
        }),
        mine([NewsStatus.DRAFT]),
        mine([NewsStatus.CHANGES_REQUESTED]),
        mine([NewsStatus.IN_REVIEW]),
        has(actor, 'news.approve')
          ? this.prisma.newsArticle.count({
              where: { status: NewsStatus.IN_REVIEW },
            })
          : Promise.resolve(null),
      ]);
    return {
      assignments: assignments.map((x) => ({
        id: x.id,
        role: x.role,
        note: x.note,
        dueAt: x.dueAt,
        assignedBy: x.assignedBy,
        createdAt: x.createdAt,
        article: x.article,
      })),
      drafts,
      changesRequested: changes,
      inReview,
      reviewQueue,
    };
  }

  /** Active staff to pick assignees from (editors don't hold staff.read). */
  async directory() {
    const rows = await this.prisma.staffProfile.findMany({
      where: { status: StaffStatus.ACTIVE },
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        title: true,
        user: {
          select: { roles: { select: { role: { select: { name: true } } } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      title: r.title,
      roles: r.user.roles.map((x) => x.role.name),
    }));
  }

  private async readable(actor: StaffPrincipal, articleId: string) {
    const a = await this.articles.loadAccess(articleId);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    return can;
  }

  private moderates(actor: StaffPrincipal) {
    return has(actor, 'news.update_all') || has(actor, 'news.approve');
  }
}

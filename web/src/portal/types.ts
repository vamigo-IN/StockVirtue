/** Shapes returned by the newsroom API (/api/v1/staff/...). Dates are ISO strings. */

export interface StaffMe {
  id: string;
  userId: string;
  email: string | null;
  displayName: string;
  title: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  lastPortalLoginAt: string | null;
}

export interface StaffMember {
  id: string;
  userId: string;
  displayName: string;
  title: string | null;
  email: string | null;
  accountBlocked: boolean;
  status: 'ACTIVE' | 'SUSPENDED';
  suspendedAt: string | null;
  suspendedReason: string | null;
  lastPortalLoginAt: string | null;
  createdAt: string;
  roles: { key: string; name: string }[];
}

export interface RoleInfo {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  memberCount: number;
  permissions: string[];
}

export interface PermissionInfo {
  key: string;
  group: string;
  description: string;
}

export interface Invitation {
  id: string;
  email: string;
  roleKeys: string[];
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface InvitationPreview {
  email: string;
  roles: string[];
  expiresAt: string;
  hasAccount: boolean;
  needsNewPassword: boolean;
}

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEntry[];
  nextBefore: string | null;
}

export interface Dashboard {
  mySessions: number;
  people: {
    active: number;
    suspended: number;
    pendingInvitations: number;
  } | null;
  users: { total: number; joinedLast7Days: number; blocked: number } | null;
  activity: AuditEntry[] | null;
  security: { activeSessions: number; failedSignIns24h: number } | null;
  articles: ArticleFigures | null;
}

export interface MySession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface StaffSessionRow extends MySession {
  staffId: string;
  displayName: string;
  email: string | null;
}

export interface AppUserRow {
  id: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  signIn: string[];
  status: 'ACTIVE' | 'BLOCKED' | 'PENDING';
  isStaff: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AppUserPage {
  items: AppUserRow[];
  nextCursor: string | null;
}

export interface AppUserDetail extends AppUserRow {
  avatarUrl: string | null;
  referralCode: string | null;
  walletBalance: number | null;
  orders: number;
  rooms: number;
  referrals: number;
  moderation: {
    id: string;
    action: string;
    actorEmail: string | null;
    before: unknown;
    after: unknown;
    meta: unknown;
    createdAt: string;
  }[];
}

export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  contactEmail: string;
  playStoreUrl: string;
  social: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    facebook?: string;
  };
  headCode: string;
  bodyStartCode: string;
  bodyEndCode: string;
}

export interface SiteSettingsView {
  settings: SiteSettings;
  updatedAt: string | null;
}

// ── Newsroom (Phase 4) ─────────────────────────────────────────────────

export type ArticleStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ARCHIVED';

export interface ArticleCapabilities {
  ownWork: boolean;
  read: boolean;
  edit: boolean;
  editSeo: boolean;
  submit: boolean;
  withdraw: boolean;
  review: boolean;
  publish: boolean;
  schedule: boolean;
  unschedule: boolean;
  unpublish: boolean;
  archive: boolean;
  cancel: boolean;
  reopen: boolean;
  delete: boolean;
  correct: boolean;
  feature: boolean;
  assign: boolean;
  comment: boolean;
}

export interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  status: ArticleStatus;
  version: number;
  isFeatured: boolean;
  isBreaking: boolean;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  category: { id: string; name: string } | null;
  author: { id: string; name: string } | null;
  createdBy: { id: string; displayName: string } | null;
  thumbUrl: string | null;
  comments: number;
}

export interface ArticlePage {
  items: ArticleListItem[];
  nextCursor: string | null;
}

export type ArticleCounts = Record<ArticleStatus, number> & { total: number };

export interface MediaAsset {
  id: string;
  url: string | null;
  thumbUrl: string | null;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  caption: string | null;
  credit: string | null;
  status: 'PENDING' | 'READY' | 'DELETED';
  originalName: string | null;
  uploadedBy: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface MediaPage {
  items: MediaAsset[];
  nextCursor: string | null;
  enabled: boolean;
  maxBytes: number;
}

export interface ArticleSeo {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  ogImageId?: string;
}

export interface SourceCredit {
  name: string;
  url?: string;
  note?: string;
}

export interface ArticleAssignment {
  id: string;
  role: 'WRITER' | 'EDITOR' | 'REVIEWER';
  status: 'OPEN' | 'DONE' | 'CANCELLED';
  note: string | null;
  dueAt: string | null;
  assignee: { id: string; displayName: string };
  assignedBy: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface ArticleReview {
  id: string;
  decision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  comment: string | null;
  version: number;
  reviewer: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface RelatedRef {
  id: string;
  title: string;
  slug: string;
  status: ArticleStatus;
}

export interface ArticleDetail {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  content: Record<string, unknown>;
  contentHtml: string;
  readingMinutes: number;
  status: ArticleStatus;
  version: number;
  category: { id: string; name: string; slug: string } | null;
  author: { id: string; name: string; slug: string } | null;
  createdBy: { id: string; displayName: string } | null;
  tags: { id: string; name: string; slug: string }[];
  featuredImage: MediaAsset | null;
  featuredImageCaption: string | null;
  sectors: string[];
  isFeatured: boolean;
  isBreaking: boolean;
  isAiGenerated: boolean;
  seo: ArticleSeo;
  sourceAttribution: SourceCredit[];
  editorialNotes: string | null;
  correctionNote: string | null;
  retractedAt: string | null;
  retractionNote: string | null;
  related: RelatedRef[];
  /** Companies the story is about; the first is the main one. */
  stocks: StockRef[];
  scheduledAt: string | null;
  publishedAt: string | null;
  firstPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: ArticleAssignment[];
  reviews: ArticleReview[];
  can: ArticleCapabilities;
}

/** A listed company (NSE/BSE ticker) with its name, when known. */
export interface StockRef {
  exchange: string;
  symbol: string;
  name: string | null;
}

export type HomeSectionType =
  'breaking' | 'featured' | 'latest' | 'category' | 'trending' | 'app_promo';

export interface HomeSectionConfig {
  id: string;
  type: HomeSectionType;
  enabled: boolean;
  title: string;
  limit?: number;
  categorySlug?: string;
}

export interface HomepageView {
  sections: HomeSectionConfig[];
  /** 0 until the layout is first saved (the default layout shows). */
  version: number;
  updatedAt: string | null;
  updatedBy: { id: string; displayName: string } | null;
  categories: {
    slug: string;
    name: string;
    isActive: boolean;
    parent: { slug: string; name: string } | null;
  }[];
  defaultLimits: Record<HomeSectionType, number>;
}

export interface SaveResult {
  id: string;
  version: number;
  status: ArticleStatus;
  slug: string;
  updatedAt: string;
  readingMinutes: number;
}

export interface VersionInfo {
  id: string;
  version: number;
  reason:
    | 'AUTOSAVE'
    | 'MANUAL'
    | 'SUBMIT'
    | 'APPROVE'
    | 'PUBLISH'
    | 'CORRECTION'
    | 'RESTORE';
  createdAt: string;
  title: string;
  words: number;
  editor: { id: string; displayName: string } | null;
}

export interface VersionDetail extends Omit<VersionInfo, 'title' | 'words'> {
  snapshot: {
    title: string;
    subtitle: string | null;
    summary: string;
    contentText: string;
    sectors: string[];
    tagIds: string[];
    categoryId: string | null;
  };
}

export interface ArticleComment {
  id: string;
  parentId: string | null;
  blockId: string | null;
  body: string;
  author: { id: string; displayName: string } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  parentId: string | null;
  position: number;
  isActive: boolean;
  articleCount: number;
}

export interface Tag {
  id: string;
  slug: string;
  name: string;
  articleCount: number;
}

export interface Byline {
  id: string;
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  socials: { twitter?: string; linkedin?: string; website?: string };
  isActive: boolean;
  staff: { id: string; displayName: string } | null;
  articleCount: number;
}

export interface ArticleBrief {
  id: string;
  title: string;
  status: ArticleStatus;
  updatedAt: string;
  scheduledAt: string | null;
  category: { name: string } | null;
}

export interface MyWork {
  assignments: {
    id: string;
    role: 'WRITER' | 'EDITOR' | 'REVIEWER';
    note: string | null;
    dueAt: string | null;
    assignedBy: { id: string; displayName: string } | null;
    createdAt: string;
    article: ArticleBrief;
  }[];
  drafts: ArticleBrief[];
  changesRequested: ArticleBrief[];
  inReview: ArticleBrief[];
  reviewQueue: number | null;
}

export interface DirectoryEntry {
  id: string;
  displayName: string;
  title: string | null;
  roles: string[];
}

export interface ArticleFigures {
  scope: 'all' | 'mine';
  total: number;
  drafts: number;
  changesRequested: number;
  inReview: number;
  approved: number;
  scheduled: number;
  published: number;
  publishedToday: number;
  overdueScheduled: number;
}

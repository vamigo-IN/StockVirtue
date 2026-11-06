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
  sources: SourceFigures | null;
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

/** Branding, search & indexing, analytics and ads (one group per save). */
export interface SiteConfigData {
  branding: {
    logoMediaId: string | null;
    faviconMediaId: string | null;
    shareImageMediaId: string | null;
    themeColor: string;
  };
  search: {
    titleTemplate: string;
    keywords: string;
    twitterHandle: string;
    googleVerification: string;
    bingVerification: string;
    yandexVerification: string;
    noindex: boolean;
    blockAiCrawlers: boolean;
    robotsExtra: string;
    sitemapCategories: boolean;
    sitemapTags: boolean;
    sitemapAuthors: boolean;
    googleNewsSitemap: boolean;
    llmsEnabled: boolean;
    llmsSummary: string;
    llmsArticles: number;
  };
  analytics: {
    ga4Id: string;
    gtmId: string;
    metaPixelId: string;
    clarityId: string;
  };
  ads: {
    adsenseClient: string;
    autoAds: boolean;
    adsTxt: string;
    withoutConsent: 'non_personalised' | 'off';
  };
  privacy: {
    legalName: string;
    postalAddress: string;
    officerName: string;
    officerEmail: string;
    officerPhone: string;
    responseDays: number;
  };
}

export interface SiteImageRef {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface SiteConfigView {
  config: SiteConfigData;
  /** The branding images, by media id. */
  images: Record<string, SiteImageRef>;
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
  /** Retract a live story (permission news.correct; the name is historical). */
  correct: boolean;
  feature: boolean;
  /** Send a notification to app readers (news.publish and news.feature). */
  notify: boolean;
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

/** Where a media file is kept. */
export type MediaStoreName = 'R2' | 'LOCAL';

export interface MediaAsset {
  id: string;
  url: string | null;
  thumbUrl: string | null;
  store: MediaStoreName;
  mimeType: string;
  bytes: number;
  /** What was uploaded before it became WebP; null for older images. */
  sourceType: string | null;
  sourceBytes: number | null;
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
  /** Where new uploads go right now. */
  store: MediaStoreName;
  maxBytes: number;
}

export interface StorageCheckStep {
  key: 'connect' | 'write' | 'read' | 'delete';
  label: string;
  /** null = not run, because an earlier step failed. */
  ok: boolean | null;
  detail?: string;
}

export interface StorageCheck {
  ok: boolean;
  steps: StorageCheckStep[];
  checkedAt: string;
}

export interface MediaStorageView {
  uploadsTo: MediaStoreName;
  r2: {
    accountId: string;
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    hasSecret: boolean;
    uploadToR2: boolean;
    connected: boolean;
    problem: string | null;
  };
  lastCheck: { at: string; ok: boolean; steps: StorageCheckStep[] } | null;
  server: {
    dir: string;
    writable: boolean;
    freeBytes: number | null;
    problem: string | null;
  };
  images: { r2: number; server: number };
  publicBaseUrl: string;
  maxUploadBytes: number;
  updatedAt: string | null;
  updatedBy: string | null;
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
  /** When it became breaking (switched on while live, or its publication). */
  breakingAt: string | null;
  /**
   * When the Breaking label comes off by itself (24 hours after it started);
   * null while it isn't breaking or isn't out yet.
   */
  breakingUntil: string | null;
  isAiGenerated: boolean;
  seo: ArticleSeo;
  sourceAttribution: SourceCredit[];
  editorialNotes: string | null;
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
  /** "Send a notification when published" (kept through scheduling). */
  notifyOnPublish: boolean;
  notification: ArticleNotification;
}

/**
 * The story's notification to app readers, as the Placement card shows it
 * (backend/src/newsroom/push/push-rules.ts, notificationView):
 * - switch: not live yet; the "Send a notification when published" switch;
 * - breaking: breaking news notifies it by itself, so no second one;
 * - pending: live with the switch on; the worker sends it within a minute;
 * - available: live, nothing sent yet; "Send notification now";
 * - closed: too late (24 hours after it first went live) or retracted;
 * - queued, sent, not_sent: its notification, in `campaign`.
 */
export interface ArticleNotification {
  state:
    | 'switch'
    | 'breaking'
    | 'pending'
    | 'available'
    | 'closed'
    | 'queued'
    | 'sent'
    | 'not_sent';
  notifyOnPublish: boolean;
  /** "Send notification now" works until then (null: never published). */
  sendUntil: string | null;
  campaign: {
    id: string;
    kind: 'BREAKING' | 'EDITORS_PICK';
    status: 'QUEUED' | 'SENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
    scheduledAt: string;
    sentAt: string | null;
    recipients: number;
    note: string | null;
  } | null;
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

export type MarketRight = 'LIVE' | 'DELAYED' | 'EOD' | 'OFF';
export type InstrumentKind = 'INDEX' | 'STOCK' | 'COMMODITY' | 'CURRENCY';

export interface MarketInstrument {
  id: string;
  kind: InstrumentKind;
  exchange: string;
  symbol: string;
  name: string;
  unit: string | null;
  position: number;
  isEnabled: boolean;
  inTicker: boolean;
  quote: { ltp: number; asOf: string } | null;
}

export interface MarketSource {
  key: string;
  name: string;
  webRight: MarketRight;
  appRight: MarketRight;
  delayMinutes: number;
  attribution: string;
  updatedAt: string;
}

export interface TickerSettings {
  version: number;
  config: import('@/market/types').TickerConfig;
}

export interface SavedWidget {
  id: string;
  name: string;
  type: import('@/components/widgets/meta').WidgetType;
  version: number;
  config: Record<string, unknown>;
  symbols: string[];
  uses: number;
  createdAt: string;
  updatedAt: string;
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
    /** Stored reason for a retraction (and for old, retired correction notes). */
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
  /** Its stories stay out of Top stories and the latest-news list. */
  keepSeparate: boolean;
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

// ── News sources and incoming news ─────────────────────────────────────

export type SourceType =
  | 'RSS'
  | 'LICENSED_API'
  | 'EXCHANGE'
  | 'COMPANY_IR'
  | 'RBI'
  | 'SEBI'
  | 'GOVERNMENT'
  | 'MANUAL';
export type SourceFormat = 'FEED' | 'JSON_API' | 'NONE';
export type SourceUsage = 'HEADLINE_ONLY' | 'SUMMARY' | 'FULL_TEXT';
export type SourceHealth =
  'manual' | 'paused' | 'pending' | 'healthy' | 'degraded' | 'failing';

export interface SourceMapping {
  itemsPath: string;
  fields: Record<string, string>;
}

export type ArrivalMode = 'INBOX' | 'DRAFT' | 'PUBLISH';

/** A ready-made official source with its checked terms. */
export interface CatalogueSource {
  key: string;
  name: string;
  region: 'India' | 'Global';
  type: SourceType;
  url: string;
  homepage: string;
  usage: SourceUsage;
  pollMinutes: number;
  attribution: string;
  terms: string;
  termsUrl: string;
  caution?: string;
  /** A government body or regulator: its stories go in Official updates. */
  official: boolean;
  added: boolean;
}

export interface NewsSourceView {
  id: string;
  name: string;
  type: SourceType;
  format: SourceFormat;
  url: string | null;
  auth: { mode: 'none' | 'header' | 'query'; name?: string };
  hasSecret: boolean;
  /** False when the saved secret was sealed with another key. */
  secretReadable: boolean;
  mapping: SourceMapping;
  pollMinutes: number;
  isActive: boolean;
  category: { id: string; name: string } | null;
  usage: SourceUsage;
  allowAiDrafts: boolean;
  /** Its licence covers its pictures (full-text sources only). */
  useImages: boolean;
  attribution: string;
  licenceNote: string | null;
  notifyEditors: boolean;
  /** What happens to new items (a Super Admin's choice). */
  arrivalMode: ArrivalMode;
  /** Automatic stories per day; the rest wait in Incoming news. */
  autoDailyLimit: number;
  health: SourceHealth;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextPollAt: string | null;
  createdAt: string;
  updatedAt: string;
  waiting?: number;
  last24h?: number;
  total?: number;
}

export interface SourcePreview {
  httpStatus: number;
  found: number;
  items: {
    title: string;
    url: string | null;
    publishedAt: string | null;
    summary: string | null;
    hasFullText: boolean;
    hasImage: boolean;
    author: string | null;
  }[];
}

export type FetchStatus = 'RUNNING' | 'SUCCESS' | 'NOT_MODIFIED' | 'FAILED';

export interface FetchLogRow {
  id: string;
  source: { id: string; name: string };
  trigger: 'SCHEDULE' | 'MANUAL' | 'RETRY';
  status: FetchStatus;
  requestedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  httpStatus: number | null;
  itemsSeen: number;
  itemsNew: number;
  itemsDuplicate: number;
  error: string | null;
  retryOfId: string | null;
  retriedBy: { id: string; status: FetchStatus; startedAt: string } | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ItemStatus = 'NEW' | 'DRAFTED' | 'DISMISSED' | 'DUPLICATE';

export interface ItemStock {
  exchange: 'NSE';
  symbol: string;
  name: string;
  via: 'name' | 'symbol' | 'alias';
}

export interface SourceItem {
  id: string;
  title: string;
  url: string | null;
  summary: string | null;
  hasFullText: boolean;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  usage: SourceUsage;
  allowAiDrafts: boolean;
  attribution: string;
  feedCategories: string[];
  stocks: ItemStock[];
  topics: string[];
  status: ItemStatus;
  duplicateScore: number | null;
  source: { id: string; name: string; type: SourceType };
  suggestedCategory: { id: string; name: string } | null;
  duplicateOf: {
    id: string;
    title: string;
    status: ItemStatus;
    source: string;
  } | null;
  duplicateOfArticle: { id: string; title: string; status: string } | null;
  article: { id: string; title: string; status: string } | null;
  handledBy: { id: string; displayName: string } | null;
  handledAt: string | null;
  aiDraft: {
    id: string;
    status: AiJobStatus;
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  } | null;
}

export interface SourceItemPage extends Paged<SourceItem> {
  counts: Record<ItemStatus, number>;
}

export interface SourceItemDetail extends SourceItem {
  content: string | null;
  draft: {
    id: string;
    output: AiDraftOutput;
    checks: AiChecks | null;
    model: string | null;
    finishedAt: string | null;
  } | null;
}

export interface StockAlias {
  id: string;
  phrase: string;
  exchange: string | null;
  symbol: string | null;
  company: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface SimilarStories {
  stories: {
    id: string;
    title: string;
    status: string;
    publishedAt: string | null;
    updatedAt: string;
    score: number;
  }[];
  items: {
    id: string;
    title: string;
    status: ItemStatus;
    url: string | null;
    fetchedAt: string;
    source: string;
    score: number;
  }[];
}

export interface SourceFigures {
  total: number;
  manual: number;
  paused: number;
  pending: number;
  healthy: number;
  degraded: number;
  failing: number;
  waiting: number;
  last24h: number;
}

// ── AI assistant ───────────────────────────────────────────────────────

export type AiTask =
  | 'DRAFT_FROM_SOURCE'
  | 'DRAFT_FROM_NOTES'
  | 'HEADLINES'
  | 'SUMMARY'
  | 'SEO'
  | 'TAXONOMY'
  | 'RELATED_STOCKS'
  | 'RELATED_ARTICLES'
  | 'REVIEW'
  | 'EXPLAINERS'
  | 'REWRITE_SECTION';
export type AiJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type AiProviderKind =
  'ANTHROPIC' | 'OPENAI' | 'OPENAI_COMPATIBLE' | 'OLLAMA';

export interface AiStatus {
  enabled: boolean;
  ready: boolean;
  reason: string | null;
  provider: { name: string; kind: AiProviderKind; model: string } | null;
  tasks: { task: AiTask; label: string; enabled: boolean }[];
  autoDraft: boolean;
  usage: {
    mineToday: number;
    dailyLimit: number;
    monthSpendUsd: number;
    monthlyBudgetUsd: number | null;
  };
}

export interface AiProviderView {
  id: string;
  name: string;
  kind: AiProviderKind;
  baseUrl: string | null;
  model: string;
  hasKey: boolean;
  keyReadable: boolean;
  inputCostPerMTok: number | null;
  outputCostPerMTok: number | null;
  timeoutSeconds: number;
  updatedAt: string;
}

export interface AiSettingsView {
  enabled: boolean;
  providerId: string | null;
  autoDraft: boolean;
  disabledTasks: AiTask[];
  monthlyBudgetUsd: number | null;
  dailyJobsPerUser: number;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  providers: AiProviderView[];
  tasks: { task: AiTask; label: string }[];
  models: {
    ANTHROPIC: { id: string; label: string; input: number; output: number }[];
  };
}

export interface AiUsage {
  since: string;
  spendUsd: number;
  failed: number;
  jobs: number;
  byTask: {
    task: AiTask;
    label: string;
    jobs: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }[];
}

export interface AiChecks {
  removed: {
    text: string;
    reason: 'figures' | 'copied';
    figures?: string[];
  }[];
  withheld: { text: string; figures: string[] }[];
}

export interface AiDraftOutput {
  headline: string;
  standfirst: string;
  summary: string;
  keyPoints: string[];
  sections: { heading: string; paragraphs: string[] }[];
}

export interface AiJob {
  id: string;
  task: AiTask;
  label: string;
  status: AiJobStatus;
  output: unknown;
  checks: AiChecks | null;
  error: string | null;
  provider: AiProviderKind | null;
  model: string | null;
  promptVersion: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
  appliedAt: string | null;
  requestedBy: { id: string; displayName: string } | null;
  automatic: boolean;
  article: { id: string; title: string } | null;
  sourceItem: { id: string; title: string } | null;
  input?: unknown;
}

// ─── Privacy requests (DPDP Act) ────────────────────────────────────────

export type PrivacyRequestType =
  | 'ACCESS'
  | 'CORRECTION'
  | 'ERASURE'
  | 'NOMINATION'
  | 'WITHDRAW_CONSENT'
  | 'GRIEVANCE'
  | 'OTHER';
export type PrivacyRequestStatus =
  'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

export interface PrivacyRequestView {
  id: string;
  reference: string;
  type: PrivacyRequestType;
  details: string;
  /** app | web | staff */
  channel: string;
  status: PrivacyRequestStatus;
  name: string | null;
  email: string | null;
  phone: string | null;
  dueAt: string;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** The matched account, if any. */
  user: {
    id: string;
    displayName: string | null;
    status: string;
    createdAt: string;
    eraseAfter: string | null;
  } | null;
  handledBy: { id: string; displayName: string } | null;
}

export interface PrivacyRequestsPage {
  items: PrivacyRequestView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: { open: number; overdue: number };
}

// ── Website content (W7: the admin-managed public site) ─────────────────
// Shapes of /api/v1/staff/site/content/**, previews and the privacy notice
// (W7 addendum §7.2). The content itself is typed in src/content/site/types.ts.

/** Who saved or published: the API may send a name, an email or an object. */
export type SitePerson =
  | string
  | { id?: string; displayName?: string | null; email?: string | null }
  | null;

export type SiteItemKind = 'DESIGNED' | 'SHARED' | 'CHROME' | 'LEGAL' | 'CUSTOM';
/** BUILT_IN: a fixed item with no row yet (the code default is live). */
export type SiteItemStatus = 'BUILT_IN' | 'DRAFT' | 'LIVE' | 'HIDDEN' | 'ARCHIVED';
export type SiteRevisionChange = 'SEED' | 'EDIT' | 'MINOR' | 'MATERIAL' | 'SETTINGS';

export interface SiteItemLive {
  number: number;
  publishedAt: string;
  publishedBy: SitePerson;
  noticeVersion: string | null;
  change?: SiteRevisionChange;
}

/** A row of the Pages list (fixed items appear even without a row, as BUILT_IN). */
export interface SiteContentItem {
  key: string;
  kind: SiteItemKind;
  title: string;
  /** The page it renders on ("/privacy", "/refund-policy"); null for shared blocks and the chrome. */
  path: string | null;
  lang: 'en' | 'hi';
  status: SiteItemStatus;
  hasDraft: boolean;
  /** The optimistic lock of the draft (0 = never saved). */
  draftVersion: number;
  draftUpdatedAt: string | null;
  draftUpdatedBy: SitePerson;
  /** Set by "Restore rev N into the draft" until the next publish or discard. */
  restoredFromId: string | null;
  live: SiteItemLive | null;
  /** The fact texts (F-id → text) the live revision relied on. */
  factsSnapshot: Record<string, string> | null;
  /** Custom pages (the key is the row's UUID). */
  slug?: string | null;
  previousSlugs?: string[];
}

export interface SiteContentList {
  items: SiteContentItem[];
}

export interface SiteRevisionInfo {
  id: string;
  number: number;
  change: SiteRevisionChange;
  summary: string;
  summaryHi: string;
  noticeVersion: string | null;
  /** The "Updated" date the page shows for this revision. */
  dateShown: string;
  dateLabel?: string | null;
  publishedAt: string;
  publishedBy: SitePerson;
  publishedByEmail?: string | null;
  contentHash?: string;
  restoredFromId?: string | null;
  announcedAt?: string | null;
  announcedVia?: string | null;
  /** Legal documents: the resolved values the page renders with. */
  liveValues?: Record<string, string> | null;
  factsSnapshot?: Record<string, string> | null;
  /** In the revision list: this is the published one. */
  live?: boolean;
}

/** GET staff/site/content/:key */
export interface SiteItemView {
  item: SiteContentItem;
  /** The unpublished edit, or null when the editor starts from the live one. */
  draft: unknown;
  draftVersion: number;
  live: { revision: SiteRevisionInfo; content: unknown } | null;
  schemaVersion: number;
}

export interface SiteRevisionList {
  items: SiteRevisionInfo[];
}

/** GET staff/site/content/:key/revisions/:id */
export interface SiteRevisionDetail {
  revision: SiteRevisionInfo;
  content: unknown;
}

export interface SiteDraftSaved {
  draftVersion: number;
  savedAt?: string;
  /** Allowed in a draft, refused at publish (e.g. a menu link to a draft page). */
  warnings?: SiteFieldError[];
}

/** One field the API refused (400 invalid_content). */
export interface SiteFieldError {
  /** "hero.title", "items[2].lead", "body.content[3]". */
  path: string;
  message: string;
}

/** A field rule as the API sends it (GET …/types), keyed by dot path ("items[].lead"). */
export type SiteFieldRuleView = {
  kind: string;
  len?: [number, number];
  count?: [number, number];
  optional?: boolean;
  legalLocked?: boolean;
  tokens?: string[];
  note?: string;
} & Record<string, unknown>;

export interface SiteTypeView {
  key: string;
  kind: SiteItemKind;
  title: string;
  path: string | null;
  lang: 'en' | 'hi';
  schema: unknown;
  limits: Record<string, SiteFieldRuleView>;
}

export interface SiteDocProfileView {
  tokens: string[];
  cookieSettings: boolean;
  images: boolean;
  requestForm: boolean;
  requiredAnchors: string[];
  /** What a publish must keep, in words ("a link to /privacy"). */
  hooks: string[];
}

/** GET staff/site/content/types: schemas, limits, tokens and the legal profiles. */
export interface SiteContentTypes {
  schemaVersion: number;
  /** The draft size cap in bytes (90 KB). */
  maxBytes: number;
  items: Record<string, SiteTypeView>;
  legal: {
    keys: { key: string; title: string; path: string | null; lang: 'en' | 'hi'; profile: string; showUpdated: boolean }[];
    head: { schema: unknown; limits: Record<string, SiteFieldRuleView> };
    profiles: Record<string, SiteDocProfileView>;
    docLimits: Record<string, unknown>;
  };
  /** W7 decision 5: TERMS_MIN_NOTICE_DAYS (0 for now) and the ways users can be told. */
  terms: { minNoticeDays: number; announcedVia: string[] };
  tokens: string[];
  reservedIds: { pattern: string; maxLength: number; exact: string[]; prefixes: string[]; message: string };
  slugs: { pattern: string; length: [number, number]; reserved: string[] };
  chrome: {
    widthBudgetPx: number;
    menuUrlMaxLength: number;
    forbiddenLabels: string[];
    footerKeys: string[];
    paths: string[];
    pathPatterns: string[];
  };
  facts: { pattern: string };
}

export interface SitePreview {
  token: string;
  url: string;
  warnings?: SiteFieldError[];
}

/** A material version of the privacy notice. */
export interface PrivacyNoticeVersionRow {
  version: string;
  /** Older payloads named it id. */
  id?: string;
  seq?: number;
  materialAt: string;
  summaryEn: string;
  summaryHi: string;
  announce: boolean;
  affectsAnalytics: boolean;
  affectsCookies: boolean;
  publishedByEmail?: string;
  createdAt?: string;
}

/** GET staff/site/privacy-notice */
export interface PrivacyNoticeView {
  current: PrivacyNoticeVersionRow;
  versions: PrivacyNoticeVersionRow[];
  /** The id a material publish would create now (e.g. "2027-03"). */
  nextId: string;
  /** What the system does, whatever the notice says (§4.7). */
  codeFacts: {
    /** Whole days by kind of data ("deletedAccounts": 365). */
    retention: Record<string, number> | unknown;
    inactiveYears: number;
    recipients: string[] | unknown;
    /** By purpose: { necessary: [...], analytics: [...], advertising: [...] }. */
    cookieNames: Record<string, string[]> | string[] | unknown;
  };
  cookie: {
    version: number;
    services: { analytics?: string[]; advertising?: string[] } | null;
    reason: string;
    since: string | null;
  };
  gate: { enabled: boolean; forcedOff?: boolean };
}

/** POST staff/site/privacy-notice/publish */
export interface PrivacyNoticePublished {
  version: string;
  revisions: unknown;
  cookieVersion?: number | null;
}

/** GET staff/site/privacy-notice/gate (the app notice gate, W7 decision 2). */
export interface NoticeGateView {
  enabled: boolean;
  /** PRIVACY_NOTICE_GATE_DISABLED on the server. */
  forcedOff: boolean;
  /** Blocking now: enabled and not forced off. */
  on?: boolean;
  changedAt: string | null;
  changedBy: SitePerson;
  playConfirmedAt: string | null;
  /** The current notice version. */
  version: string;
  /** Accounts that would be (or are) blocked: all active, and those seen in 30 days. */
  wouldBlock: { active: number; recent: number } | null;
  /**
   * Every active account: the number a material publish would ask again
   * ("every active account (12,400)", §5.1). Not in the §7.2 table; shown
   * only when the API sends it (requested from W7-B).
   */
  activeAccounts?: number;
}

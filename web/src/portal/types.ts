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

/** Where a media file is kept. */
export type MediaStoreName = 'R2' | 'LOCAL';

export interface MediaAsset {
  id: string;
  url: string | null;
  thumbUrl: string | null;
  store: MediaStoreName;
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
  /** Where new uploads go right now. */
  store: MediaStoreName;
  maxBytes: number;
}

export interface StorageCheckStep {
  key: 'connect' | 'write' | 'read' | 'cors' | 'delete';
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
  /** Where the portal uploads from: the bucket's CORS rule must allow it. */
  uploadOrigin: string;
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
  attribution: string;
  licenceNote: string | null;
  notifyEditors: boolean;
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

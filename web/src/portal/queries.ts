'use client';

import {
  useInfiniteQuery,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './api';
import type {
  AiJob,
  AiSettingsView,
  AiStatus,
  AiUsage,
  AppUserDetail,
  AppUserPage,
  ArticleComment,
  ArticleCounts,
  ArticleDetail,
  ArticlePage,
  AuditPage,
  Byline,
  Category,
  Dashboard,
  DirectoryEntry,
  FetchLogRow,
  FetchStatus,
  HomepageView,
  Invitation,
  MarketInstrument,
  MarketSource,
  SavedWidget,
  TickerSettings,
  MediaPage,
  MediaStorageView,
  MySession,
  MyWork,
  NewsSourceView,
  Paged,
  PermissionInfo,
  RoleInfo,
  SimilarStories,
  SiteSettingsView,
  SourceItemDetail,
  SourceItemPage,
  StaffMe,
  StaffMember,
  StaffSessionRow,
  StockAlias,
  StockRef,
  Tag,
  VersionDetail,
  VersionInfo,
} from './types';

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  members: ['staff', 'members'] as const,
  roles: ['staff', 'roles'] as const,
  permissions: ['staff', 'permissions'] as const,
  invitations: ['staff', 'invitations'] as const,
  audit: (action: string) => ['audit', action] as const,
  users: (q: string, status: string) => ['users', q, status] as const,
  user: (id: string) => ['user', id] as const,
  mySessions: ['sessions', 'mine'] as const,
  allSessions: ['sessions', 'all'] as const,
  site: ['site-settings'] as const,
  mediaStorage: ['media-storage'] as const,
  homepage: ['site-homepage'] as const,
  marketInstruments: ['market', 'instruments'] as const,
  marketSource: ['market', 'source'] as const,
  ticker: ['market', 'ticker'] as const,
  savedWidgets: ['saved-widgets'] as const,
  stocks: (q: string) => ['stocks', q] as const,
  articles: (f: ArticleFilters) => ['articles', 'list', f] as const,
  articleCounts: (scope: string) => ['articles', 'counts', scope] as const,
  article: (id: string) => ['article', id] as const,
  versions: (id: string) => ['article', id, 'versions'] as const,
  version: (id: string, vid: string) =>
    ['article', id, 'version', vid] as const,
  comments: (id: string) => ['article', id, 'comments'] as const,
  categories: ['taxonomy', 'categories'] as const,
  tags: (q: string) => ['taxonomy', 'tags', q] as const,
  authors: ['taxonomy', 'authors'] as const,
  media: (q: string) => ['media', q] as const,
  myWork: ['my-work'] as const,
  directory: ['directory'] as const,
  sources: ['sources'] as const,
  source: (id: string) => ['sources', 'one', id] as const,
  fetchLogs: (f: FetchLogFilters) => ['sources', 'logs', f] as const,
  items: (f: ItemFilters) => ['source-items', 'list', f] as const,
  item: (id: string) => ['source-items', 'one', id] as const,
  stockAliases: ['stock-mapping'] as const,
  aiStatus: ['ai', 'status'] as const,
  aiSettings: ['ai', 'settings'] as const,
  aiUsage: ['ai', 'usage'] as const,
  aiJobs: (f: AiJobFilters) => ['ai', 'jobs', f] as const,
  aiJob: (id: string) => ['ai', 'job', id] as const,
  similar: (id: string) => ['article', id, 'similar'] as const,
};

export interface FetchLogFilters {
  sourceId?: string;
  status?: FetchStatus;
  page?: number;
}

export interface ItemFilters {
  status?: string;
  sourceId?: string;
  q?: string;
  stock?: string;
  topic?: string;
  page?: number;
}

export interface AiJobFilters {
  articleId?: string;
  task?: string;
  status?: string;
  scope?: 'mine' | 'all';
  page?: number;
}

export interface ArticleFilters {
  status?: string;
  q?: string;
  categoryId?: string;
  scope?: 'all' | 'mine' | 'assigned';
}

/** The signed-in person, seeded by the server and refreshed on focus. */
export function useMe(initial: StaffMe) {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api<StaffMe>('staff/auth/me'),
    initialData: initial,
    staleTime: 60_000,
  });
}

export const useDashboard = () =>
  useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api<Dashboard>('staff/dashboard'),
  });

export const useMembers = () =>
  useQuery({
    queryKey: qk.members,
    queryFn: () => api<StaffMember[]>('staff/members'),
  });

export const useRoles = () =>
  useQuery({
    queryKey: qk.roles,
    queryFn: () => api<RoleInfo[]>('staff/roles'),
  });

export const usePermissions = () =>
  useQuery({
    queryKey: qk.permissions,
    queryFn: () => api<PermissionInfo[]>('staff/permissions'),
    staleTime: Infinity,
  });

export const useInvitations = () =>
  useQuery({
    queryKey: qk.invitations,
    queryFn: () => api<Invitation[]>('staff/invitations'),
  });

export const useAudit = (action: string) =>
  useInfiniteQuery({
    queryKey: qk.audit(action),
    queryFn: ({ pageParam }) =>
      api<AuditPage>('staff/audit', {
        query: { action, before: pageParam, limit: 50 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });

export const useAppUsers = (q: string, status: string) =>
  useInfiniteQuery({
    queryKey: qk.users(q, status),
    queryFn: ({ pageParam }) =>
      api<AppUserPage>('staff/users', {
        query: { q, status, cursor: pageParam, limit: 25 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useAppUser = (id: string) =>
  useQuery({
    queryKey: qk.user(id),
    queryFn: () => api<AppUserDetail>(`staff/users/${id}`),
  });

export const useMySessions = () =>
  useQuery({
    queryKey: qk.mySessions,
    queryFn: () => api<MySession[]>('staff/auth/sessions'),
  });

export const useAllSessions = (enabled: boolean) =>
  useQuery({
    queryKey: qk.allSessions,
    queryFn: () => api<StaffSessionRow[]>('staff/security/sessions'),
    enabled,
  });

export const useSiteSettings = () =>
  useQuery({
    queryKey: qk.site,
    queryFn: () => api<SiteSettingsView>('staff/site/settings'),
  });

export const useMediaStorage = () =>
  useQuery({
    queryKey: qk.mediaStorage,
    queryFn: () => api<MediaStorageView>('staff/media-storage'),
  });

export const useHomepage = () =>
  useQuery({
    queryKey: qk.homepage,
    queryFn: () => api<HomepageView>('staff/site/homepage'),
  });

export const useMarketInstruments = () =>
  useQuery({
    queryKey: qk.marketInstruments,
    queryFn: () => api<MarketInstrument[]>('staff/market/instruments'),
    staleTime: 60_000,
  });

export const useMarketSource = () =>
  useQuery({
    queryKey: qk.marketSource,
    queryFn: () => api<MarketSource>('staff/market/source'),
  });

export const useTickerSettings = () =>
  useQuery({
    queryKey: qk.ticker,
    queryFn: () => api<TickerSettings>('staff/market/ticker'),
  });

export const useSavedWidgets = (enabled = true) =>
  useQuery({
    queryKey: qk.savedWidgets,
    queryFn: () => api<SavedWidget[]>('staff/widgets'),
    enabled,
  });

/** Listed companies for "Related stocks" (served from the API's memory). */
export const useStockSearch = (q: string) =>
  useQuery({
    queryKey: qk.stocks(q),
    queryFn: () =>
      api<{ results: StockRef[] }>(
        `staff/stocks/search?q=${encodeURIComponent(q)}`,
      ),
    enabled: q.length >= 1,
    staleTime: 5 * 60_000,
  });

/** After a staff change: lists, counts and the activity feed are stale. */
export function invalidateStaff(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['staff'] });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
  void qc.invalidateQueries({ queryKey: ['audit'] });
}

// ── Newsroom ───────────────────────────────────────────────────────────

export const useArticles = (f: ArticleFilters) =>
  useInfiniteQuery({
    queryKey: qk.articles(f),
    queryFn: ({ pageParam }) =>
      api<ArticlePage>('staff/articles', {
        query: { ...f, cursor: pageParam, limit: 30 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useArticleCounts = (scope = 'all') =>
  useQuery({
    queryKey: qk.articleCounts(scope),
    queryFn: () =>
      api<ArticleCounts>('staff/articles/counts', { query: { scope } }),
  });

/**
 * Saves still running for an article, e.g. the flush when its editor closed.
 * Loading the article waits for them, so it never shows older text.
 */
export const pendingSaves = new Map<string, Promise<unknown>>();

/**
 * The article being edited: fetched fresh each time the page opens, then
 * the editor owns it (no background refetches overwriting typing).
 */
export const useArticle = (id: string) =>
  useQuery({
    queryKey: qk.article(id),
    queryFn: async () => {
      await pendingSaves.get(id);
      return api<ArticleDetail>(`staff/articles/${id}`);
    },
    staleTime: Infinity,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

export const useVersions = (id: string) =>
  useQuery({
    queryKey: qk.versions(id),
    queryFn: () => api<VersionInfo[]>(`staff/articles/${id}/versions`),
  });

export const useVersion = (id: string, vid: string | null) =>
  useQuery({
    queryKey: qk.version(id, vid ?? ''),
    queryFn: () => api<VersionDetail>(`staff/articles/${id}/versions/${vid}`),
    enabled: !!vid,
    staleTime: Infinity,
  });

export const useComments = (id: string) =>
  useQuery({
    queryKey: qk.comments(id),
    queryFn: () => api<ArticleComment[]>(`staff/articles/${id}/comments`),
  });

export const useCategories = () =>
  useQuery({
    queryKey: qk.categories,
    queryFn: () => api<Category[]>('staff/categories'),
    staleTime: 60_000,
  });

export const useTags = (q: string) =>
  useQuery({
    queryKey: qk.tags(q),
    queryFn: () => api<Tag[]>('staff/tags', { query: { q } }),
    staleTime: 30_000,
  });

export const useAuthors = () =>
  useQuery({
    queryKey: qk.authors,
    queryFn: () => api<Byline[]>('staff/authors'),
    staleTime: 60_000,
  });

export const useMedia = (q: string, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.media(q),
    queryFn: ({ pageParam }) =>
      api<MediaPage>('staff/media', {
        query: { q, cursor: pageParam, limit: 30 },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });

export const useMyWork = () =>
  useQuery({
    queryKey: qk.myWork,
    queryFn: () => api<MyWork>('staff/my-work'),
  });

export const useDirectory = (enabled: boolean) =>
  useQuery({
    queryKey: qk.directory,
    queryFn: () => api<DirectoryEntry[]>('staff/directory'),
    enabled,
    staleTime: 60_000,
  });

/** After an article changes: lists, counts, queues and the dashboard. */
export function invalidateArticles(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['articles'] });
  void qc.invalidateQueries({ queryKey: qk.myWork });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
  void qc.invalidateQueries({ queryKey: ['audit'] });
}

// ── News sources and incoming news ─────────────────────────────────────

export const useSources = (enabled = true) =>
  useQuery({
    queryKey: qk.sources,
    queryFn: () => api<NewsSourceView[]>('staff/sources'),
    enabled,
    refetchInterval: 30_000,
  });

export const useSource = (id: string) =>
  useQuery({
    queryKey: qk.source(id),
    queryFn: () => api<NewsSourceView>(`staff/sources/${id}`),
    refetchInterval: 15_000,
  });

export const useFetchLogs = (f: FetchLogFilters) =>
  useQuery({
    queryKey: qk.fetchLogs(f),
    queryFn: () =>
      api<Paged<FetchLogRow>>('staff/sources/logs', { query: { ...f } }),
    // A fetch now / retry finishes within seconds; keep the history live.
    refetchInterval: 10_000,
  });

export const useSourceItems = (f: ItemFilters) =>
  useQuery({
    queryKey: qk.items(f),
    queryFn: () =>
      api<SourceItemPage>('staff/source-items', { query: { ...f } }),
    refetchInterval: 30_000,
  });

export const useSourceItem = (id: string | null) =>
  useQuery({
    queryKey: qk.item(id ?? ''),
    queryFn: () => api<SourceItemDetail>(`staff/source-items/${id}`),
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data?.aiDraft &&
      ['QUEUED', 'RUNNING'].includes(q.state.data.aiDraft.status)
        ? 2_000
        : false,
  });

/** Waiting items, for the nav badge. */
export const useIncomingCount = (enabled: boolean) =>
  useQuery({
    queryKey: qk.items({ status: 'NEW', page: 1 }),
    queryFn: () =>
      api<SourceItemPage>('staff/source-items', {
        query: { status: 'NEW', page: 1 },
      }),
    enabled,
    refetchInterval: 60_000,
    select: (d) => d.counts.NEW,
  });

export const useStockAliases = () =>
  useQuery({
    queryKey: qk.stockAliases,
    queryFn: () => api<StockAlias[]>('staff/stock-mapping'),
  });

export const useSimilar = (articleId: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.similar(articleId),
    queryFn: () => api<SimilarStories>(`staff/articles/${articleId}/similar`),
    enabled,
  });

export function invalidateIncoming(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['source-items'] });
  void qc.invalidateQueries({ queryKey: qk.sources });
  void qc.invalidateQueries({ queryKey: qk.dashboard });
}

// ── AI assistant ───────────────────────────────────────────────────────

export const useAiStatus = (enabled = true) =>
  useQuery({
    queryKey: qk.aiStatus,
    queryFn: () => api<AiStatus>('staff/ai/status'),
    enabled,
    staleTime: 30_000,
  });

export const useAiSettings = () =>
  useQuery({
    queryKey: qk.aiSettings,
    queryFn: () => api<AiSettingsView>('staff/ai/settings'),
  });

export const useAiUsage = () =>
  useQuery({
    queryKey: qk.aiUsage,
    queryFn: () => api<AiUsage>('staff/ai/usage'),
  });

export const useAiJobs = (f: AiJobFilters, enabled = true) =>
  useQuery({
    queryKey: qk.aiJobs(f),
    queryFn: () => api<Paged<AiJob>>('staff/ai/jobs', { query: { ...f } }),
    enabled,
    refetchInterval: (q) =>
      q.state.data?.items.some(
        (j) => j.status === 'QUEUED' || j.status === 'RUNNING',
      )
        ? 3_000
        : false,
  });

const AI_DONE = ['SUCCEEDED', 'FAILED'];

/** One AI request, polled until it finishes. */
export const useAiJob = (id: string | null) =>
  useQuery({
    queryKey: qk.aiJob(id ?? ''),
    queryFn: () => api<AiJob>(`staff/ai/jobs/${id}`),
    enabled: !!id,
    refetchInterval: (q) =>
      q.state.data && AI_DONE.includes(q.state.data.status) ? false : 1_500,
  });

'use client';

import {
  useInfiniteQuery,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { api } from './api';
import type {
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
  Invitation,
  MediaPage,
  MySession,
  MyWork,
  PermissionInfo,
  RoleInfo,
  SiteSettingsView,
  StaffMe,
  StaffMember,
  StaffSessionRow,
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
};

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

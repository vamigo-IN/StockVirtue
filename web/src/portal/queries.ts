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
  AuditPage,
  Dashboard,
  Invitation,
  MySession,
  PermissionInfo,
  RoleInfo,
  SiteSettingsView,
  StaffMe,
  StaffMember,
  StaffSessionRow,
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
};

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

import type { StaffMe } from './types';

/**
 * Whether the portal should offer something. Only a convenience: the API
 * checks the same permission on every call, so hiding a button is never the
 * protection.
 */
export function can(
  me: Pick<StaffMe, 'isSuperAdmin' | 'permissions'>,
  permission: string,
): boolean {
  return me.isSuperAdmin || me.permissions.includes(permission);
}

/** Section names for the permission groups in the API's catalogue. */
export const PERMISSION_GROUPS: Record<string, string> = {
  news: 'Articles',
  taxonomy: 'Categories & tags',
  media: 'Media',
  widgets: 'Market widgets',
  market: 'Market data',
  sources: 'News sources',
  ai: 'AI assistant',
  staff: 'Staff',
  roles: 'Roles',
  users: 'App users',
  privacy: 'Privacy',
  site: 'Website',
  legal: 'Legal pages',
  ads: 'Ads',
  settings: 'Website settings',
  seo: 'SEO',
  notifications: 'Notifications',
  analytics: 'Analytics',
  audit: 'Audit log',
  security: 'Security',
};

export function groupLabel(group: string): string {
  return PERMISSION_GROUPS[group] ?? group;
}

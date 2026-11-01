/**
 * The newsroom's permission catalogue and default roles — the single source of
 * truth. Synced into the `permissions`, `roles` and `role_permissions` tables
 * on every boot (see rbac.sync.ts), so adding a permission here needs no
 * migration. System roles are owned by this file: their permission sets are
 * reset to match it on boot. Custom roles created in the portal are left alone.
 */

export interface PermissionDef {
  key: string;
  description: string;
}

export const PERMISSIONS = [
  // Articles
  { key: 'news.create', description: 'Create article drafts' },
  { key: 'news.read', description: 'View own and assigned articles' },
  { key: 'news.read_all', description: 'View every article in the newsroom' },
  { key: 'news.update_own', description: 'Edit own articles' },
  { key: 'news.update_all', description: "Edit anyone's articles" },
  { key: 'news.update_seo', description: 'Edit SEO fields on any article' },
  { key: 'news.submit_review', description: 'Submit articles for review' },
  { key: 'news.approve', description: 'Approve, reject or request changes' },
  { key: 'news.publish', description: 'Publish approved articles' },
  {
    key: 'news.publish_own',
    description: 'Approve and publish articles you wrote yourself',
  },
  { key: 'news.schedule', description: 'Schedule articles for later' },
  { key: 'news.unpublish', description: 'Take published articles down' },
  { key: 'news.archive', description: 'Archive articles' },
  { key: 'news.delete', description: 'Delete never-published articles' },
  { key: 'news.assign', description: 'Assign writers and reviewers' },
  { key: 'news.feature', description: 'Mark articles featured or breaking' },
  { key: 'news.correct', description: 'Issue corrections and retractions' },
  { key: 'news.comment', description: 'Leave editorial comments' },
  { key: 'taxonomy.manage', description: 'Manage categories and tags' },

  // Media and widgets
  { key: 'media.upload', description: 'Upload images and files' },
  { key: 'media.manage', description: "Edit or delete anyone's media" },
  { key: 'widgets.read', description: 'View saved market widgets' },
  { key: 'widgets.create', description: 'Create market widgets' },
  { key: 'widgets.update', description: 'Edit market widgets' },
  { key: 'widgets.delete', description: 'Delete market widgets' },
  {
    key: 'market.configure',
    description: 'Choose ticker instruments and market data rights',
  },

  // Sources and AI
  { key: 'sources.read', description: 'View news sources and fetched items' },
  { key: 'sources.create', description: 'Add news sources' },
  { key: 'sources.update', description: 'Edit, pause or retry news sources' },
  { key: 'sources.delete', description: 'Delete news sources' },
  { key: 'ai.use', description: 'Use the AI writing assistant' },
  { key: 'ai.configure', description: 'Configure AI providers and limits' },

  // People
  { key: 'staff.read', description: 'View staff members' },
  { key: 'staff.invite', description: 'Invite staff members' },
  { key: 'staff.update', description: "Change staff members' roles" },
  { key: 'staff.suspend', description: 'Suspend and reactivate staff' },
  { key: 'roles.manage', description: 'Create and edit custom roles' },
  { key: 'users.read', description: 'View website and app users' },
  { key: 'users.create', description: 'Create user accounts' },
  { key: 'users.update', description: 'Edit user accounts' },
  { key: 'users.suspend', description: 'Suspend user accounts' },

  // Website
  {
    key: 'site.manage',
    description: 'Edit homepage, navigation, pages and branding',
  },
  { key: 'ads.manage', description: 'Manage advertisement placements' },
  { key: 'settings.read', description: 'View website settings' },
  { key: 'settings.update', description: 'Edit website settings' },
  {
    key: 'settings.code_injection',
    description: 'Edit raw code injected into every page',
  },
  { key: 'seo.read', description: 'View SEO settings and redirects' },
  { key: 'seo.update', description: 'Edit SEO settings and redirects' },
  { key: 'notifications.send', description: 'Send push notifications' },

  // Insight and security
  { key: 'analytics.read', description: 'View analytics and reports' },
  { key: 'audit.read', description: 'View the audit log' },
  { key: 'security.manage', description: 'Manage security settings' },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map(
  (p) => p.key,
);

/** "news.publish" → "news" — groups permissions in the portal. */
export function permissionGroup(key: string): string {
  return key.split('.')[0];
}

export interface SystemRoleDef {
  key: string;
  name: string;
  description: string;
  permissions: readonly PermissionKey[];
}

const WRITING: PermissionKey[] = [
  'news.create',
  'news.read',
  'news.update_own',
  'news.submit_review',
  'news.comment',
  'media.upload',
];

const EDITING: PermissionKey[] = [
  ...WRITING,
  'news.read_all',
  'news.update_all',
  'news.update_seo',
  'news.approve',
  'news.publish',
  'news.schedule',
  'news.unpublish',
  'news.assign',
  'news.feature',
  'news.correct',
  'taxonomy.manage',
  'widgets.read',
  'widgets.create',
  'widgets.update',
  'sources.read',
  'ai.use',
  'analytics.read',
  'seo.read',
];

/** Permissions only a Super Admin holds by default. */
const SUPER_ADMIN_ONLY: PermissionKey[] = [
  'settings.code_injection',
  'security.manage',
  'roles.manage',
];

export const SUPER_ADMIN = 'SUPER_ADMIN';

export const SYSTEM_ROLES: readonly SystemRoleDef[] = [
  {
    key: SUPER_ADMIN,
    name: 'Super Admin',
    description: 'Full control of the newsroom, staff, roles and website.',
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: 'ADMIN',
    name: 'Admin',
    description:
      'Runs the newsroom and website day to day. Cannot edit roles, security settings or injected code.',
    permissions: ALL_PERMISSION_KEYS.filter(
      (k) => !SUPER_ADMIN_ONLY.includes(k),
    ),
  },
  {
    key: 'MANAGING_EDITOR',
    name: 'Managing Editor',
    description:
      'Owns the editorial desk: assigns work, approves, publishes and corrects.',
    permissions: [
      ...EDITING,
      'news.archive',
      'news.delete',
      'media.manage',
      'widgets.delete',
      'staff.read',
      'notifications.send',
    ],
  },
  {
    key: 'EDITOR',
    name: 'Editor',
    description: 'Reviews, approves and publishes articles.',
    permissions: EDITING,
  },
  {
    key: 'CONTENT_WRITER',
    name: 'Content Writer',
    description: 'Writes articles and submits them for review.',
    permissions: [...WRITING, 'widgets.read', 'sources.read', 'ai.use'],
  },
  {
    key: 'NEWS_RESEARCHER',
    name: 'News Researcher',
    description: 'Finds stories, adds sources and prepares drafts.',
    permissions: [...WRITING, 'sources.read', 'sources.create', 'ai.use'],
  },
  {
    key: 'SEO_MANAGER',
    name: 'SEO Manager',
    description: 'Owns search: article SEO fields, redirects and taxonomy.',
    permissions: [
      'news.read',
      'news.read_all',
      'news.update_seo',
      'news.comment',
      'taxonomy.manage',
      'media.upload',
      'seo.read',
      'seo.update',
      'analytics.read',
    ],
  },
  {
    key: 'MARKET_ANALYST',
    name: 'Market Analyst',
    description: 'Writes market analysis and builds market widgets.',
    permissions: [
      ...WRITING,
      'widgets.read',
      'widgets.create',
      'widgets.update',
      'ai.use',
    ],
  },
  {
    key: 'MODERATOR',
    name: 'Moderator',
    description: 'Looks after website and app users.',
    permissions: [
      'news.read',
      'news.read_all',
      'users.read',
      'users.update',
      'users.suspend',
    ],
  },
  {
    key: 'VIEWER',
    name: 'Viewer',
    description: 'Read-only access to the newsroom and reports.',
    permissions: [
      'news.read',
      'news.read_all',
      'widgets.read',
      'sources.read',
      'seo.read',
      'settings.read',
      'analytics.read',
    ],
  },
];

export const SYSTEM_ROLE_KEYS: readonly string[] = SYSTEM_ROLES.map(
  (r) => r.key,
);

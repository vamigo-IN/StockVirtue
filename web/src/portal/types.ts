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

/** Names of the built-in roles (mirrors backend/src/rbac/rbac.catalog.ts). */
const SYSTEM_ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGING_EDITOR: 'Managing Editor',
  EDITOR: 'Editor',
  CONTENT_WRITER: 'Content Writer',
  NEWS_RESEARCHER: 'News Researcher',
  SEO_MANAGER: 'SEO Manager',
  MARKET_ANALYST: 'Market Analyst',
  MODERATOR: 'Moderator',
  VIEWER: 'Viewer',
};

/** Display name for a role key, for people who can't list roles. */
export function roleLabel(key: string): string {
  return (
    SYSTEM_ROLE_NAMES[key] ??
    key
      .replace(/^CUSTOM_/, '')
      .split('_')
      .filter(Boolean)
      .map((w) => w[0] + w.slice(1).toLowerCase())
      .join(' ')
  );
}

const SENIORITY = Object.keys(SYSTEM_ROLE_NAMES);
const rank = (key: string) => {
  const i = SENIORITY.indexOf(key);
  return i < 0 ? SENIORITY.length : i;
};

/** Built-in roles by seniority (Super Admin first), then custom roles by name. */
export function sortRoles<T extends { key: string; name: string }>(
  roles: T[],
): T[] {
  return [...roles].sort(
    (a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name),
  );
}

/** The most senior role first, for one-line summaries. */
export function primaryRole(keys: string[]): string | null {
  return [...keys].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

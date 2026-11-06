/**
 * Ids that admin-chosen ids may never take (W7 addendum §3.1): anchors, FAQ
 * ids, group ids, item ids and document heading anchors. The site's own
 * shell, scripts, forms and tests look these up, so content must never claim
 * one (`sv-public`, `main`, a form field's id …).
 *
 * The API refuses them on save with a field error ("This link name is used
 * by the site itself. Pick another."); the renderers drop them as a second
 * guard (`safeId`). The list mirrors backend/src/site-content/schemas/
 * reserved-ids.ts, and W6 compares the two (§10.5). Final since M7.2b
 * (5 Nov 2026), which added About's section ids (W2's ABOUT_SECTION_IDS in
 * ./about.ts, M7.9).
 *
 * Also here: the reserved slugs of custom pages (addendum Appendix A), for
 * the portal's "New page" form. The API is authoritative for both lists.
 */

/** The `id` field kind's pattern (§3.1). */
export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ID_MAX_LENGTH = 60;

/** Exact ids, refused everywhere ('cookies' is allowed only as the privacy notices' required anchor). */
export const RESERVED_IDS = [
  // the skip link's target
  'main',
  // /privacy#cookies (the cookie banner links it)
  'cookies',
  // the home page's anchors
  'prices',
  'inside-the-app',
  // /features#wont-do
  'wont-do',
  // the /features chapter ids (`prices` is above)
  'orders',
  'fno',
  'portfolio',
  'learning',
  'account',
  // About's section ids (W2, M7.9: ABOUT_SECTION_IDS)
  'why-it-exists',
  'how-we-work',
  'what-were-not',
  'the-company',
  'write-to-us',
  // the contact form's field ids
  'name',
  'email',
  'subject',
  'message',
] as const;

/** Prefixes refused everywhere. */
export const RESERVED_ID_PREFIXES = [
  // sv-public (palette, motion gate, every Radix portal), sv-hero-figure
  'sv-',
  // legal-toc-title and the legal shell
  'legal-',
  // the request form's pr-email, pr-code, pr-name, pr-type, pr-details
  'pr-',
  // not-found-q (the root 404's search field)
  'not-found-',
  // section-… (Heads.tsx)
  'section-',
  // Radix's generated ids
  'radix-',
] as const;

/** Whether `id` has the `id` kind's shape (pattern and length). */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= ID_MAX_LENGTH && ID_PATTERN.test(id);
}

/**
 * Whether `id` is reserved by the site. `allow` lifts exact entries for one
 * place: `isReservedId('cookies', { allow: ['cookies'] })` is false (the two
 * privacy notices' required anchor).
 */
export function isReservedId(id: string, o: { allow?: readonly string[] } = {}): boolean {
  if (o.allow?.includes(id)) return false;
  if ((RESERVED_IDS as readonly string[]).includes(id)) return true;
  return RESERVED_ID_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * The renderers' second guard: `id` when it is well formed and not
 * reserved, else undefined (render the element without an id).
 *   <details id={safeId(item.id)}>
 * Never use it on the fixed ids the code owns (the /features chapter ids).
 */
export function safeId(id: unknown, o: { allow?: readonly string[] } = {}): string | undefined {
  return isValidId(id) && !isReservedId(id, o) ? id : undefined;
}

/* ── Custom pages' slugs (§3.12, Appendix A) ─────────────────────────────── */

/** A custom page's slug: the `id` pattern, 2–60 characters. */
export const SLUG_PATTERN = ID_PATTERN;
export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 60;

/** Refused at creation and on rename (compared case-insensitively). */
export const RESERVED_SLUGS = [
  // existing pages and route groups
  'about', 'contact', 'disclaimer', 'download', 'faq', 'features', 'privacy', 'terms', 'news', 'design-gallery',
  // app, infrastructure and W7 routes
  'admin', 'api', 'brand', 'preview',
  // route handlers and metadata routes
  'robots.txt', 'ads.txt', 'llms.txt', 'sitemap.xml', 'manifest.webmanifest', 'favicon.ico',
  // public/ folders and files
  'badges', 'email', 'fonts', 'screens', 'logo.png', 'logo-on-dark.png', 'og.png', 'icon.png', 'apple-icon.png',
  // Next and the web platform
  '_next', '.well-known',
  // held back for this feature and its likely next steps
  'p', 'page', 'pages', 'draft', 'legal', 'policies', 'policy', 'help', 'search', 'login', 'logout', 'signin',
  'signup', 'register', 'account', 'app', 'home', 'index', 'feed', 'rss', 'sitemap', 'static', 'assets', 'media',
  'images', 'img', 'cdn',
] as const;

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.toLowerCase());
}

/** Whether `slug` may name a custom page (pattern, length, not reserved). */
export function isValidSlug(slug: unknown): slug is string {
  return (
    typeof slug === 'string' &&
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    SLUG_PATTERN.test(slug) &&
    !isReservedSlug(slug)
  );
}

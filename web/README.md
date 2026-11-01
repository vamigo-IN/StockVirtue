# StockVirtue — Website (stockvirtue.com)

Marketing / portfolio site for the StockVirtue app, the public **news site** at
`/news`, and the **newsroom portal** at `/admin` (staff sign-in, team and roles,
app-user moderation, website settings, audit log, and the editorial desk:
articles, review queue, media library, categories and tags, news homepage).
Built with **Next.js (App Router) + TypeScript**, server-rendered for SEO. The
marketing pages use hand-written CSS; `/news` and `/admin` each use their own
Tailwind CSS v4 stylesheet. Links between these areas are plain `<a>` tags (full
page loads), so one area's styles never leak into another.

## Structure

```
src/
  app/
    (site)/        public marketing + legal pages (globals.css, header/footer, code injection)
    news/          public news site (news.css): home, stories, sections, tags, authors,
                   stocks, latest, search, feed.xml, sitemap.xml, news-sitemap.xml
    api/revalidate   signed hook the API calls to refresh news pages
    api/news/view    counts a story read (forwarded to the API)
    admin/         newsroom portal (portal.css; isolated from the site chrome)
      login/ invite/   sign-in (password + emailed code) and invitation acceptance
      (portal)/        signed-in pages: dashboard, articles (+ editor, history), review,
                       my-work, media, taxonomy, staff, roles, users, settings, audit, security
      api/[...path]/   the portal's backend-for-frontend (see below)
    layout.tsx     root <html><body> + global SEO metadata (no stylesheet)
    not-found.tsx  branded 404 for unknown URLs
    sitemap.ts robots.ts manifest.ts icon.svg
  components/      Header, Footer, Icon, JsonLd, CodeInjection
    news/          news masthead, cards, listings, share and view components
    ui/            shadcn/ui primitives (portal only: they need portal.css)
    portal/        portal shell and shared portal components
    editor/        the article editor (TipTap) and its custom blocks
  portal/          portal API client, server helpers, session cookie, types
  news/            news API client (server-only), routes, SEO and JSON-LD, formats
  styles/          article-prose.css: story typography shared by /news and the editor
  lib/
    site.ts        static brand/nav/content config
    settings.ts    runtime settings (fetched from the backend) + contact helper
```

## How it talks to the backend

All backend calls happen **server-side** (Next.js server → `api.stockvirtue.com`),
so there are no CORS changes and no secret ever reaches the browser:

- `GET  /site/settings`  — public site settings (read on every page, cached 60s)
- `POST /site/contact`   — contact-form submissions (emailed by the backend)
- `/v1/staff/...`        — the newsroom portal, via `/admin/api/...` (below)
- `GET /v1/news/...`     — the news site's stories, sections and sitemaps

The portal's browser code only calls `/admin/api/staff/...` on this server. That
route accepts same-origin requests carrying the portal's `x-sv-portal` header,
swaps the httpOnly session cookie (`__Host-sv_staff`, SameSite=Strict) for the
API's `x-staff-session` header, and adds `x-site-admin-key` plus the browser's
real IP / user agent. Every permission is checked by the API on every call.

If the backend endpoints aren't deployed yet, the site still renders with sensible
defaults (see `DEFAULT_SETTINGS`).

## Environment

Copy `.env.example` → `.env.local` (dev) or set on the server. **Secret:**
`SITE_ADMIN_KEY` (must match the backend's).

| var | purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | canonical URL (SEO/sitemap/OG) — `https://stockvirtue.com` |
| `NEXT_PUBLIC_PLAY_URL` | Google Play listing |
| `API_BASE` | backend base — `https://api.stockvirtue.com` |
| `SITE_ADMIN_KEY` | server-to-server key the portal sends to the API (matches backend); required for `/admin` |

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm run start   # production (port 3001)
```

## Deploy

Build and run under pm2 behind nginx on the `stockvirtue.com` host:

```bash
npm ci && npm run build
npm run start            # next start -p 3001  (e.g. pm2 start npm --name stockvirtue-web -- run start)
```

Point nginx `stockvirtue.com` → `127.0.0.1:3001` and pass the visitor's address
(`proxy_set_header X-Real-IP $remote_addr;`), which the portal forwards to the API
for rate limits and the audit log. (The backend stays on `api.stockvirtue.com`.)

## Newsroom portal (`/admin`)

- Staff sign in with their StockVirtue account password, then a 6-digit code
  emailed to them. Nobody has portal access until a Super Admin grants it: the
  first one on the server with
  `node dist/cli/grant-staff-role.js --email you@… --role SUPER_ADMIN` (backend),
  everyone else by invitation from **Staff**.
- Each role sees only the pages its permissions cover; the API enforces the same
  permissions on every request.
- **Site settings** (was the old password panel): title/description, contact
  email, Play URL, social links and **code injection** — raw HTML for
  verification (Google Search Console, Bing, Meta) and analytics (GA4, GTM,
  Pixel), injected server-side into every public page. Changing injected code
  needs the `settings.code_injection` permission (Super Admin by default), and
  every change is in the audit log with the old and new code.
- `/admin` is `noindex` and never loads the public chrome or injected code, so a
  broken snippet can't break the portal.
- **Articles**: writers draft in the editor (autosaves every few seconds; every
  milestone is kept in **History**, where versions can be compared and
  restored), then submit it. Editors pick stories up from the **Review** queue
  and approve, send back, schedule or publish them. Writers can't approve or
  publish their own work unless their role grants it. Scheduled stories are published by the
  backend worker (`stockvirtue-worker`), so it must be running.
- Story content is stored as structured blocks, not HTML: the API accepts only
  known blocks (headings, lists, quotes, tables, callouts, library images,
  YouTube/Vimeo, related stories) and renders the HTML itself, so no script or
  arbitrary embed can get into a story.
- **Media library**: images upload from the browser straight to the R2 bucket,
  then the API checks the file, strips its metadata and makes resized copies.
  The bucket needs a CORS rule allowing `PUT` and `GET` from this site's origin
  (see the backend's `.env.example`).
- **News homepage** (`site.manage`, Super Admin and Admin): which sections
  `/news` shows and in what order: breaking banner, featured, top stories,
  trending, one block per chosen category, app promotion.

## News site (`/news`)

- Only published stories whose publish time has passed are ever shown; the API
  enforces this in one place. Retracted stories stay readable with their notice
  but drop out of listings, search and sitemaps.
- Pages are cached and refresh themselves every 30 seconds. On top of that,
  whenever something readers can see changes (publish, unpublish, an edit to a
  live story, the homepage layout, categories), the API calls `POST
  /api/revalidate` here, signed with `SITE_ADMIN_KEY`, and pages refresh within
  seconds. The backend finds this hook at `SITE_REVALIDATE_URL`, which by default
  is the portal URL's origin + `/api/revalidate`.
- Sections: `/news/markets`, `/news/ipo`, `/news/commodities` and
  `/news/education` are the fronts for the categories with those addresses;
  other categories live at `/news/category/<slug>`. Listings page as
  `…/page/2`.
- SEO: canonical and Open Graph tags on every page, `NewsArticle` and
  breadcrumb structured data on stories, `/news/sitemap.xml`, a Google News
  sitemap (last 48 hours) at `/news/news-sitemap.xml`, RSS at `/news/feed.xml`,
  and `robots.txt` lists them. Search results are `noindex`.
- "Trending" counts each reader once a day per story from an anonymous, salted
  hash that is never stored in the database; bots aren't counted.

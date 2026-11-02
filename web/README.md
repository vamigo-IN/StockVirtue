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
  YouTube/Vimeo, related stories, widgets) and renders the HTML itself, so no
  script or arbitrary embed can get into a story.
- **Widgets** (Insert → Market or story widget): twenty types — quotes, charts,
  movers, sectors, heatmap, commodities, currencies, IPOs, an inline ticker,
  key takeaways, related stocks and news, explainers, risk disclaimers and promo
  banners. A widget is stored as its type, version and settings (JSON, checked
  by the API on every save); the editor shows it live, exactly as readers will.
  **Saved widgets** (`widgets.*`) are set up once and embedded by reference, so
  editing one updates every story using it; one in use can't be deleted.
- **Market data** (`market.configure`): the instruments the site quotes (up to
  60 active; one used by a story can be switched off but not removed), the
  ticker (on/off, where, order, speed, direction, theme, what each price shows,
  phones, market-closed behaviour) with a live preview, and the **data
  licence** — live, delayed (by N minutes), end-of-day or off, for the website
  and the app separately, plus the attribution shown with every price.
- **Media library**: images upload from the browser straight to the R2 bucket,
  then the API checks the file, strips its metadata and makes resized copies.
  The bucket needs a CORS rule allowing `PUT` and `GET` from this site's origin
  (see the backend's `.env.example`).
- **News homepage** (`site.manage`, Super Admin and Admin): which sections
  `/news` shows and in what order: breaking banner, featured, top stories,
  trending, one block per chosen category, app promotion.
- **Incoming news** (`sources.read`; acting on items needs `news.create`):
  items from the news sources, checked for duplicates, matched to listed
  companies and labelled by topic. Start a story from one (blank, or from an
  AI draft you have read) and it becomes your ordinary draft, with the source
  credited; dismiss the rest. Tips and press releases can be added by hand
  (`sources.create`). Nothing here is ever published.
- **News sources** (`sources.*`): feeds (RSS, Atom), licensed news APIs
  (JSON, with a field mapping), exchange, company, RBI, SEBI and government
  announcements, and manual submissions. Per source: schedule, default
  category, what its terms let us keep (headline only, summary, licensed full
  text), whether AI drafts are allowed, the credit, licence notes and email
  alerts to editors. Test fetches without storing; every fetch is in the
  history with Retry for failures.
- **Stock mapping**: how items are matched to companies — names and capitalised
  NSE tickers automatically, plus aliases ("RIL") and blocked phrases
  ("Reserve Bank of India") staff manage, with a tester.
- **AI assistant** (`ai.configure`): switched off until a provider is added and
  chosen. In the editor, the **AI** tab (`ai.use`) offers headlines, summary,
  SEO text, category and tags, related stocks and stories, a check of the
  draft, jargon explainers, rewriting a passage and a draft from notes; nothing
  changes until someone presses Use. Stories that use AI-written text are
  labelled for readers, and the label can't be removed.

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

## Market data on the site

- Every price carries its label (LIVE, DELAYED or END OF DAY) and the time it is
  as of, with the data source's attribution. Lists and tickers show one stamp,
  and any price that differs from it (a market that closed earlier) carries
  its own.
- Browsers get prices from `/api/market/…` here, a small cached proxy over the
  API's public market endpoints (`/api/v1/market/…`) that adds the site key;
  only known paths pass. The API decides what each caller may see from the data
  licence, and quotes only stocks on the market list or in a published story.
- Widgets refresh on their own schedule (set per widget), share one request
  per kind of data, and pause while the tab is hidden. Changing the licence,
  the instruments or the ticker refreshes the site within seconds through the
  same `/api/revalidate` hook as stories.
- The ticker runs under the `/news` masthead and, when set to "News pages and
  the home page", in the home page's tapes.

## News sources and the AI assistant

- Sources are fetched by the backend worker (`stockvirtue-worker`): it checks
  every minute for sources that are due, fetches them at most four at a time,
  and backs off from a failing one (up to six hours between tries). Without
  the worker, sources show "Needs attention" and AI requests wait.
- Fetching is locked down: only http(s) addresses that resolve to public
  networks (no localhost, private ranges or cloud metadata), redirects
  re-checked, 5 MB and 20 seconds at most. API keys typed into the portal are
  encrypted with `NEWSROOM_SECRETS_KEY` (backend) and never sent back to a
  browser; set that key before ever rotating `JWT_ACCESS_SECRET`.
- An item keeps only what its source's terms allow, as they stood when it
  arrived. Repeats are caught by link, by headline, and by near-identical
  headlines (headlines with different figures count as different stories);
  possible repeats are flagged for a person. Fetch history is kept 60 days,
  untouched items 120 days.
- The AI assistant works with Anthropic (Claude), OpenAI, any OpenAI-compatible
  server or a self-hosted Ollama server. Every answer is checked before anyone
  sees it: figures that aren't in the story or its sources are removed, wording
  copied from a source is removed, and items from headline-only sources, or
  sources whose terms don't allow it, are never drafted. Each request is
  recorded (what was sent, what came back, the checks, tokens and estimated
  cost); the text sent is cleared after 90 days. A monthly budget and a daily
  allowance per person cap the spend.
- The AI never publishes, schedules or approves anything: drafts land on the
  incoming item or in the editor for a person, and every story still goes
  through review.


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
      login/ invite/   sign-in (password + emailed code), forgotten password
                       (login/forgot) and invitation acceptance
      (portal)/        signed-in pages: dashboard, articles (+ editor, history), review,
                       my-work, media, storage, taxonomy, staff, roles, users, settings,
                       audit, security
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
public/
  email/           logo.png and icon.png: every StockVirtue email loads them from
                   here (the API's MailService), so keep them when the site changes
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

Live prices (`/api/market/stream`, and the API's `/api/v1/market/stream`
behind it) are Server-Sent Events. Both responses carry `X-Accel-Buffering: no`,
so nginx passes them through unbuffered with no config change; send something
at least every 15 seconds, well inside nginx's default 60-second
`proxy_read_timeout`. Don't put a buffering or compressing proxy (or a CDN
that buffers) in front of those two paths.

## Newsroom portal (`/admin`)

- Staff sign in with their StockVirtue account password, then a 6-digit code
  emailed to them. A forgotten password is reset on the sign-in page (an
  emailed code, then a new password; it is also the app password).
- **Super Admins** are added, suspended and removed only in the StockVirtue
  admin console (api.stockvirtue.com/admin, **Newsroom** page): someone
  already in the newsroom gets the role at once, anyone else an emailed
  invitation. Server fallback:
  `node dist/cli/grant-staff-role.js --email you@… --role SUPER_ADMIN` (backend).
- Super Admins manage everyone else from **Staff** (invitations, roles,
  suspension); the portal can't grant, suspend or restore the Super Admin
  role.
- Each role sees only the pages its permissions cover; the API enforces the same
  permissions on every request.
- **Site settings**, one tab per area, each saved on its own and audited:
  - **General** (`settings.update`): title/description, contact email, Play
    URL, social links and **code injection** — raw HTML injected into every
    public page, for anything the other tabs don't cover. Changing injected
    code needs `settings.code_injection` (Super Admin by default).
  - **Branding** (`settings.update`): logo, favicon (also the app icon on
    phones), default social share image — picked from the media library — and
    the theme colour. An image in use here can't be deleted from the library.
  - **Search & indexing** (`seo.update`, so the SEO Manager has it too): title
    format, X handle, keywords, Google/Bing/Yandex verification codes, hiding
    the site from search engines, keeping AI training crawlers out, extra
    `robots.txt` lines (directives and comments only), which pages the
    sitemaps list, and `llms.txt` (a plain-text guide to the site for AI
    tools, with the latest stories).
  - **Analytics** (`settings.update`): Google Analytics 4, Google Tag Manager,
    Meta Pixel and Microsoft Clarity IDs; each script loads only with a valid
    ID.
  - **Advertising** (`ads.manage`): the AdSense publisher ID (adds the account
    tag, and the Auto ads script when switched on) and extra `ads.txt` lines;
    `/ads.txt` is written from these.
  Saved settings reach the public site within seconds.
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
- **Media library**: with Cloudflare R2 connected, images upload from the
  browser straight to the bucket; otherwise they go to the API server through
  the portal (`PUT staff/media/:id/content`, passed through unchanged). The API
  then checks the file, strips its metadata, makes resized copies and serves
  every image at `api.stockvirtue.com/media/...`.
- **Media storage** (`media.storage`, Super Admin): connect Cloudflare R2
  (account ID, bucket, access key; the secret is stored encrypted) and run the
  connection check: sign in, write a file, read it back, ask the bucket whether
  this site may upload (CORS), delete the file. The page shows the CORS policy
  to paste into the bucket. Until R2 is connected and switched on, uploads are
  kept on the API server's disk. Files never move between stores, and a
  connection that R2 images still load through can't be removed.
- **News homepage** (`site.manage`, Super Admin and Admin): which sections
  `/news` shows and in what order: breaking banner, featured, top stories,
  trending, one block per chosen category (Official updates by default), app
  promotion.
- **Incoming news** (`sources.read`; acting on items needs `news.create`):
  items from the news sources, checked for duplicates, matched to listed
  companies and labelled by topic. Start a story from one (blank, or from an
  AI draft you have read) and it becomes your ordinary draft, with the source
  credited; dismiss the rest. Tips and press releases can be added by hand
  (`sources.create`).
- **News sources** (`sources.*`): feeds (RSS, Atom), licensed news APIs
  (JSON, with a field mapping), exchange, company, RBI, SEBI and government
  announcements, and manual submissions. Per source: schedule, default
  category, what its terms let us keep (headline only, summary, licensed full
  text), whether AI drafts are allowed, whether its pictures may be used
  (licensed full text only: they are copied into the media library, checked
  like an upload and credited to the source), the credit, licence notes and
  email alerts to editors. Test fetches without storing and shows which items
  bring a picture; every fetch is in the history with Retry for failures.
- **When news arrives** (per source, Super Admin only): new items wait in
  Incoming news (the default), become drafts for an editor to check, or are
  published at once — with a daily limit per source, after which the rest
  wait in Incoming news. Automatic stories run under the "StockVirtue News
  Desk" byline with the source credited by name, carry its picture when its
  licence covers pictures, and say only what the source's terms allow; a
  headline-only source can't publish automatically.
  Anything that may repeat another source or an existing story always waits
  for a person.
- **Official sources**: a ready-made list of government, regulator and
  central-bank feeds (PIB, RBI, SEBI, NITI Aayog, the exchanges; the US Fed,
  SEC, BLS, BEA and EIA, the ECB and the Bank of England), each with its
  terms summarised and linked, set to the usage those terms clearly allow.
  Exchange feeds are headline-only and marked for legal sign-off. Government
  bodies and regulators (PIB, RBI, SEBI and the like) file their stories in
  Official updates; so does a new RBI, SEBI or government source added by
  hand, unless you pick another category.
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
- **Official updates** (`/news/category/official-updates`): news from
  government bodies and regulators, kept apart from the main news. A category
  set to "Keep separate from the main news" (Categories & tags) stays out of
  Top stories, the featured block's top-up, the latest list (website, app and
  RSS) and shows in its own homepage section and page instead; search, tags,
  stock pages, trending and the sitemaps still include it. Switch it off and
  its stories are main news again.
- Stories name their sources ("Sources: Press Information Bureau ·
  Published …") without linking to them; the newsroom keeps the links for
  duplicate checks and editors.
- SEO: canonical and Open Graph tags on every page, `NewsArticle` and
  breadcrumb structured data on stories, `/news/sitemap.xml`, a Google News
  sitemap (last 48 hours) at `/news/news-sitemap.xml`, RSS at `/news/feed.xml`,
  and `robots.txt` lists them. Search results are `noindex`, and the
  site-wide "noindex" in Site settings applies to stories and listings too.
- Story share images: `/news/<slug>/image/og.jpg` is the featured picture
  cropped to 1200×630 around its most interesting part (Open Graph and X),
  and `16x9.jpg`, `4x3.jpg` and `1x1.jpg` are Google's three article shapes,
  all 1200 px wide. They are made on first request and cached for a day.
- Story structured data: a person's byline is a `Person`, the News Desk
  byline (`news-desk`) an `Organization`; dates are Indian time (`+05:30`);
  keywords come from the tags, companies and category; companies in the
  story are listed under `about` with their ticker; the publisher logo is the
  one in Site settings → Branding.
- "Trending" counts each reader once a day per story from an anonymous, salted
  hash that is never stored in the database; bots aren't counted.

## Privacy: the notice, cookies and requests

- `/privacy` and `/privacy/hi` are the privacy notice (DPDP Act 2023) in
  English and Hindi. The grievance officer, company name and address, and the
  answer time come from Site settings → Privacy, so they change without a
  deploy. `NOTICE_VERSION` in `src/lib/privacy-notice.ts` must match the
  API's notice version.
- `/privacy/requests` takes requests and complaints from people without the
  app: an emailed six-digit code first (so nobody acts on someone else's
  data), then the request. The person gets a reference by email and the
  grievance officer is told.
- **Cookie banner.** It appears only when Site settings has something
  optional switched on (Google Analytics, Tag Manager, Clarity, Meta Pixel,
  AdSense Auto ads). Nothing optional loads before a choice. "Reject all" is
  as big and as easy as "Accept all", "Choose" goes purpose by purpose, and
  the banner reads in English or Hindi. "Cookie settings" in every footer
  opens it again. The choice lasts 180 days in the `sv_consent` cookie (a
  random id and the two answers, nothing else) and is recorded through
  `/api/consent` as proof (kept two years). Taking consent back deletes the
  analytics or ad cookies and reloads the page. Google's consent mode starts
  at "denied". Without advertising consent AdSense shows non-personalised ads,
  or none (Site settings → Advertising).
- In the portal, **Privacy requests** (permission `privacy.manage`, which Super
  Admins and Admins have) lists every request with its due date and flags
  overdue ones. An answer is emailed to the person; staff can also download
  the person's data or delete their account from the request.

## Market data on the site

- Every price carries its label (LIVE, DELAYED or END OF DAY) and the time it is
  as of, with the data source's attribution. Lists and tickers show one stamp,
  and any price that differs from it (a market that closed earlier) carries
  its own.
- Browsers get prices from `/api/market/…` here, a small cached proxy over the
  API's public market endpoints (`/api/v1/market/…`) that adds the site key;
  only known paths pass. The API decides what each caller may see from the data
  licence, and quotes only stocks on the market list or in a published story.
- The ticker and the index and commodity widgets move live: the API pushes
  each price change to this server (at most once a second, and only the
  prices that moved), which shares that one connection with every reader
  through `/api/market/stream`. Prices follow the data licence exactly as the
  other endpoints do (a delayed licence streams delayed prices). The stream
  pauses while the tab is hidden; if it goes quiet, widgets fall back to
  polling until it's back.
- Other widgets refresh on their own schedule (set per widget), share one
  request per kind of data, and pause while the tab is hidden. Changing the
  licence, the instruments or the ticker refreshes the site within seconds
  through the same `/api/revalidate` hook as stories.
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
  arrived. Repeats are caught by link, by headline, by near-identical
  headlines (headlines with different figures count as different stories),
  by the same story told in other words (overlapping headline and summary
  text), and by the same event about the same company from another source
  within a day (results, IPOs, deals, corporate actions). Sure repeats are
  set aside; possible ones are flagged for a person and never published
  automatically. Fetch history is kept 60 days, untouched items 120 days.
- The AI assistant works with Anthropic (Claude), OpenAI, any OpenAI-compatible
  server or a self-hosted Ollama server. Every answer is checked before anyone
  sees it: figures that aren't in the story or its sources are removed, wording
  copied from a source is removed, and items from headline-only sources, or
  sources whose terms don't allow it, are never drafted. Each request is
  recorded (what was sent, what came back, the checks, tokens and estimated
  cost); the text sent is cleared after 90 days. A monthly budget and a daily
  allowance per person cap the spend.
- The AI never publishes, schedules or approves anything: drafts land on the
  incoming item or in the editor for a person. (Automatic publishing, above,
  is a source setting and uses the source's own text, never AI text.)

## The app: native reader, saved stories and news alerts

- The app (1.3.0 and later) shows the same stories as `/news`, from
  `/api/v1/news`. A story opens in a native reader: the API sends the stored
  document itself (`?format=app`), already checked against the newsroom's
  allowlist, with pictures, related stories and widgets resolved, and the app
  draws it with its own components. Widget types or versions the installed
  app doesn't know show a "View on stockvirtue.com" card, as do body blocks
  added later. Until the newsroom has published anything (or against an older
  API) the app's home "Markets news" falls back to the headline feed.
- Related-story links inside a story only ever name stories readers can see,
  on the website and in the app; staff previews still show the rest.
- Market widgets in the app are served under the **App (news stories)**
  licence on the Market data page (the app proves itself with the reader's
  sign-in). Those answers are private to the reader, and their limits are per
  reader rather than per address, because many phones share a mobile
  carrier's address. `/api/v1/market/indices` lists the curated indices.
- Saved stories belong to the reader's account (`POST`/`DELETE
  /api/v1/news/:id/bookmark`, `GET /api/v1/news/bookmarks`), so the website
  can offer the same list once readers sign in there.
- News alerts: the worker checks every 30 seconds for stories that went live
  at least 30 seconds ago (time to take back a mistake). A breaking story
  first published in the last three hours goes to every reader who keeps
  "Breaking news" on; a story tagged with listed companies, first published in
  the last six hours, goes to readers with those companies in a watchlist or
  their portfolio who keep "Stocks you follow" on. Each reader gets a story
  once, at most five news alerts a day, on the app's "News alerts" channel;
  tapping one opens the story. A story taken down before its alert goes out
  is skipped, and one republished after a correction never alerts again. Each
  alert is recorded in `notification_campaigns` with readers, devices reached,
  failures and opens; push needs `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT` in
  the worker's environment, and without them each alert is recorded as
  skipped with the reason.


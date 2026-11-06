# StockVirtue — Website (stockvirtue.com)

The public site for the StockVirtue app (home, features, about, FAQ, download,
contact and the legal pages), the public **news site** at `/news`, and the
**newsroom portal** at `/admin` (staff sign-in, team and roles, app-user
moderation, website settings, the pages and menus editors, audit log, and the
editorial desk: articles, review queue, media library, categories and tags,
news homepage). Built with **Next.js 15 (App Router) + TypeScript**, rendered
on the server (static or ISR) for SEO. Public pages share one stylesheet and
use client navigation; only links into `/admin` are full page loads. `/admin`
keeps its own Tailwind CSS v4 stylesheet (`portal.css`), so the two never mix.

## Structure

```
src/
  app/
    (public)/        every public page; its layout loads public.css (with
                     styles/tokens.css), the fonts, the cookie banner and the
                     admin's code injection
      (home)/        `/` and its family layout (the header's market chip
                     follows the site-prices gate)
      (site)/        the site pages (features, about, faq, download, contact),
                     the legal pages (privacy, privacy/hi, privacy/requests,
                     terms, disclaimer) and custom pages ([slug]), with their
                     family layout
      news/          the news site and its layout (status chip, section rail,
                     ticker): the front, stories, hubs (markets, commodities,
                     ipo, education), categories, tags, authors, stocks,
                     latest, search, feed.xml, sitemap.xml, news-sitemap.xml
    preview/[token]/ staff-only preview of an unpublished page (noindex)
    api/revalidate   signed hook the API calls to refresh news and site pages
    api/market/      cached proxy over the API's market endpoints, and the one
                     shared price stream (stream/)
    api/news/view    counts a story read (forwarded to the API)
    api/consent      records a cookie choice (forwarded to the API)
    admin/           newsroom portal (portal.css; isolated from the public chrome)
      login/ invite/   sign-in (password + emailed code), forgotten password
                       (login/forgot) and invitation acceptance
      (portal)/        signed-in pages: dashboard, articles (+ editor, history), review,
                       my-work, media, storage, taxonomy, staff, roles, users,
                       pages, menus, settings, audit, security
      api/[...path]/   the portal's backend-for-frontend (see below)
    layout.tsx       root <html><body> + global SEO metadata (no stylesheet)
    not-found.tsx    branded 404 for unknown URLs (not-found.css, lib/fonts-404.ts)
    sitemap.ts robots.txt/route.ts manifest.ts ads.txt/ llms.txt/ brand/[file]/
  components/
    public/          the chrome (SiteHeader, NavDrawer, SiteFooter, SkipLink,
                     SectionRail) and the primitives (Button, Heads, Panel,
                     PhoneDisclosure, FactFile, WontDo, PlayBadge, QrCode,
                     forms/, icons/, legal/LegalShell, ui/ Tabs, LazyDialog,
                     LazyPopover)
    home/ site/      the home page and the site pages' views
    diagrams/        the teaching diagrams
    news/            news units (StoryCard, HouseAd, DayGroups), the front,
                     hubs, listings, story and stock furniture
    market/          the market modules (boards, charts, heatmap, IPOs, stamps)
    three/           the WebGL scenes (the Ridgeline, the Nifty Field), loaded on use
    widgets/         story widgets (shared with the portal's editor)
    site-content/    admin-written content: legal documents, custom pages, the
                     notice line, the preview's layout meter
    consent/         the cookie banner and the scripts it allows
    ui/              shadcn/ui primitives (portal only: they need portal.css)
    portal/          portal shell and shared portal components
    editor/          the article editor (TipTap) and its custom blocks
  content/
    app.ts           product facts (F1–F42), each with a status; a fact still
                     marked `verify` renders its fallback
    site/            each designed page's content type, limits and default
                     (today's copy), the reserved ids, the built-in chrome
    legal/           build-time seeds of the five legal documents
    glossary.ts screens.ts
  portal/            portal API client, server helpers, session cookie, types
  news/              news API client (server-only), routes, SEO and JSON-LD, formats
  market/            market API client (server-only), the stream hub, the Ridgeline's data
  styles/            tokens.css (colour, type and space tokens), widgets.css,
                     article-prose.css (story typography shared by /news and the editor)
  lib/
    site.ts          static brand config (name, URLs, company)
    nav.ts           the built-in menus and footer links (the chrome's defaults)
    settings.ts      runtime settings (fetched from the backend) + contact helper
    site-content/    fetchers for admin-managed content (pages, chrome, legal
                     documents, custom pages, previews), merge and live values
    consent.ts       the cookie choice; three-gate.ts the 3D gate; palette.ts;
                     fonts-public.ts and fonts.ts (next/font)
  fonts/             the variable font files and their licences (see Fonts)
scripts/
  fonts/             make_font.py, make_stage_font.py, fallback-metrics.mjs
  brand/             logo-on-dark.py
public/
  logo.png           the owner's logo (never redrawn); logo-on-dark.png, the
                     dark footer's copy (scripts/brand/logo-on-dark.py)
  fonts/             the two stage cuts (versioned names, cached for a year)
  badges/            Google's official Play badge, unmodified
  email/             logo.png and icon.png: every StockVirtue email loads them from
                     here (the API's MailService), so keep them when the site changes
  favicon.ico icon.png apple-icon.png og.png
```

## How it talks to the backend

All backend calls happen **server-side** (Next.js server → `api.stockvirtue.com`),
so there are no CORS changes and no secret ever reaches the browser:

- `GET  /site/settings`  — public site settings (read on every page, cached 60s)
- `POST /site/contact`   — contact-form submissions (emailed by the backend)
- `GET /v1/site/...`     — the admin-managed pages, menus, legal documents and
  custom pages (see "Pages, menus and the legal documents")
- `/v1/staff/...`        — the newsroom portal, via `/admin/api/...` (below)
- `GET /v1/news/...`     — the news site's stories, sections and sitemaps
- `GET /v1/market/...`   — prices, through this server's `/api/market/...`

The portal's browser code only calls `/admin/api/staff/...` on this server. That
route accepts same-origin requests carrying the portal's `x-sv-portal` header,
swaps the httpOnly session cookie (`__Host-sv_staff`, SameSite=Strict) for the
API's `x-staff-session` header, and adds `x-site-admin-key` plus the browser's
real IP / user agent. Every permission is checked by the API on every call.

If the backend endpoints aren't deployed yet, the site still renders with sensible
defaults (see `DEFAULT_SETTINGS`, and the built-in content in `src/content/site/`).

## Environment

Copy `.env.example` → `.env.local` (dev) or set on the server. **Secret:**
`SITE_ADMIN_KEY` (must match the backend's).

| var | purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | canonical URL (SEO/sitemap/OG) — `https://stockvirtue.com` |
| `NEXT_PUBLIC_PLAY_URL` | Google Play listing |
| `API_BASE` | backend base — `https://api.stockvirtue.com` |
| `SITE_ADMIN_KEY` | server-to-server key the portal sends to the API (matches backend); required for `/admin` |

The API's `PUBLIC_SITE_URL` must equal `NEXT_PUBLIC_SITE_URL` (both default to
`https://stockvirtue.com`): the legal documents print it as the site's address.

## Run

```bash
npm install
npm run dev                      # http://localhost:3001
npm run build && npm run start   # production, also on port 3001
ANALYZE=true npm run build       # also writes bundle reports to .next/analyze/
npx tsc --noEmit --incremental false -p tsconfig.json   # type check (next lint has no config here)
```

In a shared working tree, run the dev server as
`NEXT_DIST_DIR=.next-dev npx next dev -p 3001`, so a `next build` (which uses
`.next`) never collides with it. The dev server keeps type stubs for deleted
routes in `.next-dev/types`: after removing a route, delete its folder there,
or `tsc` fails with TS2307.

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

### Releasing the admin-managed site

In this order:

1. **The backend first.** Run `npx prisma migrate deploy` (migration
   `20261112120000_site_cms`: three enums and four new tables; no existing table
   changes), then build and restart the API **and** the worker. Set the API's
   `PUBLIC_SITE_URL` to this site's `NEXT_PUBLIC_SITE_URL` (production sets
   neither: both default to `https://stockvirtue.com`). The rollback is
   `backend/prisma/rollbacks/20261112120000_site_cms.down.sql`; it loses every
   page edit, notice version and cookie version made after the seed, so export
   them first. The deploy changes nothing on the site and asks nobody to accept
   the privacy notice again.
   The same release carries three small migrations of 6 Nov 2026, all
   additive and safe to run again: `20261113120000_market_attribution`
   (rewrites the stored market-data credit only where it is still the old
   default), `20261114120000_breaking_expiry` (`news_articles.breakingAt`,
   filled in from publication for stories already marked breaking) and
   `20261115120000_news_notify_on_publish` (`news_articles.notifyOnPublish`
   and the `EDITORS_PICK` alert kind). An older API refuses a story that uses
   the editor's text colour or highlight, another reason the backend goes
   first.
2. **Then the website**, built while the new API is up, because the legal pages
   prerender from it. Before restarting, check the build log: it must not
   contain `legal fallback in use` (a legal page was built from its seed in
   `src/content/legal/` because the API didn't answer; fix that and build again).
3. **Then app 1.4.1** to Google Play, with its rollout completed to 100% of the
   production track.
4. **Last, and only the owner:** the app notice gate ships switched off. A Super
   Admin switches it on (Settings → Privacy, with the Play confirmation) once
   1.4.1 has been on the production track at 100% for 2 days. No deploy switches
   it on or off.

The website's backend task B1 (`quotableStocks`) needs no migration; it ships
with the same backend release.

## The public site

- **One stylesheet.** `src/app/(public)/public.css` (with `src/styles/tokens.css`)
  styles every public page. Components use the semantic utilities (`text-fg`,
  `bg-paper`, `border-rule`, …), the `.t-*` type classes and the `wdth-*`
  classes, never a raw colour, so one component reads correctly on paper, on
  the dark app stage and in the dark footer; anything else goes in a CSS Module
  beside the component. The look is light paper with one dark "Inside the app"
  stage on the home page and a dark footer.
- **Motion.** No animation library ships. Nothing fades in, nothing enters on
  scroll and nothing decorative loops; motion shows something real (the
  diagrams, the Ridgeline), and reduced motion gets the final state.
- **Rendering.** Every public page is static or ISR (`/`, `/features`, `/news`
  and the hubs every 15 s, the other site pages every minute). Stories,
  listings, stock pages and custom pages render on their first request and are
  then cached; only `/news/search` and `/preview/<token>` are dynamic. No layout
  or page reads cookies, headers or search params, and nothing a client
  component renders first depends on the clock or the viewport.
- **The site-prices gate** (`pricesOnSite()`, `src/components/market/gate.ts`):
  the home page, its header chip and footer data line, and the one chart on
  `/features` show prices only when the ticker loaded, Market data → Ticker →
  placement is "News pages and the home page", and the website's licence isn't
  OFF. Otherwise those pages show no price at all (the home market band keeps
  IPO watch and the newsroom). News pages follow the licence alone. No page
  ever shows an invented price.
- **The 3D gate** (`can3D()`, `src/lib/three-gate.ts`): the home Ridgeline and
  the Markets hub's Nifty Field run WebGL only at 768 × 600 px or more, without
  reduced motion, Save-Data or a 2G connection, with at least 4 GB of memory
  and 4 cores, and with WebGL 2 that isn't software-rendered. Phones get the SVG
  poster and never download three.js; the scenes load on use (the Nifty Field
  on "View in 3D"). After a lost WebGL context, `sessionStorage['sv:3d']` is
  `off` for the rest of the tab.
- **Colour-blind palette:** the footer's switch shows up and down in blue and
  orange instead of green and red (`sv:palette` in localStorage, applied before
  the first paint).
- **JS budgets** (a route's initial JS is the sum of `gzip -9` over every
  `<script src>` in its served HTML). Overlays (the drawer, the Contents sheet,
  popovers) load on first use; three.js and lightweight-charts only where
  they're used. Public components join classes with `clsx`; `cn()` (which adds
  tailwind-merge, about 8 KB gzip) is for the portal and for components that
  really merge conflicting utilities. One Next.js behaviour to keep in mind:
  the client-reference manifests of entries whose paths differ only by route
  groups are merged (the `(public)`, `(home)` and `(site)` layouts and the home
  page are one group; the news layout and the `/news` front are another), and a
  parent page's manifest also reaches its child routes. A client component that
  a layout renders and that a page in the same group also imports is then sent
  with that page's chunks on every other page. So the layouts render client
  modules that no page imports (`DisclosureInit`, `HeaderStatus`), and
  `/privacy`'s own Cookie settings button is `NoticeCookieSettings`.

### Fonts

- `src/fonts/`: variable Archivo (`archivo-sv.woff2`, weight 400–800, width
  82–120) and Source Serif 4 as **SV Serif** (`source-serif-sv.woff2` and
  `source-serif-sv-italic.woff2`, optical size pinned at 20, weight 400–700),
  loaded through next/font (`src/lib/fonts-public.ts`; the root 404 uses
  `src/lib/fonts-404.ts`). The serif is renamed because its licence (SIL OFL 1.1
  with the Reserved Font Name "Source") doesn't let a modified subset keep the
  name; nothing visible changes. The licences are in `src/fonts/OFL-*.txt`.
- `public/fonts/archivo-stage1.v1.woff2` and `archivo-stage2.v1.woff2`: two small
  static cuts for the display headings (weight 680 at width 118, and 660 at
  112), preloaded only on the pages that use them and served `immutable` for a
  year (`next.config.mjs`), so a rebuilt file gets a new suffix (`.v2`). Their
  Arial fallback metrics sit beside their `@font-face` rules in `public.css`.
- To rebuild (from `web/`, with fontTools 4.61 or later and brotli):
  `scripts/fonts/make_font.py` (the variable files), `make_stage_font.py` (the
  stage cuts), then `node scripts/fonts/fallback-metrics.mjs` on the stage cuts
  for their fallback metrics. Each script's header has the exact commands and
  the upstream files.

### Logo and icons

- `public/logo.png` is the owner's neon logo: never redrawn, recoloured or
  traced. The dark footer uses `public/logo-on-dark.png`, a copy in which only
  the near-black "Stock" lettering is recoloured light, made by
  `python -I scripts/brand/logo-on-dark.py` (needs Pillow; it reads
  `public/logo.png`, first turns an opaque white background into transparency
  if the source has one, and refuses to write if the recolour touched anything
  green or found no "Stock"). Run it again whenever the logo changes.
- Icons: `public/favicon.ico`, `public/icon.png` and `public/apple-icon.png` are
  the defaults. A favicon or share image picked in Site settings → Branding is
  served through `/brand/icon.png`, `/brand/apple-icon.png` and
  `/brand/share.jpg` (`src/app/brand/[file]`).

### Data the public pages read from the API

- **`quotableStocks`** (backend B1): the market snapshot lists every stock the
  API will quote (the tracked movers lists and the Nifty 50, Bank Nifty and
  Sensex members), so movers rows, heatmap tiles and list rows link to
  `/news/stocks/<SYMBOL>` only when that page will have a price. Those links
  never prefetch. An older API without the field counts the curated stocks only.
- Correction notes were retired on 6 Nov 2026: the API no longer sends
  `correctionNote` (the column stays, unused), and a story shows only
  "Updated <date, time IST>" in its byline when it changed more than 5 minutes
  after it first went out.

## Pages, menus and the legal documents (admin-managed)

Everything on the public site is edited in the portal (Pages, Menus & footer)
and keeps its design:

- **Designed pages** (`/`, `/features`, `/about`, `/faq`, `/download`,
  `/contact`) and the shared "What it won't do" block: each has a content type,
  limits and a default in `src/content/site/` (today's copy). A page renders the
  published content merged over its default, so an unpublished page, or an API
  without the item, shows the default. Product facts still come only from
  `src/content/app.ts`.
- **The chrome:** the menus, the footer's texts and the 404 texts come from
  `getChrome()`; the built-in values are `src/lib/nav.ts` and
  `src/content/site/chrome.ts`.
- **Legal documents** (`/privacy`, `/privacy/hi`, `/terms`, `/disclaimer`,
  `/privacy/requests`): versioned documents from the API's live revision, with
  its recorded values (company name, grievance officer, answer time, the
  services in use). At run time they never fall back: if the API can't answer,
  the last good page keeps being served. Only `next build` falls back, to the
  seeds in `src/content/legal/`, and logs `legal fallback in use for <key>`,
  which a release must not accept (see Deploy).
- **Custom pages** (`/<slug>`, for example a refund policy): rendered by
  `src/app/(public)/(site)/[slug]`. A slug can't take a reserved name
  (`src/content/site/reserved-ids.ts`).
- **Preview:** `/preview/<token>` shows a staff member's unpublished draft with
  the live page's data and chrome (their staff session only, `noindex`, no
  analytics or ads).
- The fetchers are in `src/lib/site-content/api.ts` (`getPageContent`,
  `getSharedContent`, `getChrome`, `getLegalDoc`, `getCustomPage`,
  `getContentIndex`, `getPreview`). Every public read is tagged
  (`content:<key>`, `site-chrome`, `site-pages`, `custom:<slug>`) and is asked
  again within 60 s; a publish refreshes its pages at once through
  `/api/revalidate`.

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
    `/ads.txt` is written from these. See "Ads: news pages only" below. Never
    paste AdSense code into Code injection: it runs on every public page, so
    ads would appear on the home page, the policies, About and Contact too.
  Saved settings reach the public site within seconds.
- **Pages** (`/admin/pages`) and **Menus & footer** (`/admin/menus`): the
  designed pages, the shared block, custom pages, the legal documents and the
  chrome, each with drafts, a preview, history and restore. They need
  `site.manage`; the legal documents need `legal.manage`; a material change
  to the privacy notice, a bigger "minor" one and switching the app notice
  gate need `legal.material` (Super Admins only). See "Pages, menus and the
  legal documents" above, and the privacy section of the root README.
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
- The editor's toolbar sits on one row in the article workspace from 1366 px
  wide (two rows at 1280, or while a table's own tools show); Insert is the
  **+** button at its end. Its **Colour** menu sets text colour (7 colours)
  and highlight (5 tints), and **Alignment** sets centre, right or justify.
  Both are stored as palette names, never colour values (the lists are in
  `src/components/editor/formatting.ts` and the backend's `article-content.ts`;
  the API drops any other value, and text pasted from Word, Docs or other
  sites keeps none of its colours). `article-prose.css` gives each name a
  shade that reads on the white story page and in the portal's light and
  dark modes.
- **Widgets** (Insert → Market or story widget): 22 types — quotes, charts,
  movers, sectors, heatmap, commodities, currencies, IPOs, an inline ticker,
  a stock list and an index table (2 to 15 rows each, in one table), key
  takeaways, related stocks and news, explainers, risk disclaimers and promo
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
- **Media library**: images go to the API server through the portal (`PUT
  staff/media/:id/content`, passed through unchanged) and stay in memory there:
  the API checks the bytes and stores **only WebP**, in Cloudflare R2 when it is
  connected or else on its disk. The file as uploaded is never stored.
  - JPEG, PNG, GIF and AVIF are re-encoded: photos lossy at quality 80;
    graphics such as charts and screenshots lossless when that is within 10%
    of lossy.
  - A WebP is kept byte for byte, minus EXIF/XMP (camera, GPS location) and
    anything that isn't the picture.
  - Images are made upright and at most 2,400 px on the long side, with 480
    and 1,200 px WebP copies. Animated GIFs become animated WebP.
  - The library shows each image's saving ("PNG 3.2 MB → WebP 410 KB").
  - The API serves every image at `api.stockvirtue.com/media/...`. The tuning
    lives in `backend/src/newsroom/media/image-optimizer.ts`.
- **Media storage** (`media.storage`, Super Admin): connect Cloudflare R2
  (account ID, bucket, access key; the secret is stored encrypted) and run the
  connection check: sign in, write a file, read it back, delete it. The bucket
  needs no CORS rule (browsers never talk to it). Until R2 is connected and
  switched on, images are kept on the API server's disk. Files never move
  between stores, and a connection that R2 images still load through can't be
  removed.
- **Branding images from the library**: a favicon or share image picked in
  Site settings → Branding is WebP like everything else, so the site serves it
  through `/brand/icon.png`, `/brand/apple-icon.png` (iPhones) and
  `/brand/share.jpg` (1200×630 for link previews), converted on the fly.
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
  is the portal URL's origin + `/api/revalidate`. The hook refreshes only the
  tags it knows: `news`, `market`, and the admin-managed site's `site-chrome`
  (menus, footer, 404 texts, the footer's "We updated our privacy notice"
  line), `site-pages` (custom pages, the sitemap), `site-settings` (a privacy
  change that affects cookies), `content:<key>` for the designed, shared and
  legal pages, and `custom:<slug>`.
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
- **Official updates in the app** (the next app release): the News screen's
  chips run Latest, Most read, then each kept-separate category (Official
  updates), then the rest; its Latest view shows that category's three newest
  stories as dated rows after the first six stories, with "See all", like the
  website's section. The home tab's "Markets news" stays main news only.
  `GET /api/v1/news/categories` marks each top-level category with
  `keepSeparate`; an app talking to an older API treats `official-updates` as
  kept separate, and installed apps ignore the field.
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
  deploy. The notice version comes from the API (its privacy notice
  versions); the website keeps no copy of it.
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
- **Cookie choice version.** The choice is stored with a version
  (`sv_consent` starts `<version>.`). The current version comes from the API
  in the settings the layout already reads (`cookieConsent.version`, 1 until
  the first change; an API without it counts as 1). A new version starts when
  a material privacy change affects cookies, or when Site settings switches
  an analytics or advertising service on. A choice made under an older
  version isn't current: nothing optional loads, and the banner asks again
  with the line "We changed how this site uses cookies since you last chose.
  Please choose again." (and its Hindi), with both switches off. The new
  choice keeps the old random id, so the log links them, and is recorded as
  `cookies-<version>`; refusing a purpose the old choice allowed also deletes
  that purpose's cookies. A choice at or above the page's version counts as
  current (so a page cached just before a change never asks again).
- **Ads: news pages only.** AdSense Auto ads load only on `/news` and the
  pages under it (`isAdPath` in `src/lib/consent-services.ts`). They never
  load on the home page, About, Contact, FAQ, Features, Download, the policies
  (Terms, Privacy and its Hindi page, Disclaimer, privacy requests), the CMS
  pages at `/[slug]`, any 404 (the news one included: it carries
  `data-news-404`), the portal or the preview route. The consent rules are
  the same on every page; analytics, Google's consent mode and the Meta Pixel
  still load site-wide. The account tag (`google-adsense-account`) and
  `/ads.txt` stay site-wide: they show no ads and AdSense uses them to verify
  the site. A loaded ad script can't be taken back, so once AdSense runs on a
  news page, every way out of the news section is a full page load
  (`ConsentScripts`): a capture-phase click handler sends links to non-news
  pages through `location.assign` (Next's Link skips its own navigation when
  the click is `defaultPrevented`), back and forward onto a non-news entry
  reload, and a route-change check reloads anything else that lands outside
  the news pages. Modifier-key clicks, `target` other than `_self`, downloads,
  other sites and hash-only links behave as usual. In the AdSense account
  (Ads → By site, then edit the site) the owner can still choose formats,
  turn off vignette and anchor ads, or exclude more pages.
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
- Text colour, highlight and alignment reach the app as the same palette names
  the website uses (a `textColor` or `highlight` mark with a colour name, a
  paragraph's or heading's `textAlign`), and the reader (from the next app
  release) draws each name in its own shade for the light and dark themes.
  Older apps ignore them and show that text unformatted.
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
  is skipped, and one edited or republished later never alerts again. Each
  alert is recorded in `notification_campaigns` with readers, devices reached,
  failures and opens; push needs `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT` in
  the worker's environment, and without them each alert is recorded as
  skipped with the reason.
- **A notification for a story that isn't breaking** (the Placement card;
  `news.publish` and `news.feature`): "Send a notification when published"
  stays on a story through review and scheduling, and once it is live the
  worker sends one "Editors’ pick" alert to every reader who keeps "Breaking
  news" on. "Send notification now" does the same for a story already live,
  within 24 hours of its first publication, after a confirmation. A story
  sends one such alert, ever, and never as well as a breaking alert (a
  breaking story's alert goes out by itself); the per-reader rules above
  apply. The alert is recorded in `notification_campaigns` as `EDITORS_PICK`.
  The worker must run the same release, or a queued alert reaches nobody.
- **Breaking news ends by itself**: a story is breaking for 24 hours from when
  the switch was turned on (from publication, if it went out marked;
  `news_articles.breakingAt`). Readers stop seeing the label then (the API's
  cards and the website check the time), and the worker's sweep (every 2
  minutes) turns the switch off, writes an audit row
  (`news.article.breaking_expired`, by `scheduler`) and refreshes the API
  cache and the website's news pages. Breaking alerts keep their own rule:
  first published in the last three hours.
- None of these changes a story's "Updated" time: the Featured and Breaking
  switches, the sweep and both notification controls keep `updatedAt`, so a
  byline says "Updated" only after a real edit.


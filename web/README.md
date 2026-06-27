# StockVirtue — Website (stockvirtue.com)

Marketing / portfolio site for the StockVirtue app, plus a small admin panel for
site settings and code injection. Built with **Next.js (App Router) + TypeScript**,
server-rendered for SEO. No heavy UI dependencies.

## Structure

```
src/
  app/
    (site)/        public marketing + legal pages (shared header/footer + code injection)
    admin/         password-protected settings panel (isolated from the site chrome)
    layout.tsx     root <html><body> + global SEO metadata
    sitemap.ts robots.ts manifest.ts icon.svg
  components/      Header, Footer, Icon, JsonLd, CodeInjection
  lib/
    site.ts        static brand/nav/content config
    settings.ts    runtime settings (fetched from the backend) + save/contact helpers
    auth.ts        admin session (password-derived httpOnly cookie)
```

## How it talks to the backend

All backend calls happen **server-side** (Next.js server → `api.stockvirtue.com`),
so there are no CORS changes and no secret ever reaches the browser:

- `GET  /site/settings`  — public site settings (read on every page, cached 60s)
- `PUT  /site/settings`  — admin save (sent with the `x-site-admin-key` header)
- `POST /site/contact`   — contact-form submissions (emailed by the backend)

If the backend endpoints aren't deployed yet, the site still renders with sensible
defaults (see `DEFAULT_SETTINGS`).

## Environment

Copy `.env.example` → `.env.local` (dev) or set on the server. **Secrets:**
`ADMIN_PASSWORD`, `SITE_ADMIN_KEY` (the latter must match the backend).

| var | purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | canonical URL (SEO/sitemap/OG) — `https://stockvirtue.com` |
| `NEXT_PUBLIC_PLAY_URL` | Google Play listing |
| `API_BASE` | backend base — `https://api.stockvirtue.com` |
| `ADMIN_PASSWORD` | password for `/admin` |
| `SITE_ADMIN_KEY` | server-to-server key for saving settings (matches backend) |

## Run

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm run start   # production (port 3001)
```

## Deploy

`next build` emits a standalone server (`output: 'standalone'`). Run it under
pm2 behind nginx on the `stockvirtue.com` host, e.g.:

```bash
npm ci && npm run build
node .next/standalone/server.js   # honors PORT (default 3000)
```

Point nginx `stockvirtue.com` → the Next.js port. (The backend stays on
`api.stockvirtue.com`.)

## Admin & code injection

- Visit `/admin`, sign in with `ADMIN_PASSWORD`.
- Edit site title/description, contact email, Play URL, social links.
- **Code injection** — paste raw HTML for verification (Google Search Console,
  Bing, Meta domain verification) and analytics (GA4, GTM, Pixel). It's injected
  **server-side** into the page, so verification tags appear in the HTML source
  and scripts execute on load.
- `/admin` is `noindex` and isolated from the public chrome, so a broken pasted
  snippet can never break the marketing site or lock you out of settings.
- Note: header code is injected at the top of `<body>` (works for analytics and
  most verification). For methods that strictly require the `<head>` (e.g. GSC
  HTML-tag), the GA or DNS verification method is the simplest alternative.

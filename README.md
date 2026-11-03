# StockVirtue

**A virtual stock-market simulator for the Indian markets.** Trade NSE/BSE
equities, F&O, and indices with ₹10,00,000 of paper money against **real
live prices** — no real money is ever involved. Built to help new investors
learn by doing, compete with friends, and study the market risk-free.

> ⚠️ **Educational / simulation only.** All balances and trades are virtual.
> StockVirtue is not a brokerage and does not facilitate real transactions.

---

## What's inside

This is a monorepo with two apps:

| Path        | Stack                                              | Role                              |
|-------------|----------------------------------------------------|-----------------------------------|
| `backend/`  | NestJS 11 · Prisma · PostgreSQL · Redis            | REST API, trading engine, admin   |
| `mobile/`   | Flutter · Riverpod · Firebase                      | Cross-platform mobile client      |
| `docker-compose.yml` | PostgreSQL · Redis · pgAdmin             | Local infrastructure              |

Live market data is sourced from the **Angel One SmartAPI**.

## Features

- **Real-time trading** — market, limit, stop-loss, stop-loss-limit and
  trailing-stop orders; intraday (MIS) and delivery (CNC) products; F&O with
  margin and auto-square-off.
- **Portfolio & analytics** — holdings, realized/unrealized P&L, equity curve,
  capital-gains and risk metrics, daily snapshots.
- **Wallet integrity** — money stored as integer paise, row-level locking on
  every mutation, and DB check-constraints so balances can never go negative.
- **Multiplayer rooms & tournaments** — invite-code rooms with per-member
  return-since-joining leaderboards.
- **Leaderboards, referrals & achievements** — server-authoritative badge
  unlocks with push + email notifications.
- **Trading Academy** — bite-sized lessons (notes + quizzes) anchored on real
  Indian companies, with server-tracked progress.
- **Price alerts, market news, watchlists.**
- **Authentication** — server-side email/password with email OTP; Google and
  phone-OTP via Firebase (phone login is admin-gateable).
- **Admin panel** — server-rendered dashboard: users, trading activity, rooms,
  referrals, learning stats, system health, an append-only audit log, and
  feature flags (including a trading kill-switch).
- **Notifications** — FCM push and transactional email (SMTP).

## Repository layout

```
StockVirtue/
├── backend/            NestJS API
│   ├── src/            feature modules (auth, orders, portfolio, achievements, learn, admin, …)
│   ├── prisma/         schema + migrations
│   └── .env.example    backend configuration template
├── mobile/             Flutter app
│   └── lib/            features/, core/, data/
├── docker-compose.yml  local Postgres + Redis + pgAdmin
└── .env.example        docker-compose configuration template
```

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Docker + Docker Compose
- Flutter SDK (stable channel)
- An Angel One SmartAPI account, a Firebase project, and an SMTP sender

### 1. Infrastructure

```bash
cp .env.example .env          # set POSTGRES/REDIS/PGADMIN values
docker compose up -d          # starts Postgres, Redis, pgAdmin
```

### 2. Backend

```bash
cd backend
cp .env.example .env          # fill in real secrets (see below)
npm install
npx prisma migrate dev        # apply schema
npm run start:dev             # http://localhost:3000/api
```

Key backend environment variables (see `backend/.env.example` for the full
list): `DATABASE_URL`, `REDIS_*`, `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`,
`SMARTAPI_*`, `FCM_SERVICE_ACCOUNT` (minified service-account JSON on one
line), `SMTP_*`, and `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET`.
In production the app **refuses to boot** if the required secrets are missing.

### 3. Mobile

```bash
cd mobile
flutter pub get
flutter run                                                        # uses production API by default
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api    # against a local backend (Android emulator)
```

The app points at the live backend (`https://api.stockvirtue.com/api`) out of
the box; pass `--dart-define=API_BASE_URL=...` to target a local/staging server.
Release builds need no flag:

```bash
flutter build apk --release
```

`mobile/android/app/google-services.json` is the Firebase **client** config
(no private keys) and is committed so the app builds out of the box. Release
signing uses `android/key.properties` — copy `key.properties.example`, point it
at your keystore, and keep both out of version control (already git-ignored).

## Security & secrets

- **`.env` files are never committed** — only the `*.env.example` templates are.
  Real secrets live in `backend/.env` (git-ignored) and your deploy secret store.
- Keystores, `key.properties`, and stray service-account JSON files are
  git-ignored.
- **Before deploying:** generate fresh, strong values for every secret
  (JWT secrets, admin password + session secret, SmartAPI credentials, SMTP
  password, Firebase service account). Never reuse development secrets in
  production.

## Personal data (DPDP Act 2023)

StockVirtue handles personal data under India's Digital Personal Data
Protection Act, 2023 and the DPDP Rules, 2025 (notified 13 November 2025;
most duties apply from 13 May 2027). What the code does:

- **Notice and consent.** Creating an account (email, Google or phone) needs
  a tick: "18 or older, and I agree to the privacy notice". The notice is at
  `/privacy` and, in Hindi, `/privacy/hi`. Every acceptance and every cookie
  choice is a row in `consent_records`: notice version, purposes granted and
  refused, where it was given. An account that hasn't accepted the current
  notice sees it in the app (1.4.0+) before anything else. The version lives
  in three places that must change together: `PRIVACY_NOTICE_VERSION`
  (`backend/src/privacy/privacy.constants.ts`), `NOTICE_VERSION`
  (`web/src/lib/privacy-notice.ts`) and `kPrivacyNoticeVersion` (the app).
- **Optional purposes are off until chosen.** App analytics (Firebase) is off
  until the person turns it on, and the Android build strips the
  advertising-ID permissions. Website analytics and ads wait for the cookie
  banner (see `web/README.md`).
- **Rights.** In the app, Profile → Privacy & your data: download everything
  (JSON, with who it was shared with), name a nominee, raise requests and
  complaints, switch analytics, delete the account. Without the app:
  `stockvirtue.com/privacy/requests` (an emailed code first). Staff answer in
  the portal's Privacy requests (permission `privacy.manage`), before the due
  date set in Site settings → Privacy (at most 90 days). Each answer is
  emailed with the grievance officer's details and the right to complain to
  the Data Protection Board of India.
- **Deleting an account** (by the person, by staff on a request, or for
  inactivity) takes effect at once: email, phone, sign-in links, avatar and
  referral code are cleared, sessions and devices are revoked, and the
  account leaves leaderboards and broadcasts. A locked copy of the identity
  is kept for one year (DPDP Rules, rule 8(3)), then the worker erases the
  account and everything attached to it. Staff accounts can't be deleted
  this way.
- **Retention** runs daily at 03:30 IST in the worker (`privacy-retention`):

  | Data | Kept |
  |---|---|
  | Account and its activity | While the account is open |
  | Deleted account (locked copy) | 1 year, then erased |
  | Account unused for `PRIVACY_INACTIVE_YEARS` (default 3) | Emailed, then deleted 48 hours later unless they sign in |
  | Request logs, abuse events | `MONITORING_LOG_RETENTION_DAYS` (at least 365 days) |
  | Admin sign-in sessions, devices and challenges | 1 year |
  | Contact messages | 1 year after the last reply |
  | In-app notifications | 1 year |
  | Push tokens of devices not seen | 270 days |
  | Staff invitations | 1 year |
  | Newsroom audit log | 3 years |
  | Website cookie choices | 2 years |
  | Closed privacy requests | 3 years |

  The admin panel's audit log is append-only and is not pruned.

### If personal data leaks (DPDP Rules, rule 7)

1. Contain it, and keep the logs (they are kept for a year).
2. Tell each affected person without delay, by email and in the app (admin
   panel → Notifications): what happened and when, what it may mean for
   them, what we are doing, what they can do, and the grievance officer's
   contact.
3. Tell the Data Protection Board of India without delay, then send the
   detailed report within 72 hours of finding out: what happened and why,
   what was done to limit it, what is known about who caused it, the fixes,
   and the messages sent to people.
4. Write it all down: times, decisions, who was told.

### Owner checklist (outside the code)

- Name a grievance officer and fill in Site settings → Privacy (name, email,
  phone, legal name, postal address). Until then the notice shows the
  contact email.
- Have a lawyer review `/privacy`, `/privacy/hi` and `/terms`, and someone
  fluent check the Hindi.
- Data processing terms with every provider that handles personal data:
  Google Firebase, the email provider, hosting, Cloudflare R2, and the
  logo/chart providers the app loads.
- Keep nginx access logs for a year (logrotate), like the app's own logs.
- Backups hold deleted accounts too: keep them no longer than a year.
- Google Play: update Data safety (analytics optional, data deletion in the
  app and at `https://stockvirtue.com/privacy/requests`) and answer "No" to
  the advertising ID question for 1.4.0.
- Set `PRIVACY_REQUIRE_SIGNUP_CONSENT=true` once most users run 1.4.0.

## License

Proprietary — © VamigoIN. All rights reserved.

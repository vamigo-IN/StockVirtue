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

## License

Proprietary — © VamigoIN. All rights reserved.

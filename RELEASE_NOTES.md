# Release Notes — v1.0.0

## Project Overview

The Business Market Monitoring & Alert Platform is a backend API that
helps small and mid-sized businesses track raw material prices, monitor
industry-relevant news, and receive proactive email alerts for better
purchasing decisions. Built against a fully frozen requirements,
architecture, database, and API design (Documents 1–6, `docs/`), this
release implements the complete Version 1 scope defined in those
documents, plus a full production-hardening pass.

## Features

- **Authentication** — registration, login, JWT access/refresh tokens,
  logout, and full Password Reset (request + confirm, single-use
  SHA-256-hashed tokens with expiry)
- **Business Profile** — one business per user, industry assignment,
  editable contact/settings
- **Industry Knowledge Base** — 5 approved industries (Packaged Drinking
  Water as anchor, Plastic Manufacturing, Food & Beverage, Dairy, FMCG),
  each with raw materials, cost drivers, external market factors, news
  keywords, and dependency relationships
- **Industry Templates** — auto-generated tracked-material list on
  business creation, from the Knowledge Base
- **Raw Material Tracking** — list, toggle tracking, add custom materials
- **Price Tracking** — manual price entry, latest-price lookup, full
  immutable history
- **Historical Trends** — date-range filtered, paginated price history;
  multi-material comparison (1–5 materials)
- **Market News Monitoring** — industry-tagged news feed, paginated
- **Email Alerts** — price threshold rules (create/update/soft-delete),
  alert event history
- **Dashboard** — single aggregated view: tracked materials with latest
  prices, recent news, active alert rules, recent alert events, sync status
- **System Health** — liveness/readiness endpoint with database
  connectivity and scheduler status

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥18 |
| Framework | Express.js |
| Database | MySQL 8.0.16+ |
| Auth | JWT (`jsonwebtoken`), `bcrypt` password hashing |
| Rate limiting | `express-rate-limit` |
| DB driver | `mysql2` (promise API, connection pooling) |
| Dev tooling | `nodemon` |
| Frontend (structural only) | HTML / CSS / vanilla JS, Bootstrap, Chart.js |

No ORM — parameterized raw SQL throughout, organized by the Repository
pattern. No external logging/queue/email libraries — a lightweight,
dependency-free logger is included; email delivery is not implemented (see
Known Limitations).

## Folder Structure

```
business-market-monitor/
├── backend/
│   ├── src/
│   │   ├── config/        # env loading, JWT config, fail-fast validation
│   │   ├── constants/      # DB enum mirrors
│   │   ├── controllers/    # HTTP layer — thin, no business logic
│   │   ├── database/       # MySQL connection pool
│   │   ├── email/          # Nodemailer templates (unimplemented placeholders)
│   │   ├── jobs/            # Scheduled job placeholders (unimplemented)
│   │   ├── middleware/      # auth, validation, rate limiting, error handling
│   │   ├── migrations/      # 17 table DDL files, FK-ordered
│   │   ├── models/          # table-shape references (partial)
│   │   ├── repositories/    # all SQL, parameterized queries only
│   │   ├── routes/          # Express routers, one per module
│   │   ├── seeders/         # Knowledge Base seed data
│   │   ├── services/        # business logic, framework-agnostic
│   │   ├── utils/           # logger, JWT/hash/token helpers, response envelope
│   │   └── validators/      # request shape/format validation
│   ├── scripts/            # migrate.js, seed.js (CLI runners)
│   ├── tests/              # reserved, no framework chosen yet
│   ├── app.js / server.js
│   └── package.json
├── frontend/               # structural placeholder, not implemented
├── docs/                   # Documents 1–6 (frozen planning documentation)
└── README.md
```

## Installation

```
cd backend
npm install
cp .env.example .env        # fill in real values — see Environment Variables below
npm run migrate              # creates all 17 tables
npm run seed                 # populates the Industry Knowledge Base
npm run dev                  # or: npm start
```

Requires MySQL 8.0.16+ reachable via the `DB_*` values in `.env`.

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | No | `development` | Enables production-only behavior (e.g. `trust proxy`) |
| `PORT` | No | `5000` | HTTP port |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Yes | — | MySQL connection |
| `DB_SSL_ENABLED` | No | `false` | Enable TLS to MySQL |
| `DB_SSL_REJECT_UNAUTHORIZED` | No | `true` | Certificate strictness when SSL enabled |
| `JWT_ACCESS_SECRET` | **Yes** | — | Server refuses to start if missing/blank |
| `JWT_REFRESH_SECRET` | **Yes** | — | Server refuses to start if missing/blank |
| `JWT_ACCESS_EXPIRY` | No | `30m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token lifetime |
| `SMTP_*` | No | — | Reserved; email delivery is not implemented |
| `CORS_ALLOWED_ORIGIN` | No | `http://localhost:5000` | Single allowed origin, no wildcard |
| `AUTH_RATE_LIMIT_WINDOW` | No | `15m` | Rate-limit window for auth endpoints |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | No | `10` | Max requests per window |
| `PRICE_INGESTION_CRON`, `NEWS_INGESTION_CRON`, `ALERT_EVALUATION_CRON` | No | — | Reserved; scheduled jobs are not implemented |
| `GOV_DATA_API_KEY` | No | — | Reserved for a future free government price dataset integration |
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` | No | `60` | Reset link validity |

## Available Scripts

| Script | Purpose |
|---|---|
| `npm start` | Run in production mode |
| `npm run dev` | Run with `nodemon` (auto-restart on file changes) |
| `npm run migrate` | Apply all 17 table migrations, in FK order, idempotent |
| `npm run seed` | Populate the Industry Knowledge Base, idempotent |

## API Summary

30 endpoints across 11 modules, all under `/api/v1`:

| Module | Endpoints |
|---|---|
| Authentication | register, login, refresh, logout, password-reset request/confirm, email-verification stubs |
| Business Profile | create, get, update |
| Industry Knowledge Base | list industries, get industry, get industry knowledge base, list units |
| Raw Material Tracking | list, add custom, update (toggle tracking) |
| Price Tracking | get latest price, add manual price |
| Historical Trends | price history (paginated, date-range filtered), compare (1–5 materials) |
| Market News | list (paginated, industry-filtered) |
| Email Alerts | list/create/update/soft-delete rules, list events |
| Dashboard | aggregated single-screen view |
| System Health | liveness + database + scheduler status |

Every response uses a consistent `{success, data, meta}` / `{success, error}` envelope. Full endpoint-by-endpoint detail: `docs/Document-5-API-Design.md`.

## Security Features

- Passwords hashed with `bcrypt`; reset tokens hashed with SHA-256 (raw token never stored)
- JWT access/refresh tokens with separate secrets and independent expiries
- Server refuses to start if either JWT secret is missing or blank (fail-fast, no empty-string fallback)
- 100% parameterized SQL queries — no string-concatenated SQL anywhere
- Business-scoped data isolation enforced at the repository layer on every request
- Cross-tenant access returns `404`, not `403` (doesn't confirm another tenant's resource exists)
- Rate limiting on login, register, and password-reset-request, with correct per-client scoping behind a reverse proxy in production
- Password reset: single-use, time-limited, hashed tokens; requesting a new reset invalidates prior outstanding ones; identical response whether or not an email is registered (no account enumeration)
- CORS restricted to a single configured origin, no wildcard
- Optional TLS to MySQL for managed database providers

## Production Hardening Summary

This release includes a full hardening pass beyond the original feature set:
- Migration and seeder CLI runners (a fresh clone can provision its own database)
- Fail-fast environment validation at boot
- Functional rate limiting with correct reverse-proxy IP handling in production
- Optional database TLS
- Asynchronous, non-blocking structured logging with size-based rotation (one backup kept)
- Graceful shutdown (`SIGTERM`/`SIGINT`) — HTTP server, log queue, and database pool all close cleanly
- `businessId` is resolved from the JWT when available, falling back to a database lookup only when necessary — removing a redundant query from most authenticated requests, with full backward compatibility for tokens issued before this change
- No shipped `.env` — only `.env.example`, with accurate setup instructions

## Known Limitations

- **No scheduled ingestion.** Price and news data must be entered/tagged
  through the API; there is no automated fetching job (`node-cron` is not
  installed).
- **No email delivery.** Password reset tokens and alert/news-digest
  notifications are not emailed — `nodemailer` is not installed. Password
  reset's raw token is written to the application log as a development-only
  stand-in, clearly marked as such, and is never returned in the API
  response.
- **No frontend implementation.** The `frontend/` folder is a structural
  placeholder only.
- **Email verification (FR-AUTH-08)** is unimplemented — this was always
  optional/non-blocking per the frozen requirements, not a regression.
- A small number of low-severity code-quality items remain from the most
  recent audit (e.g. an unused reference-constants file, minor duplication
  in one service) — none affect functionality or security.

## Future Improvements

- Implement `PriceIngestionService`/`NewsIngestionService` scheduled jobs (`node-cron`)
- Implement `NotificationService` (Nodemailer) for real email delivery — password reset, alerts, news digest
- Frontend implementation (Bootstrap/Chart.js, per Document 1's approved stack)
- AI Business Intelligence (Version 2, per Document 1's roadmap) — the Knowledge Base's dependency-relationship data model was specifically designed to support this without a schema redesign
- WhatsApp alerts, supplier recommendations, multi-business support (Version 2/3, per Document 1's roadmap)

## Version

**v1.0.0**

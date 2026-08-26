# Document 6: Project Folder Structure

## Document Control

| Field | Value |
|---|---|
| Document | Project Folder Structure |
| Version | 1.1 (Frozen) |
| Status | **Approved — Frozen** |
| Baseline Reference | Documents 1–5 (all Frozen) — no prior decision revisited |
| Date | 2026-07-18 |
| Approved By | Project Owner, 2026-07-18 |

**Revision note (1.1):** Added `backend/logs/` (git-ignored runtime logs) and `backend/tests/` (`unit/`, `integration/` — reserved, no framework/implementation). No other folder, file, or decision changed. **Document frozen and approved — no further changes without a formal revision.**

This document defines the exact folder/file structure to create in VS Code. It does not re-explain decisions already made in Documents 1–5 — it only expresses them as a filesystem.

---

## 1. Overall Project Structure

```
business-market-monitor/
├── backend/          # Node.js / Express API — also serves the frontend statically (Doc 3 §15)
├── frontend/         # Bootstrap / vanilla JS / Chart.js static site, no build step
├── docs/             # Frozen Documents 1–6 (this series)
├── .gitignore
└── README.md
```

**Frontend** (brief — not the focus of this document):
```
frontend/
├── index.html
├── pages/            # login.html, register.html, dashboard.html, materials.html, alerts.html, trends.html
├── css/
├── js/
│   ├── api/          # one fetch-wrapper file per backend module
│   ├── pages/         # per-page logic
│   └── components/     # Chart.js chart builders, shared UI bits
└── assets/
```
No shared code folder is needed between frontend and backend in V1 — the two communicate only over the REST API (Document 5), so there is nothing to share at the filesystem level.

---

## 2. Backend Folder Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js
│   │   └── jwt.config.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── business.routes.js
│   │   ├── knowledgeBase.routes.js
│   │   ├── materials.routes.js
│   │   ├── prices.routes.js
│   │   ├── trends.routes.js
│   │   ├── news.routes.js
│   │   ├── alerts.routes.js
│   │   ├── dashboard.routes.js
│   │   ├── health.routes.js
│   │   └── index.js               # mounts all routers under /api/v1
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── business.controller.js
│   │   ├── knowledgeBase.controller.js
│   │   ├── material.controller.js
│   │   ├── price.controller.js
│   │   ├── trend.controller.js
│   │   ├── news.controller.js
│   │   ├── alert.controller.js
│   │   ├── dashboard.controller.js
│   │   └── health.controller.js
│   │
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── business.service.js
│   │   ├── knowledgeBase.service.js
│   │   ├── templateGeneration.service.js
│   │   ├── materialTracking.service.js
│   │   ├── priceIngestion.service.js
│   │   ├── priceQuery.service.js
│   │   ├── newsIngestion.service.js
│   │   ├── newsTagging.service.js
│   │   ├── alertEvaluation.service.js
│   │   ├── notification.service.js
│   │   ├── dashboardAggregation.service.js
│   │   └── trendQuery.service.js
│   │
│   ├── repositories/
│   │   ├── user.repository.js
│   │   ├── business.repository.js
│   │   ├── knowledgeBase.repository.js
│   │   ├── material.repository.js
│   │   ├── price.repository.js
│   │   ├── news.repository.js
│   │   ├── alertRule.repository.js
│   │   ├── alertEvent.repository.js
│   │   └── syncStatus.repository.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js       # JWT verification
│   │   ├── validate.middleware.js   # runs validators/, formats 400s
│   │   ├── rateLimiter.middleware.js
│   │   └── errorHandler.middleware.js
│   │
│   ├── validators/
│   │   ├── auth.validator.js
│   │   ├── business.validator.js
│   │   ├── material.validator.js
│   │   ├── price.validator.js
│   │   └── alert.validator.js
│   │
│   ├── models/                      # table/query-shape definitions used by repositories/
│   │   └── (one per Document 4 table, e.g. trackedMaterial.model.js)
│   │
│   ├── jobs/
│   │   ├── priceIngestion.job.js    # node-cron: PriceSourceAdapter implementations live here
│   │   ├── newsIngestion.job.js
│   │   └── alertEvaluation.job.js
│   │
│   ├── email/
│   │   ├── mailer.js                # Nodemailer transport
│   │   └── templates/
│   │       ├── passwordReset.template.js
│   │       ├── alertNotification.template.js
│   │       └── newsDigest.template.js
│   │
│   ├── database/
│   │   └── connection.js            # mysql2 pool
│   │
│   ├── seeders/                     # Knowledge Base seed data (OI-1, Doc 2)
│   │   ├── industries.seed.js
│   │   ├── unitsOfMeasurement.seed.js
│   │   ├── rawMaterials.seed.js
│   │   ├── costDrivers.seed.js
│   │   ├── externalFactors.seed.js
│   │   ├── newsKeywords.seed.js
│   │   └── knowledgeBaseDependencies.seed.js
│   │
│   ├── migrations/                  # one file per Document 4 table (17 total)
│   │   ├── 001_create_users_table.js
│   │   ├── 002_create_user_tokens_table.js
│   │   └── ... (through 017)
│   │
│   ├── constants/
│   │   └── enums.js                 # mirrors every DB ENUM (Doc 4): conditionType, source, etc.
│   │
│   ├── utils/
│   │   ├── hash.js                  # bcrypt wrappers
│   │   ├── jwt.js                   # sign/verify helpers
│   │   └── pagination.js            # shared page/limit parsing (Doc 5 §3.5)
│   │
│   ├── types/
│   │   └── (JSDoc typedefs only — project is plain JS, not TypeScript, per approved stack)
│   │
│   └── app.js                       # Express app assembly — middleware + routes, no listen()
│
├── server.js                        # entry point: DB connect → start jobs → app.listen()
├── logs/                            # runtime log files (ignored by git — Section 4)
├── tests/                           # reserved for future automated testing — no framework/implementation in V1
│   ├── unit/
│   └── integration/
├── package.json
├── .env
├── .env.example
├── .gitignore
└── README.md
```

---

## 3. Folder Responsibilities

| Folder | Responsibility |
|---|---|
| `config/` | Loads and validates environment variables; central JWT/config constants. |
| `routes/` | Declares URL paths + HTTP methods (Document 5); wires middleware → controller. No logic. |
| `controllers/` | Parses request, calls one service, shapes the HTTP response (Document 3's Application Layer). |
| `services/` | Business logic — the actual behavior described in Document 2's FRs. No `req`/`res`, no SQL. |
| `repositories/` | All SQL against Document 4's schema. Every query scoped by `businessId` from the JWT (Doc 5 §2.4). |
| `middleware/` | Cross-cutting request handling: auth, validation, rate limiting, centralized error formatting (Doc 3 §12). |
| `validators/` | Request body/query schemas — one file per module needing validation (Doc 5 §3.3). |
| `models/` | Table-shape definitions repositories query against — mirrors Document 4 exactly. |
| `jobs/` | node-cron schedules and the `PriceSourceAdapter` / `NotificationChannel` implementations (Doc 3 §8, §10). |
| `email/` | Nodemailer transport + one template per outgoing email type. |
| `database/` | Single MySQL connection pool, imported wherever a repository needs it. |
| `seeders/` | One-time/rerunnable scripts populating the Knowledge Base — the only way KB data enters the system in V1 (no admin UI, OI-1). |
| `migrations/` | Schema creation, one file per table, run in order to stand up the database from empty. |
| `constants/` | JS mirrors of every database ENUM, so a typo can't silently diverge from the schema. |
| `utils/` | Small, stateless helpers with no business meaning of their own. |
| `types/` | JSDoc typedefs for editor autocomplete — not compiled, not TypeScript. |
| `logs/` | Runtime log output. Git-ignored (Section 4) — never committed. |
| `tests/` | Reserved for future automated testing (`unit/`, `integration/`). No framework or test files in V1 — placeholder structure only. |

---

## 4. Configuration Files

| File | Purpose |
|---|---|
| `package.json` | Dependencies, scripts (`start`, `dev`, `migrate`, `seed`), Node engine version. |
| `.env` | Actual secrets/config for the current environment. **Never committed.** |
| `.env.example` | Every variable from Section 5, with placeholder values — committed, onboards a new environment. |
| `.gitignore` | Excludes `node_modules/`, `.env`, `logs/`, `*.log`, and any local build artifacts. |
| `README.md` | Setup steps (install → configure `.env` → migrate → seed → run) and a link to `docs/`. |

---

## 5. Environment Variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `PORT` | HTTP port for `server.js` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL connection (Document 4) |
| `JWT_ACCESS_SECRET` | Signs access tokens (Doc 5 §2.1) |
| `JWT_REFRESH_SECRET` | Signs refresh tokens — **different secret from access**, so a leaked access secret can't forge refresh tokens |
| `JWT_ACCESS_EXPIRY` | Default `30m` (Doc 5 §2.1) |
| `JWT_REFRESH_EXPIRY` | Default `7d` (Doc 5 §2.1) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` | Nodemailer transport (Doc 3) |
| `CORS_ALLOWED_ORIGIN` | Frontend origin allowed by CORS (Doc 3 §13) |
| `AUTH_RATE_LIMIT_WINDOW` | Default `15m` (Doc 5 v1.1 §5) |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | Default `10` (Doc 5 v1.1 §5) |
| `PRICE_INGESTION_CRON` | Cron expression for the price job (Doc 3 §8) |
| `NEWS_INGESTION_CRON` | Cron expression for the news job (Doc 3 §9) |
| `ALERT_EVALUATION_CRON` | Cron expression for the alert job (Doc 3 §10) |
| `GOV_DATA_API_KEY` | Optional — only if the selected free government dataset (Doc 3 ADR) requires a key |

---

## 6. Naming Conventions

- **Files:** `camelCase` + layer suffix — `material.controller.js`, `material.service.js`, `material.repository.js`.
- **Folders:** lowercase, plural for multi-file layers (`controllers/`, `services/`), singular for single-purpose folders (`config/`, `database/`).
- **Routes:** exactly match Document 5's paths — `kebab-case` for multi-word segments, plural nouns (`/password-reset`, `/materials`).
- **Services:** `<domain>.service.js`, or `<domain><Action>.service.js` where a module has more than one (`priceIngestion.service.js`, `priceQuery.service.js` — matches Document 3 §5 exactly).
- **Repositories:** `<entity>.repository.js`, one per primary table it owns (Document 4).

---

## 7. Development Workflow

```
Route → Controller → Service → Repository → Database
```

A request enters through `routes/`, is authenticated/validated by `middleware/` + `validators/`, handled by one `controllers/` function that delegates to `services/` for logic, which calls `repositories/` for data — never skipping a layer, matching Document 3 §3 exactly.

---

## Approval — Frozen

**Status: Approved and frozen (v1.1) by the Project Owner on 2026-07-18.** This is the final planning document. No Docker, CI/CD, Swagger/OpenAPI, Redis, TypeScript, or new architecture concepts were introduced.

**Documents 1–6 are now all frozen.** The next phase is implementation only.

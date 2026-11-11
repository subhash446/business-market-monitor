# Business Market Monitor (BMM) — Deployment & Operations Runbook

> **Note:** This runbook reflects only configuration, scripts, environment variables, migrations, and routes directly present in this repository (`backend/` and `frontend-react/`). Account-specific dashboard settings on Cloudflare Pages, Render, and Aiven (service IDs, plan tiers, backup/PITR retention, and stored secret values) live outside the repository and must be verified directly in each provider's dashboard.

---

## 1. Repository Deployment Topology

This repository is organized as two independent Node/JavaScript packages (there is **no root `package.json`** and **no `render.yaml`**):

1. **Backend API (`backend/` — [`backend/package.json`](backend/package.json))**
   - Node.js (`>= 18.0.0`) + Express REST API (`/api/v1/*`) + optional `node-cron` background jobs.
   - Start command (defined in `backend/package.json`): `npm start` (`node server.js`, executed with working directory `backend/`).
   - Also configures `cors({ origin: env.cors.allowedOrigin })` and static/SPA fallback serving from `frontend-react/dist` when built on the same host (`backend/src/app.js`).
   - Database TLS is controlled in `backend/src/database/connection.js` via `DB_SSL_ENABLED`, `DB_SSL_REJECT_UNAUTHORIZED`, and `DB_SSL_CA_PATH`.

2. **Frontend SPA (`frontend-react/` — [`frontend-react/package.json`](frontend-react/package.json))**
   - React + Vite SPA (`npm run build` -> outputs `frontend-react/dist`).
   - [`frontend-react/.env.production`](frontend-react/.env.production) sets `VITE_API_BASE_URL=https://business-market-monitor-api.onrender.com`, which `frontend-react/src/api/client.js` (`resolveApiBase`) normalizes to `https://business-market-monitor-api.onrender.com/api/v1`.
   - Split hosting topology (Cloudflare Pages frontend + Render backend API + managed MySQL): documented in `.gitignore` (`!frontend-react/.env.production`) and `frontend-react/.env.production`. Exact Cloudflare Pages project build settings and Render service/plan dashboard settings are external to this repository and unverified here.

3. **Security & Operational Defaults (`backend/src/config/env.js`, `validateEnv.js`)**
   - `.gitignore` excludes `.env`, `*.env` (except `frontend-react/.env.production`), `backend/.env`, and `backend/certs/*.pem` / `*.crt`.
   - Boot validation (`backend/src/config/validateEnv.js`) requires `DB_HOST`, `DB_NAME`, `DB_USER`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (plus conditional API keys when the corresponding scheduler/provider flag is `'true'`).
   - Background schedulers and external feed flags default to `'false'`: `PRICE_INGESTION_ENABLED`, `NEWS_INGESTION_ENABLED`, `AI_INSIGHTS_ENABLED`, `ALERT_EVALUATION_ENABLED`, and `INDIA_GOVT_DATA_ENABLED`.

---

## 2. Environment Variables Matrix (Verified in `backend/src/config/env.js` & `frontend-react/.env.production`)

### 2.1 Backend Variables

| Variable | Default in `env.js` | Required | Notes |
|---|---|---|---|
| `NODE_ENV` | `development` | Optional | Set `production` in production (enables `trust proxy` = `1` in `app.js`). |
| `PORT` | `5000` | Optional | HTTP listen port (`server.js`). |
| `DB_HOST` | `localhost` | **Yes** | Checked non-blank at boot by `validateEnv.js`. |
| `DB_PORT` | `3306` | Optional | MySQL port. |
| `DB_NAME` | `business_market_monitor` | **Yes** | Checked non-blank at boot by `validateEnv.js`. |
| `DB_USER` | `root` | **Yes** | Checked non-blank at boot by `validateEnv.js`. |
| `DB_PASSWORD` | `''` | Deployment-dependent | Secret; set to your managed MySQL user password. |
| `DB_SSL_ENABLED` | `false` | Optional | Set `true` for TLS connections to managed MySQL. |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` | Optional | Strict CA certificate verification (`connection.js`). |
| `DB_SSL_CA_PATH` | `''` | Conditional | Required when `DB_SSL_ENABLED=true` and `DB_SSL_REJECT_UNAUTHORIZED=true`. Resolves relative to the backend working directory (or an absolute secret mount path). |
| `JWT_ACCESS_SECRET` | `undefined` | **Yes** | Secret; verified non-blank by `validateEnv.js`. |
| `JWT_REFRESH_SECRET` | `undefined` | **Yes** | Secret; distinct secret verified non-blank by `validateEnv.js`. |
| `JWT_ACCESS_EXPIRY` | `30m` | Optional | Access token lifetime. |
| `JWT_REFRESH_EXPIRY` | `7d` | Optional | Refresh token lifetime. |
| `CORS_ALLOWED_ORIGIN` | `http://localhost:5000` | Recommended | Must match your deployed frontend origin (e.g., Cloudflare Pages origin) in split hosting. |
| `AUTH_RATE_LIMIT_WINDOW` | `15m` | Optional | Auth rate-limiter window. |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | `10` | Optional | Max auth requests per window per IP. |
| `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` | `60` | Optional | Password reset token expiry window. |
| `RESEND_API_KEY` | `undefined` | Optional (for email) | Secret; validated on demand by `env.resend.validate()`. |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` | Optional | Sender email address for alert/password-reset emails. |
| `PRICE_INGESTION_ENABLED` | `false` | Optional | Keep `false` unless intentionally enabling scheduled price sync. |
| `INDIA_GOVT_DATA_ENABLED` | `false` | Optional | Requires `GOV_DATA_API_KEY` at boot if `true`. |
| `NEWS_INGESTION_ENABLED` | `false` | Optional | Requires `GNEWS_API_KEY` at boot if `true`. |
| `AI_INSIGHTS_ENABLED` | `false` | Optional | Requires `GEMINI_API_KEY` at boot if `true`. |
| `ALERT_EVALUATION_ENABLED` | `false` | Optional | Alert evaluation cron job flag. |
| `EIA_API_KEY`, `GOV_DATA_API_KEY`, `GNEWS_API_KEY`, `GEMINI_API_KEY` | `undefined` | Conditional | Secrets required by `validateEnv.js` only when their respective flags are `'true'`. |

*(Additional tuning variables supported in `env.js`: `PRICE_INGESTION_CRON`, `NEWS_INGESTION_CRON`, `ALERT_EVALUATION_CRON`, `AI_INSIGHTS_CRON`, `PRICE_PROVIDER_TIMEOUT_MS`, `NEWS_PROVIDER_TIMEOUT_MS`, `NEWS_INGESTION_THROTTLE_MS`, `AI_INSIGHTS_TIMEOUT_MS`, `EIA_API_BASE_URL`, `DATA_GOV_IN_BASE_URL`, `DATA_GOV_IN_MANDI_RESOURCE_ID`, `GNEWS_API_BASE_URL`, `GEMINI_MODEL`, `GEMINI_BASE_URL`.)*

### 2.2 Frontend Variable

| Variable | Source in Repo | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | [`frontend-react/.env.production`](frontend-react/.env.production) | Currently set to `https://business-market-monitor-api.onrender.com`; normalized to append `/api/v1` (`client.js`). Leave blank locally to use the Vite dev proxy. |

---

## 3. Repository Verification Commands

Run these commands from the repository root (`business-market-monitor/`):

1. **Backend Test Suite (mocked DB/providers):**
   ```bash
   npm --prefix backend test
   ```
   *(Verified baseline on current branch: 36 suites / 636 tests passing.)*

2. **Frontend Test Suite:**
   ```bash
   npm --prefix frontend-react test -- --run
   ```
   *(Verified baseline on current branch: 8 suites / 23 tests passing.)*

3. **Frontend Lint & Production Build:**
   ```bash
   npm --prefix frontend-react run lint
   npm --prefix frontend-react run build
   ```
   *(Verified baseline: 0 errors, 17 pre-existing warnings; `vite build` generates `frontend-react/dist`.)*

---

## 4. Database Migrations & Knowledge Base Seeding

### 4.1 Targeted Production Runner for Migration `026` (`backend/scripts/apply_026_cooldown_widening.js`)

When applying migration `026` to an **existing production database** where migrations `001`–`025` have already been applied, use the dedicated targeted runner from `backend/`:

```bash
cd backend && node scripts/apply_026_cooldown_widening.js
```

*(Why targeted execution is required on existing databases: `backend/scripts/migrate.js` has no migration-history table and replays `001`–`026`. Replaying `020_create_ai_insights_table.js` temporarily removes `'ALERT_EVALUATION'` from `sync_statuses.job_type` before `023_add_alert_rule_enhancements.js` restores it, which can fail under strict SQL mode if an `'ALERT_EVALUATION'` row exists.)*

**Required environment variables (`backend/.env` or shell, resolved from `backend/`):**
- Non-blank `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and valid `DB_PORT` (`1`–`65535`).
- Production-safe TLS settings: `DB_SSL_ENABLED=true`, `DB_SSL_REJECT_UNAUTHORIZED=true`, and a readable, non-empty certificate file at `DB_SSL_CA_PATH` (e.g., `./certs/ca.pem` relative to `backend/`, or `/etc/secrets/ca.pem`).

**Built-in runner pre/post checks & safeguards:**
1. Enforces an exact filename allowlist permitting only `026_widen_alert_rule_cooldown_hours.js` (rejects other migrations, arbitrary flags, and path traversal).
2. Validates env & TLS settings before pool creation and logs sanitized target metadata only (never logs passwords, certificates, or connection strings).
3. Verifies connected identity (`SELECT DATABASE() AS db, @@version AS version` matches `DB_NAME`), `alert_rules` table presence, and pre-migration `alert_rules.cooldown_hours` definition (`tinyint unsigned`, `IS_NULLABLE = NO`, `COLUMN_DEFAULT = 24`; also supports idempotent re-verification if already `smallint unsigned`).
4. Sets `SET SESSION lock_wait_timeout = 30`, invokes only `026_widen_alert_rule_cooldown_hours.js` exported `up(pool)` on that session, and releases/closes the pool in `finally` on both success and failure.
5. Post-verifies `information_schema.COLUMNS` for `alert_rules.cooldown_hours` (`DATA_TYPE = 'smallint'`, `COLUMN_TYPE` contains `'unsigned'`, `IS_NULLABLE = 'NO'`, `COLUMN_DEFAULT = '24'`), exiting non-zero on mismatch.

*(Optional manual read-only SQL verification before/after running the script:)*
```sql
SELECT DATABASE() AS db, @@version AS version;
SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'alert_rules'
  AND COLUMN_NAME = 'cooldown_hours';
```

### 4.2 Full Bootstrap Scripts (`backend/package.json`)
- **Fresh-database bootstrap migrations (`001`–`026`):**
  ```bash
  npm --prefix backend run migrate
  ```
  Executes `node scripts/migrate.js` from `backend/`. Intended for fresh environment initialization: discovers all `*.js` files in `backend/src/migrations/` in sorted order (`001` through `026`), skips files without `up`, runs idempotent checks per migration, and calls `process.exit(1)` on the first error without automatic rollback.
- **Run Knowledge Base seeder:**
  ```bash
  npm --prefix backend run seed
  ```
  Executes `node scripts/seed.js` from `backend/` using idempotent inserts/upserts (e.g., `ON DUPLICATE KEY UPDATE` for `raw_materials` `default_external_symbol`).

### 4.3 Important Operational Notes
- **No automated pre-deploy runner exists in the repository:** Because there is no `render.yaml` / root predeploy script (and Render Free services do not run `preDeployCommand` automatically — verify your Render plan in the Render dashboard), run `cd backend && node scripts/apply_026_cooldown_widening.js` manually against the existing target environment **before** shipping backend code that relies on `cooldownHours` values `256`–`720`.
- **Migration `026` Rollback Caveat:** `026_widen_alert_rule_cooldown_hours.js` `down()` queries `COUNT(*) FROM alert_rules WHERE cooldown_hours > 255` and throws an error rather than truncating rows if any rule uses cooldown values above `255`.
- **Database Backup / Restore:** Automated backup schedules, PITR availability, and `mysqldump` credentials depend on your external MySQL host/plan and are not configured in this repository; verify backup state in your database provider dashboard before running production migrations.

---

## 5. Health Check Verification (`backend/src/controllers/health.controller.js`)

After deployment, query the backend health endpoint:

```bash
curl -i https://<your-backend-origin>/api/v1/health
```

**Observed response contract (`200 OK` when DB reachable):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "connected",
    "timestamp": "2026-11-11T00:00:00.000Z",
    "scheduler": {
      "priceIngestion": { "lastRunAt": null, "lastSuccessAt": null, "lastStatus": null },
      "newsIngestion": { "lastRunAt": null, "lastSuccessAt": null, "lastStatus": null }
    }
  }
}
```

When `SELECT 1` fails, `GET /api/v1/health` responds HTTP `500` with `"success": false` and `"database": "unreachable"`.

# Business Market Monitor — Backend

Node.js / Express API for Version 1.0.0 (Document 1 v1.2). Implements the
full contract frozen in Documents 2–6, including Password Reset
(FR-AUTH-07) — every documented FR is now implemented and verified.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in real values:
   ```
   cp .env.example .env
   ```
   **`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are required** — the
   server refuses to start if either is missing or blank (see
   "Fail-fast configuration" below). No working `.env` is shipped with this
   project; you must create your own.
3. Set up the database (see below).
4. `npm run dev` (or `npm start` for production mode).
5. Confirm it's running: `GET http://localhost:5000/api/v1/health`

## Database

MySQL 8.0.16+ is required (recursive CTEs and `CHECK` constraints depend on
this version — Document 4 §12.2).

1. Create the database and a user, matching your `.env`'s `DB_*` values.
2. Run migrations: `npm run migrate` — creates all 17 tables in
   FK-dependency order (Document 4 §5). Safe to re-run (every migration
   uses `CREATE TABLE IF NOT EXISTS`).
3. Seed the Industry Knowledge Base: `npm run seed` — populates the 5
   approved industries, units, raw materials, cost drivers, external
   factors, news keywords, and their dependency relationships (Document 1
   §3–4). This is the only way Knowledge Base data enters the system in V1
   — there is no admin UI (Document 2, OI-1). Safe to re-run (idempotent —
   already-seeded rows are skipped, not duplicated).

Both scripts stop immediately on the first failure and log which step
failed, rather than continuing with a partially-applied schema or dataset.

## Fail-fast configuration

The server validates `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` before doing
anything else at boot, and exits with a clear error (not a silent failure)
if either is missing — a misconfigured secret should refuse to run, not
sign forgeable tokens.

## Rate limiting

`/auth/login`, `/auth/register`, and `/auth/password-reset/request` are
rate-limited, configured via `AUTH_RATE_LIMIT_WINDOW` /
`AUTH_RATE_LIMIT_MAX_REQUESTS` in `.env`. No other endpoint is rate-limited.
In production (`NODE_ENV=production`), Express trusts exactly one proxy hop
(`trust proxy: 1`) so rate limiting is scoped per real client behind a
reverse proxy (e.g. Render) rather than the proxy's own IP.

## Database TLS (optional)

Set `DB_SSL_ENABLED=true` for managed MySQL providers that require or
recommend TLS (e.g. Render Managed MySQL). `DB_SSL_REJECT_UNAUTHORIZED`
controls certificate strictness (default `true`; some providers' minimal CA
chains require setting this to `false`). Disabled by default — local/dev
setups are unaffected unless you opt in.

## Logging

Structured log lines (timestamp + level) are written asynchronously to
both the console and `logs/app.log`, covering server boot, database
connectivity, and unhandled errors — not per-request access logging, which
isn't implemented. `app.log` rotates to `app.log.1` at 5MB (exactly one
backup is kept).

## Graceful shutdown

`SIGTERM`/`SIGINT` (e.g. on redeploy) stop the HTTP server from accepting
new connections, let in-flight requests finish, flush pending log writes,
close the database pool, and exit cleanly — with a safety timeout in case
something hangs.

## Password Reset

`POST /auth/password-reset/request` and `POST /auth/password-reset/confirm`
are fully implemented (FR-AUTH-07): a SHA-256-hashed, single-use token
valid for `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` (default 60). Email
delivery (Nodemailer) is not implemented anywhere in this project — the
raw reset token is written to the application log as a development-only
stand-in, never returned in the API response. A real deployment needs a
`NotificationService`/email integration before this feature is
user-facing; see "Known limitations" in `RELEASE_NOTES.md`.

## Known gaps

See `RELEASE_NOTES.md` for the complete, current list. In brief: scheduled
ingestion jobs (price, news) and email delivery are unimplemented —
`node-cron`/`nodemailer` are not installed. Endpoints that depend on this
data (e.g. `sync` status on the dashboard and health check, and Password
Reset's email step) work correctly but reflect that gap until those jobs
exist.

## Structure

See `docs/Document-6-Project-Folder-Structure.md` for the full, authoritative
folder breakdown. Every file's purpose is also documented in a header comment
at the top of the file itself.

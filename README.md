# Business Market Monitoring & Alert Platform

**Version 1.0.0** — a market monitoring and alerting platform for SMEs to
track raw material prices, industry news, and receive proactive email
alerts. Full planning documentation — frozen and approved — lives in
`docs/`; see `RELEASE_NOTES.md` for the complete v1.0.0 release summary.

## Structure

- `backend/` — Node.js / Express API (see `backend/README.md` to run it)
- `frontend/` — Bootstrap / vanilla JS / Chart.js static site, served by the
  backend (single-deployment design, Document 3 §15) — structural
  placeholder only; not implemented in this release
- `docs/` — Documents 1–6, the frozen source of truth for this project's
  requirements, architecture, database, and API design

## Status

All 11 backend modules (Documents 2–5's full scope, including Password
Reset) are implemented and verified, plus a full production-hardening pass
(migrations/seed tooling, fail-fast config, rate limiting, database TLS,
structured logging with rotation, graceful shutdown). See
`RELEASE_NOTES.md` for the full feature list and known limitations.

## Quick Start

```
cd backend
npm install
cp .env.example .env   # fill in real values — no working .env is shipped
npm run migrate
npm run seed
npm run dev
```

Then visit `http://localhost:5000/api/v1/health`. See `backend/README.md`
for full setup detail.

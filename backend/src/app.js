/**
 * Express app assembly (Document 3 §3, Presentation/Application Layer entry).
 * No app.listen() here — that's server.js's job (Document 6 §2), so the app
 * object can be imported by future tests without starting a real server.
 */
const express = require('express');
const path = require('path');
const cors = require('cors');

const env = require('./config/env');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler.middleware');
const AppError = require('./utils/AppError');

const app = express();

// Production Hardening Phase B, finding H-1: trust the first proxy hop in
// production only (Document 3 §15 — Render sits in front of the app behind
// a single reverse-proxy/load-balancer layer). Value `1` trusts exactly
// one hop — not `true`, which would trust an arbitrary chain of proxies
// and let a client spoof X-Forwarded-For to bypass rate limiting (D2) with
// a forged header. Left unset (Express's default) outside production,
// since local/dev has no proxy in front of it and this setting has no
// effect when no X-Forwarded-For header is present.
if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({ origin: env.cors.allowedOrigin }));
app.use(express.json());

// Serve the static frontend from this same Express app (Document 3 §15 —
// single Express deployment decision for V1).
app.use(express.static(path.join(__dirname, '../../frontend')));

// All API routes live under /api/v1 (Document 5 §1.4 — URI versioning).
app.use('/api/v1', routes);

// Any /api/v1/* path that matched no route becomes a proper JSON 404,
// not Express's default HTML page — keeps every API response inside the
// standard envelope (Document 5 §3.4, §6), including ones with no route.
app.use('/api/v1', (req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
});

// Centralized error handler — must be registered last (Document 3 §12).
app.use(errorHandler);

module.exports = app;

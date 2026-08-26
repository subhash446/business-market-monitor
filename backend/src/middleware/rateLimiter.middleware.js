/**
 * Rate limiting (Production Hardening Phase A, finding D2). Applied only to
 * /auth/login, /auth/register, /auth/password-reset/request — exactly as
 * Document 5 §5 specifies and exactly as auth.routes.js already wires it;
 * no route changes were needed for this finding, only this file.
 *
 * Configured from the existing AUTH_RATE_LIMIT_WINDOW / AUTH_RATE_LIMIT_MAX_REQUESTS
 * env vars (config/env.js, present since Phase 1). Reuses utils/jwt.js's
 * expiryToSeconds() to parse the window string ("15m" etc.) rather than
 * writing a second, duplicate time-string parser.
 */
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { expiryToSeconds } = require('../utils/jwt');
const { sendError } = require('../utils/response');

const windowMs = expiryToSeconds(env.authRateLimit.window) * 1000;

const rateLimiter = rateLimit({
  windowMs,
  max: env.authRateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  // Matches this project's standard error envelope (Document 5 §3.4, §6)
  // instead of express-rate-limit's default plain-text response.
  handler: (req, res) => {
    sendError(res, 429, 'RATE_LIMIT_EXCEEDED', 'Too many requests. Please try again later.');
  },
});

module.exports = rateLimiter;

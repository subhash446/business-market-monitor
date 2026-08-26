/**
 * JWT sign/verify helpers (Document 5 §2.1, §2.2).
 *
 * Access token payload: { sub, email, businessId, iat, exp }.
 * Refresh token payload: { sub, type: 'refresh', iat, exp } — a second,
 * separately-secreted, stateless JWT (Document 5 §2.2: no server-side
 * persistence in V1, since Document 4's `user_tokens` table is scoped to
 * PASSWORD_RESET/EMAIL_VERIFICATION only, not refresh tokens).
 *
 * NOTE: `businessId` is always null in Phase 2 — the Business Profile module
 * (Document 2 §5.2) is not implemented yet, so there is nothing to look up.
 * This will be populated once business.repository.js exists.
 */
const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt.config');

function signAccessToken({ id, email, businessId = null }) {
  return jwt.sign({ sub: id, email, businessId }, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiry,
  });
}

function signRefreshToken({ id }) {
  return jwt.sign({ sub: id, type: 'refresh' }, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiry,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtConfig.accessSecret);
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, jwtConfig.refreshSecret);
  if (payload.type !== 'refresh') {
    throw new Error('Token is not a refresh token');
  }
  return payload;
}

// Converts '30m' / '7d' / '15s' / '2h' style expiry strings to seconds,
// for the numeric `expiresIn` field in API responses (Document 5 §4.1).
function expiryToSeconds(expiry) {
  const match = /^(\d+)([smhd])$/.exec(String(expiry).trim());
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * multipliers[match[2]];
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  expiryToSeconds,
};

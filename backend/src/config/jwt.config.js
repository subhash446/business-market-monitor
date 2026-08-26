/**
 * JWT-specific configuration (Document 5 §2.1, §2.2).
 * Kept separate from env.js because auth.middleware.js and utils/jwt.js
 * (both Phase 2) will import this directly rather than the whole env object.
 */
const env = require('./env');

module.exports = {
  accessSecret: env.jwt.accessSecret,
  refreshSecret: env.jwt.refreshSecret,
  accessExpiry: env.jwt.accessExpiry,
  refreshExpiry: env.jwt.refreshExpiry,
};

/**
 * Fail-fast environment validation (Production Hardening Phase A, finding D1).
 *
 * Called once, first thing, at the top of server.js — before app.js or any
 * route/service/middleware is required. If a required secret is missing,
 * the process exits immediately rather than booting and silently signing
 * forgeable JWTs with an empty/undefined secret.
 *
 * Deliberately scoped to exactly what D1 asked for: JWT_ACCESS_SECRET and
 * JWT_REFRESH_SECRET. Not a general-purpose env-schema validator — adding
 * broader validation is a separate decision, not part of this finding.
 *
 * Deliberately NOT required by scripts/migrate.js or scripts/seed.js: those
 * only need database configuration, not JWT secrets, and forcing JWT
 * secrets to exist just to run a migration would be a new, unrequested
 * constraint on database setup.
 */
const env = require('./env');

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function validateEnv() {
  const missing = [];

  if (isBlank(env.jwt.accessSecret)) {
    missing.push('JWT_ACCESS_SECRET');
  }
  if (isBlank(env.jwt.refreshSecret)) {
    missing.push('JWT_REFRESH_SECRET');
  }

  if (missing.length > 0) {
    console.error('[boot] Refusing to start — required environment variable(s) missing:');
    missing.forEach((name) => console.error(`[boot]   - ${name}`));
    console.error('[boot] Set these in your .env file (see .env.example) before starting the server.');
    process.exit(1);
  }
}

module.exports = validateEnv;

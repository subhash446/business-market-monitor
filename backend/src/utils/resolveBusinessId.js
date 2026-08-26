/**
 * Resolves the authenticated user's businessId (Document 5 §1.5, §2.1).
 *
 * Production Hardening Phase B, finding H-3: prefers the businessId
 * already carried in the verified JWT (auth.middleware.js attaches it to
 * req.auth as req.auth.businessId) — avoiding a database round-trip on
 * every request, the systemic gap identified in the fresh audit (H-3).
 * auth.service.js now populates businessId at login/refresh time
 * (see that file), so most tokens carry a real value here.
 *
 * Falls back to the original DB lookup (businessRepository.findByUserId)
 * whenever the JWT doesn't carry a usable value — covering two cases
 * identically, exactly as before this change:
 *   - An old token issued before this fix (businessId baked in as `null`).
 *   - A user who genuinely has no business yet (also `null` either way).
 * Both correctly still resolve to the same 404 if no business exists.
 *
 * Authorization logic is unchanged: every repository method still scopes
 * by the resulting businessId exactly as before (Document 5 §2.4) — this
 * only changes where that value comes from, never what it's used for.
 */
const businessRepository = require('../repositories/business.repository');
const AppError = require('./AppError');

async function resolveBusinessId(auth) {
  if (auth && auth.businessId !== undefined && auth.businessId !== null) {
    return auth.businessId;
  }

  const business = await businessRepository.findByUserId(auth.userId);
  if (!business) {
    throw new AppError(404, 'NOT_FOUND', 'Business not found');
  }
  return business.id;
}

module.exports = resolveBusinessId;

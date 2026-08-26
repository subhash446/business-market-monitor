/**
 * Cached user and business data — sessionStorage layer
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §8.2 — js/auth/session.js
 *
 * Purpose: cache the full GET /business response and decoded user
 * so the sidebar and other components don't need to re-fetch on
 * every page load.
 *
 * Cache invalidation:
 *  - Business cache cleared after successful PUT /business.
 *  - Both cleared on logout via clearSession() (called alongside auth.clearTokens()).
 */

const USER_KEY     = 'bmm_user';
const BUSINESS_KEY = 'bmm_business';

/* ----------------------------------------------------------------
 * USER CACHE
 * ---------------------------------------------------------------- */

/**
 * Get the cached user payload.
 * @returns {{ userId: number, email: string, businessId: number|null }|null}
 */
export function getCachedUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persist a user payload to session cache.
 * @param {{ userId: number, email: string, businessId: number|null }} user
 */
export function setCachedUser(user) {
  try {
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // sessionStorage unavailable — non-fatal
  }
}

/* ----------------------------------------------------------------
 * BUSINESS CACHE
 * ---------------------------------------------------------------- */

/**
 * Get the cached business data (from GET /business response data).
 * @returns {Object|null}
 */
export function getCachedBusiness() {
  try {
    const raw = sessionStorage.getItem(BUSINESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persist business data to session cache.
 * @param {Object} business — full business object from API
 */
export function setCachedBusiness(business) {
  try {
    sessionStorage.setItem(BUSINESS_KEY, JSON.stringify(business));
  } catch {
    // non-fatal
  }
}

/**
 * Clear only the business cache (e.g. after PUT /business succeeds).
 */
export function clearBusinessCache() {
  sessionStorage.removeItem(BUSINESS_KEY);
}

/* ----------------------------------------------------------------
 * FULL SESSION CLEAR
 * ---------------------------------------------------------------- */

/**
 * Remove all session-cached data.
 * Call alongside auth.clearTokens() on logout.
 */
export function clearSession() {
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(BUSINESS_KEY);
}

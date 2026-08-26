/**
 * Page guard + redirect utility
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §4.4 — js/utils/router.js
 *
 * Re-exports the guard functions from auth.js for use by page modules.
 * Having a separate router.js keeps the import path consistent with
 * what Document 3 specifies, and gives a clean extension point if
 * routing logic grows (e.g. URL state preservation on redirect).
 */

export {
  requireAuth,
  requireBusiness,
  redirectIfAuthenticated,
  isAuthenticated,
  hasBusinessProfile,
  getBusinessId,
  getUserEmail,
  getCurrentUser,
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
} from '../auth/auth.js';

/**
 * Navigate to a URL, replacing the current history entry.
 * Prevents the user from going "back" to a page they shouldn't see.
 *
 * @param {string} url
 */
export function redirectTo(url) {
  window.location.replace(url);
}

/**
 * Navigate to a URL, pushing a new history entry.
 * @param {string} url
 */
export function navigateTo(url) {
  window.location.href = url;
}

/**
 * Build a URL with query parameters.
 * @param {string} base — path e.g. '/pages/prices.html'
 * @param {Object} params — key/value pairs
 * @returns {string}
 */
export function buildUrl(base, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Get the current page path (last segment).
 * '/pages/dashboard.html' → 'dashboard.html'
 * @returns {string}
 */
export function getCurrentPage() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1] || 'index.html';
}

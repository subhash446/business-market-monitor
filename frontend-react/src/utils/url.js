/**
 * URL utilities
 * Business Market Monitor — React frontend
 *
 * Extracted from:
 *   frontend/js/utils/dom.js     → getParam()
 *   frontend/js/utils/router.js  → buildUrl()
 *
 * These are the only functions from dom.js and router.js that are
 * genuinely pure URL helpers with no DOM mutation, no storage access,
 * and no dependency on window.location.replace / React Router.
 *
 * WHAT WAS NOT PORTED AND WHY:
 *
 * From dom.js (375 lines):
 *   - qs / qsa / byId           → React uses JSX refs and state, not querySelector
 *   - show / hide / toggle       → React controls visibility via state/conditional JSX
 *   - addClass/removeClass       → React uses className expressions
 *   - setText / setAttr          → React renders via JSX props/children
 *   - createElement / clearChildren → React renders via JSX, not imperative DOM
 *   - startLoading / stopLoading → React button state handled via useState
 *   - getFormData                → React uses controlled inputs (useState)
 *   - showFormAlert / hideFormAlert → React renders error messages conditionally
 *   - showFieldError / clearFieldError → React renders field errors conditionally
 *   - focusEl / getFocusableElements → React uses ref.current.focus() where needed
 *   - once / delegate            → React uses synthetic event handlers on JSX
 *   - getParam                   → PORTED (pure URL read — no DOM mutation)
 *
 * From router.js (72 lines):
 *   - requireAuth / requireBusiness  → React Router <Navigate> / AuthContext guard
 *   - redirectIfAuthenticated        → AuthContext redirects in Phase 1.4
 *   - isAuthenticated / hasBusinessProfile / etc. → AuthContext state
 *   - getAccessToken / getRefreshToken / setTokens / clearTokens → auth module
 *   - redirectTo / navigateTo        → React Router useNavigate()
 *   - getCurrentPage                 → React Router useLocation() / useMatch()
 *   - buildUrl                       → PORTED (pure URL builder — no side effects)
 */

/**
 * Get a URL query parameter value from the current page URL.
 * Treated as untrusted input — never inject raw into DOM (Doc 3 §11.2 Rule 5).
 *
 * React usage: prefer useSearchParams() from React Router when available.
 * This helper is used during Phase 0 / Phase 1 before React Router is added,
 * and as a fallback anywhere React Router's hook is not accessible.
 *
 * Ported verbatim from dom.js getParam().
 *
 * @param {string} name
 * @returns {string|null}
 */
export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Build a URL with query parameters.
 * Returns the base path unchanged if params object is empty.
 *
 * Ported verbatim from router.js buildUrl().
 *
 * @param {string} base — path e.g. '/prices' or '/materials'
 * @param {Object} [params] — key/value pairs (null/undefined values are omitted)
 * @returns {string}
 *
 * @example
 * buildUrl('/prices', { materialId: 17 })  →  '/prices?materialId=17'
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

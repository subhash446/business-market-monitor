/**
 * Auth storage, JWT decoding, and token management
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/auth/auth.js (Vanilla JS v1.0)
 *
 * STORAGE CONTRACT (Doc 3 §4.1 — approved, frozen):
 *   localStorage:
 *     - bmm_access_token   ← JWT access token (persists across tabs + restarts)
 *     - bmm_refresh_token  ← JWT refresh token (persists across tabs + restarts)
 *   sessionStorage:
 *     - bmm_user      ← decoded user payload cache (tab-scoped)
 *     - bmm_business  ← business data cache (tab-scoped, managed by AuthContext)
 *
 * REACT MIGRATION NOTES:
 *   - Token read/write functions are used by both AuthContext and api/client.js.
 *   - Route guards (requireAuth, requireBusiness, redirectIfAuthenticated) are
 *     NOT ported — React Router <Navigate> in ProtectedRoute replaces them.
 *   - window.location.replace redirects are NOT ported — useNavigate() in
 *     AuthContext and ProtectedRoute replace them.
 *
 * SECURITY (Doc 3 §11):
 *   - Tokens stored in localStorage (approved for v1).
 *   - XSS risk mitigated by no-innerHTML rule (JSX only in React).
 *   - Tokens never logged or placed in URLs.
 *   - clearTokens() called on logout and session expiry.
 */

/* ----------------------------------------------------------------
 * STORAGE KEYS — must match api/client.js and the Vanilla JS original
 * ---------------------------------------------------------------- */

export const ACCESS_TOKEN_KEY  = 'bmm_access_token';
export const REFRESH_TOKEN_KEY = 'bmm_refresh_token';
const         USER_CACHE_KEY   = 'bmm_user';
const         BIZ_CACHE_KEY    = 'bmm_business';

/* ----------------------------------------------------------------
 * JWT DECODE (client-side, read-only — Doc 3 §4.2)
 * No signature verification — purely for reading the payload.
 * Access token payload: { sub, email, businessId, iat, exp }
 * ---------------------------------------------------------------- */

/**
 * Decode the payload section of a JWT without verifying the signature.
 * Returns null on any parse error.
 * @param {string} token
 * @returns {{ sub: number, email: string, businessId: number|null, iat: number, exp: number }|null}
 */
export function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → Base64 → atob
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded  = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json    = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------
 * TOKEN READ/WRITE
 * ---------------------------------------------------------------- */

/**
 * Get the stored access token (or null if absent).
 * @returns {string|null}
 */
export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Get the stored refresh token (or null if absent).
 * @returns {string|null}
 */
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Store both tokens and decode/cache the user payload to sessionStorage.
 * Called on login, register (auto-login), and successful token refresh.
 *
 * @param {string} accessToken
 * @param {string} [refreshToken]
 * @returns {{ userId: number, email: string, businessId: number|null }|null}
 *   The decoded user object (callers may update React state from it).
 */
export function setTokens(accessToken, refreshToken) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  // Decode and cache user payload (Doc 3 §4.2)
  const payload = decodeJwtPayload(accessToken);
  if (payload) {
    const user = {
      userId:     payload.sub,
      email:      payload.email,
      businessId: payload.businessId ?? null,
    };
    try {
      sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } catch {
      // Non-fatal if sessionStorage is unavailable
    }
    return user;
  }
  return null;
}

/**
 * Remove all auth data from localStorage and sessionStorage.
 * Called on logout and on session expiry (Doc 3 §4.8, §4.5).
 */
export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  try {
    sessionStorage.removeItem(USER_CACHE_KEY);
    sessionStorage.removeItem(BIZ_CACHE_KEY);
  } catch {
    // Non-fatal
  }
}

/* ----------------------------------------------------------------
 * USER CACHE (sessionStorage — tab-scoped)
 * ---------------------------------------------------------------- */

/**
 * Return the decoded current user from sessionStorage cache,
 * or re-decode from the stored access token if cache is absent
 * (e.g. new tab, cleared sessionStorage — Doc 3 §4.2).
 *
 * @returns {{ userId: number, email: string, businessId: number|null }|null}
 */
export function getCurrentUser() {
  // Try sessionStorage cache first
  try {
    const cached = sessionStorage.getItem(USER_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {
    // fall through to token decode
  }
  // Re-decode from stored access token (handles new-tab scenario)
  const token = getAccessToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const user = {
    userId:     payload.sub,
    email:      payload.email,
    businessId: payload.businessId ?? null,
  };
  try {
    sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // sessionStorage unavailable — still return user
  }
  return user;
}

/* ----------------------------------------------------------------
 * BUSINESS CACHE (sessionStorage — tab-scoped)
 * ---------------------------------------------------------------- */

/**
 * Get cached business data from sessionStorage.
 * Returns null if no cache exists.
 * @returns {Object|null}
 */
export function getCachedBusiness() {
  try {
    const raw = sessionStorage.getItem(BIZ_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persist business data to sessionStorage cache.
 * Called after GET /business or successful POST /business + refresh.
 * @param {Object} business
 */
export function setCachedBusiness(business) {
  try {
    sessionStorage.setItem(BIZ_CACHE_KEY, JSON.stringify(business));
  } catch {
    // Non-fatal
  }
}

/**
 * Clear only the business cache (e.g. after PUT /business succeeds).
 */
export function clearBusinessCache() {
  try {
    sessionStorage.removeItem(BIZ_CACHE_KEY);
  } catch {
    // Non-fatal
  }
}

/* ----------------------------------------------------------------
 * AUTH STATE HELPERS
 * ---------------------------------------------------------------- */

/**
 * True if an access token is present in localStorage.
 * Does NOT verify the token is still valid server-side —
 * the refresh flow in api/client.js handles actual expiry.
 * @returns {boolean}
 */
export function isAuthenticated() {
  return Boolean(getAccessToken());
}

/**
 * Get the businessId from the current user (may be null).
 * @returns {number|null}
 */
export function getBusinessId() {
  return getCurrentUser()?.businessId ?? null;
}

/**
 * True if the current user has a business profile (businessId !== null).
 * @returns {boolean}
 */
export function hasBusinessProfile() {
  return getBusinessId() !== null;
}

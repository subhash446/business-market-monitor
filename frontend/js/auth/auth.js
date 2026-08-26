/**
 * Token storage, JWT decoding, auth state, refresh flow guards
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §4 — js/auth/auth.js
 *
 * SECURITY NOTE (Doc 3 §11):
 *  - Tokens stored in localStorage (approved for v1 — Doc 3 §4.1).
 *  - XSS risk mitigated by strict no-innerHTML rule in all other files.
 *  - Tokens never logged or placed in URLs.
 *  - clearTokens() called on logout and on session expiry.
 */

/* ----------------------------------------------------------------
 * STORAGE KEYS (Doc 3 §4.1)
 * ---------------------------------------------------------------- */

const ACCESS_TOKEN_KEY  = 'bmm_access_token';
const REFRESH_TOKEN_KEY = 'bmm_refresh_token';

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
function decodeJwtPayload(token) {
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

/**
 * Check if an access-token payload is still valid (not expired).
 * Adds a 30-second leeway for clock skew.
 * @param {Object} payload
 * @returns {boolean}
 */
function isTokenPayloadValid(payload) {
  if (!payload || !payload.exp) return false;
  return Date.now() < (payload.exp - 30) * 1000;
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
 * @param {string} refreshToken
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
    sessionStorage.setItem('bmm_user', JSON.stringify(user));
  }
}

/**
 * Remove all auth data from localStorage and sessionStorage.
 * Called on logout and on session expiry (Doc 3 §4.8, §4.5).
 */
export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem('bmm_user');
  sessionStorage.removeItem('bmm_business');
}

/* ----------------------------------------------------------------
 * CURRENT USER
 * ---------------------------------------------------------------- */

/**
 * Return the decoded current user from sessionStorage cache,
 * or re-decode from the stored access token if cache is absent
 * (e.g. new tab, cleared sessionStorage — Doc 3 §4.2).
 *
 * @returns {{ userId: number, email: string, businessId: number|null }|null}
 */
export function getCurrentUser() {
  // Try session cache first
  try {
    const cached = sessionStorage.getItem('bmm_user');
    if (cached) return JSON.parse(cached);
  } catch {
    // fall through
  }

  // Re-decode from stored token
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
    sessionStorage.setItem('bmm_user', JSON.stringify(user));
  } catch {
    // sessionStorage unavailable — still return the user
  }

  return user;
}

/* ----------------------------------------------------------------
 * AUTH STATE CHECKS (Doc 3 §4.3)
 * ---------------------------------------------------------------- */

/**
 * True if an access token is present in localStorage.
 * Does NOT verify the token is still valid on the server —
 * the refresh flow in client.js handles actual expiry.
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

/**
 * Get the current user's email.
 * @returns {string|null}
 */
export function getUserEmail() {
  return getCurrentUser()?.email ?? null;
}

/* ----------------------------------------------------------------
 * ROUTE GUARDS — called at the top of every page JS (Doc 3 §4.4)
 * These run synchronously before any API call.
 * ---------------------------------------------------------------- */

/**
 * Redirect to login if the user is not authenticated.
 * Call as the first line of every protected page JS module.
 */
export function requireAuth() {
  if (!isAuthenticated()) {
    window.location.replace('/pages/login.html');
  }
}

/**
 * Redirect to onboarding if the user has no business profile.
 * Call after requireAuth() on all authenticated pages except onboarding.
 */
export function requireBusiness() {
  if (!hasBusinessProfile()) {
    window.location.replace('/pages/onboarding.html');
  }
}

/**
 * Redirect authenticated users away from public pages.
 * Call on login, register, forgot-password, reset-password pages.
 * Doc 3 §4.4.
 */
export function redirectIfAuthenticated() {
  if (isAuthenticated()) {
    if (hasBusinessProfile()) {
      window.location.replace('/pages/dashboard.html');
    } else {
      window.location.replace('/pages/onboarding.html');
    }
  }
}

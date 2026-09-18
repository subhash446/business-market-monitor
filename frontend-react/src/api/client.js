/**
 * Core API fetch wrapper — central HTTP client
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/client.js (Vanilla JS v1.0)
 *
 * - All API calls go through apiRequest().
 * - Handles: auth header injection, response-envelope unwrapping,
 *   401 → token refresh → single retry, structured ApiError.
 * - Uses relative paths (/api/v1/...) which are forwarded to the
 *   Express backend by the Vite dev proxy (vite.config.js).
 *   In production the React build is served by the same Express
 *   server, so paths remain same-origin with no CORS (Doc 3 §1.5).
 * - 30-second request timeout (Doc 3 §14.5).
 *
 * REACT-SPECIFIC ADAPTATION — navigation on session expiry:
 *   The original client called window.location.replace() directly
 *   when a token refresh failed. React Router is not available in
 *   this module (to avoid circular dependencies with AuthContext).
 *   Instead, a lightweight callback registry is provided:
 *
 *     setSessionExpiredHandler(fn)  — called once from AuthContext
 *                                     after React Router is ready
 *
 *   If no handler is registered the client falls back to
 *   window.location.replace() so it remains safe during the phases
 *   before AuthContext exists.
 *
 * STORAGE CONTRACT (faithful port of auth.js):
 *   Tokens        → localStorage   ('bmm_access_token', 'bmm_refresh_token')
 *   User payload  → sessionStorage ('bmm_user')         ← tab-scoped cache
 *   Business data → sessionStorage ('bmm_business')      ← tab-scoped cache
 *
 * CIRCULAR DEPENDENCY NOTE (same as original):
 *   The refresh flow calls POST /auth/refresh directly via fetch,
 *   not through this wrapper, to avoid a circular import chain.
 *
 * SECURITY RULES (Doc 3 §11, Migration Contract §8):
 *   - Never put userId or businessId in request bodies.
 *   - Never log token values.
 *   - Never introduce a second independent token store.
 */

/* ----------------------------------------------------------------
 * STORAGE KEYS — must match auth.js exactly
 * ---------------------------------------------------------------- */

const ACCESS_TOKEN_KEY  = 'bmm_access_token';
const REFRESH_TOKEN_KEY = 'bmm_refresh_token';
const USER_CACHE_KEY    = 'bmm_user';

/* ----------------------------------------------------------------
 * TOKEN HELPERS (inlined from auth.js to avoid circular dependency)
 * The full auth module is ported separately in Phase 1.4.
 * ---------------------------------------------------------------- */

/** @returns {string|null} */
function _getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** @returns {string|null} */
function _getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Store the new access token after a successful refresh.
 * Keeps the existing refresh token and updates the user cache.
 * @param {string} accessToken
 * @param {string} refreshToken
 */
function _storeNewTokens(accessToken, refreshToken) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
  // Update the sessionStorage user cache with the refreshed payload
  try {
    const parts  = accessToken.split('.');
    if (parts.length === 3) {
      const base64  = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded  = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payload = JSON.parse(atob(padded));
      const user    = {
        userId:     payload.sub,
        email:      payload.email,
        businessId: payload.businessId ?? null,
      };
      sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    }
  } catch {
    // Non-fatal — user cache will be rebuilt on next getCurrentUser() call
  }
}

/** Remove all auth data (tokens + caches). */
function _clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(USER_CACHE_KEY);
  sessionStorage.removeItem('bmm_business');
}

/* ----------------------------------------------------------------
 * SESSION-EXPIRED NAVIGATION CALLBACK
 * ---------------------------------------------------------------- */

/**
 * Optional callback invoked when a token refresh fails.
 * Set by AuthContext once React Router is available.
 * Falls back to window.location.replace() if never set.
 *
 * @type {(() => void) | null}
 */
let _sessionExpiredHandler = null;

/**
 * Register a callback to run when the session expires and cannot
 * be refreshed. Called once from AuthContext after Router is ready.
 *
 * @param {() => void} handler
 */
export function setSessionExpiredHandler(handler) {
  _sessionExpiredHandler = typeof handler === 'function' ? handler : null;
}

/* ----------------------------------------------------------------
 * API CONSTANTS
 * ---------------------------------------------------------------- */

/**
 * Resolves the base API URL without trailing slash issues.
 * Supports public VITE_API_BASE_URL for cross-origin deployments (e.g. Cloudflare Pages).
 * Defaults to relative /api/v1 for local Vite development and same-origin serving.
 *
 * @param {string} [rawUrl]
 * @returns {string}
 */
export function resolveApiBase(rawUrl) {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed) {
    return '/api/v1';
  }
  const cleanUrl = trimmed.replace(/\/+$/, '');
  if (cleanUrl.endsWith('/api/v1')) {
    return cleanUrl;
  }
  return `${cleanUrl}/api/v1`;
}

/** Base path for all API calls. */
export const API_BASE = resolveApiBase(import.meta.env?.VITE_API_BASE_URL);

const REFRESH_URL = `${API_BASE}/auth/refresh`;

/** Request timeout in milliseconds (Doc 3 §14.5). */
const REQUEST_TIMEOUT_MS = 30_000;

/* ----------------------------------------------------------------
 * ApiError — structured error thrown by all API failures
 * ---------------------------------------------------------------- */

/**
 * Thrown by apiRequest on any non-success outcome.
 *
 * @property {string}     code    — backend error code (e.g. 'VALIDATION_ERROR')
 * @property {number}     status  — HTTP status (0 for network errors)
 * @property {Array|null} details — validation detail array (400 responses only)
 */
export class ApiError extends Error {
  /**
   * @param {string}      message
   * @param {string}      code
   * @param {number}      status
   * @param {Array|null}  [details]
   */
  constructor(message, code, status, details = null) {
    super(message);
    this.name    = 'ApiError';
    this.code    = code;
    this.status  = status;
    this.details = details;
  }
}

/* ----------------------------------------------------------------
 * INTERNAL: silent token refresh (called on 401)
 * ---------------------------------------------------------------- */

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns the new access token on success, null on failure.
 *
 * Direct fetch (not through apiRequest) to avoid circular dependency.
 *
 * @returns {Promise<string|null>}
 */
async function attemptTokenRefresh() {
  const refreshToken = _getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(REFRESH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    if (json.success && json.data?.accessToken) {
      // Store new access token; preserve existing refresh token
      _storeNewTokens(json.data.accessToken, refreshToken);
      return json.data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------
 * apiRequest — the single fetch wrapper used by all API modules
 * ---------------------------------------------------------------- */

/**
 * Perform an authenticated API request.
 *
 * @param {string}  method            — 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
 * @param {string}  path              — endpoint path, e.g. '/business'
 * @param {*}       [body]            — request body (serialised to JSON for non-GET)
 * @param {Object}  [options]
 * @param {boolean} [options.skipAuth=false]  — skip Authorization header (public endpoints)
 * @param {boolean} [options._isRetry=false]  — internal flag, prevents infinite refresh loop
 *
 * @returns {Promise<{ data: *, meta: Object|null }>}
 * @throws  {ApiError}
 */
export async function apiRequest(method, path, body = null, options = {}) {
  const { skipAuth = false, _isRetry = false } = options;

  // Build headers
  const headers = {};

  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = _getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Build fetch options
  const fetchOptions = { method, headers };
  if (body !== null && body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  // Abort controller for timeout
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  fetchOptions.signal = controller.signal;

  // Execute request
  let response;
  try {
    response = await fetch(API_BASE + path, fetchOptions);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new ApiError(
        'Request timed out. Please try again.',
        'NETWORK_ERROR',
        0
      );
    }
    throw new ApiError(
      'Could not connect to the server. Check your internet connection.',
      'NETWORK_ERROR',
      0
    );
  }
  clearTimeout(timeoutId);

  // ---- 401 handling: attempt token refresh then retry once (Doc 3 §4.5) ----
  if (response.status === 401 && !_isRetry && !skipAuth) {
    const newToken = await attemptTokenRefresh();

    if (newToken) {
      // Retry the original request with the fresh token
      return apiRequest(method, path, body, { ...options, _isRetry: true });
    }

    // Refresh failed — clear session and navigate to login
    _clearTokens();

    if (_sessionExpiredHandler) {
      // React Router navigation (registered by AuthContext in Phase 1.4)
      _sessionExpiredHandler();
    } else {
      // Fallback: direct navigation (safe before AuthContext exists)
      window.location.replace('/login?reason=session_expired');
    }

    // Throw so callers' awaits reject rather than hanging
    throw new ApiError('Session expired. Please sign in again.', 'AUTHENTICATION_ERROR', 401);
  }

  // ---- Parse response body ----
  let json;
  try {
    // 204 No Content has no body
    if (response.status === 204) {
      return { data: null, meta: null };
    }
    json = await response.json();
  } catch {
    if (response.ok) {
      return { data: null, meta: null };
    }
    throw new ApiError(
      'Unexpected server response.',
      'INTERNAL_ERROR',
      response.status
    );
  }

  // ---- Success envelope (Doc 3 §3.2, { success, data, meta }) ----
  if (json.success === true) {
    return { data: json.data ?? null, meta: json.meta ?? null };
  }

  // ---- Error envelope (Doc 3 §3.4) ----
  const errObj  = json.error   ?? {};
  const code    = errObj.code    || 'UNKNOWN_ERROR';
  const message = errObj.message || 'An unexpected error occurred.';
  const details = errObj.details || null;

  // Never expose raw server internals for 5xx (Doc 3 §3.4)
  if (response.status >= 500) {
    throw new ApiError(
      'Something went wrong. Please try again.',
      'INTERNAL_ERROR',
      response.status,
      null // details suppressed for 5xx
    );
  }

  throw new ApiError(message, code, response.status, details);
}

/* ----------------------------------------------------------------
 * Typed convenience wrappers — identical signatures to original
 * ---------------------------------------------------------------- */

/**
 * GET request.
 * @param {string} path
 * @param {Record<string, string|number>} [params] — query string params
 * @param {Object} [options]
 */
export function get(path, params = {}, options = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) qs.set(k, String(v));
  }
  const queryStr = qs.toString();
  const fullPath = queryStr ? `${path}?${queryStr}` : path;
  return apiRequest('GET', fullPath, null, options);
}

/**
 * POST request.
 * @param {string} path
 * @param {*} body
 * @param {Object} [options]
 */
export function post(path, body, options = {}) {
  return apiRequest('POST', path, body, options);
}

/**
 * PUT request.
 * @param {string} path
 * @param {*} body
 * @param {Object} [options]
 */
export function put(path, body, options = {}) {
  return apiRequest('PUT', path, body, options);
}

/**
 * PATCH request.
 * @param {string} path
 * @param {*} body
 * @param {Object} [options]
 */
export function patch(path, body, options = {}) {
  return apiRequest('PATCH', path, body, options);
}

/**
 * DELETE request.
 * @param {string} path
 * @param {Object} [options]
 */
export function del(path, options = {}) {
  return apiRequest('DELETE', path, null, options);
}

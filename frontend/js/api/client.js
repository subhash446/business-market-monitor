/**
 * Core API fetch wrapper — central HTTP client
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §3 — js/api/client.js
 *
 * - All API calls go through apiRequest().
 * - Handles: auth header injection, response-envelope unwrapping,
 *   401 → token refresh → single retry, structured ApiError.
 * - Uses relative paths (/api/v1/...) — same-origin, no CORS (Doc 3 §1.5).
 * - 30-second request timeout (Doc 3 §14.5).
 *
 * CIRCULAR DEPENDENCY NOTE:
 *  The refresh flow calls POST /auth/refresh directly via fetch (not
 *  through this wrapper) to avoid a circular dependency with auth.api.js.
 */

import * as auth from '../auth/auth.js';

/** @type {string} Base path for all API calls — relative, no hardcoded domain */
export const API_BASE = '/api/v1';

const REFRESH_URL = `${API_BASE}/auth/refresh`;

/** Request timeout in milliseconds (Doc 3 §14.5) */
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
 * @returns {Promise<string|null>}
 */
async function attemptTokenRefresh() {
  const refreshToken = auth.getRefreshToken();
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
      // Store new access token; keep existing refresh token
      auth.setTokens(json.data.accessToken, refreshToken);
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
    const token = auth.getAccessToken();
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

    // Refresh failed — clear session and redirect to login
    auth.clearTokens();
    window.location.replace('/pages/login.html?reason=session_expired');
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

  // ---- Success envelope (Doc 3 §3.2, response.js: { success, data, meta }) ----
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
      null // details suppressed for 500
    );
  }

  throw new ApiError(message, code, response.status, details);
}

/* ----------------------------------------------------------------
 * Typed convenience wrappers
 * ---------------------------------------------------------------- */

/**
 * GET request.
 * @param {string} path
 * @param {Record<string,string|number>} [params] — query string params
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

/**
 * Login page — API module
 * Business Market Monitor — Frontend v1.0
 *
 * Thin wrapper around client.js for auth-specific calls.
 * Only methods needed by login.js and register.js are defined here.
 * Doc 3 §3 — no feature-specific logic; envelope unwrapping done in client.js.
 */

import { post } from '../api/client.js';

/**
 * Authenticate an existing user.
 *
 * POST /api/v1/auth/login
 * Body:  { email, password }
 * Response data: { accessToken, refreshToken, expiresIn }
 *
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 * @throws {ApiError}
 */
export async function loginUser(credentials) {
  const { data } = await post('/auth/login', credentials, { skipAuth: true });
  return data;
}

/**
 * Register a new user account.
 *
 * POST /api/v1/auth/register
 * Body:  { email, password, fullName }
 * Response data: { id, email, fullName }   ← 201, NO tokens
 *
 * @param {{ email: string, password: string, fullName: string }} fields
 * @returns {Promise<{ id: number, email: string, fullName: string }>}
 * @throws {ApiError}
 */
export async function registerUser(fields) {
  const { data } = await post('/auth/register', fields, { skipAuth: true });
  return data;
}

/**
 * Request a password reset link.
 *
 * POST /api/v1/auth/password-reset/request
 * Body:  { email }
 * Response: always 200 with generic message — no email enumeration (backend design).
 * Frontend must show the same success message regardless of 200 or error status.
 *
 * @param {string} email
 * @returns {Promise<void>}
 * @throws {ApiError} — only thrown for 400 (validation) or 429 (rate-limit)
 */
export async function requestPasswordReset(email) {
  await post('/auth/password-reset/request', { email }, { skipAuth: true });
}

/**
 * Confirm a password reset using the token from the email link.
 *
 * POST /api/v1/auth/password-reset/confirm
 * Body:  { token, newPassword }
 * Response data: { message: 'Password updated' }
 *
 * @param {string} token       — raw token from URL query string (?token=...)
 * @param {string} newPassword — new password chosen by user
 * @returns {Promise<void>}
 * @throws {ApiError} — 401 for invalid/expired/consumed token, 400 for validation
 */
export async function confirmPasswordReset(token, newPassword) {
  await post('/auth/password-reset/confirm', { token, newPassword }, { skipAuth: true });
}

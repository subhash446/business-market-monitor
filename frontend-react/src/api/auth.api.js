/**
 * Auth API module
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/auth.api.js (Vanilla JS v1.0)
 * Change: import path updated — client.js is now in the same directory.
 *
 * Thin wrapper around client.js for auth-specific calls.
 * Only the methods needed by auth pages are defined here.
 * Doc 3 §3 — no feature-specific logic; envelope unwrapping done in client.js.
 */

import { get, post } from './client.js';

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

/**
 * Fetch public auth provider configuration (Google client ID, OTP status).
 *
 * GET /api/v1/auth/config
 * @returns {Promise<{ googleEnabled: boolean, googleClientId: string|null, emailOtpEnabled: boolean }>}
 */
export async function getAuthConfig() {
  const { data } = await get('/auth/config', {}, { skipAuth: true });
  return data;
}

/**
 * Sign in or auto-register with Google Identity Services ID token.
 *
 * POST /api/v1/auth/google
 * @param {{ credential: string }} payload
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
export async function loginWithGoogle({ credential }) {
  const { data } = await post('/auth/google', { credential }, { skipAuth: true });
  return data;
}

/**
 * Request a 6-digit email OTP for login or email verification.
 *
 * POST /api/v1/auth/email-otp/request
 * @param {{ email: string, name?: string, purpose?: 'LOGIN_OTP'|'VERIFY_EMAIL' }} payload
 * @returns {Promise<{ sent: boolean, expiresInSeconds: number, cooldownSeconds: number, maskedEmail: string }>}
 */
export async function requestEmailOtp({ email, name, purpose = 'LOGIN_OTP' }) {
  const { data } = await post('/auth/email-otp/request', { email, name, purpose }, { skipAuth: true });
  return data;
}

/**
 * Verify 6-digit email OTP code and sign in (or activate email).
 *
 * POST /api/v1/auth/email-otp/verify
 * @param {{ email: string, otp: string, name?: string, purpose?: 'LOGIN_OTP'|'VERIFY_EMAIL' }} payload
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
export async function verifyEmailOtp({ email, otp, name, purpose = 'LOGIN_OTP' }) {
  const { data } = await post('/auth/email-otp/verify', { email, otp, name, purpose }, { skipAuth: true });
  return data;
}

/**
 * Complete 2-step registration by verifying 6-digit email OTP and setting password.
 *
 * POST /api/v1/auth/register/verify-otp
 * @param {{ name: string, email: string, otp: string, password: string }} payload
 * @returns {Promise<{ accessToken: string, refreshToken: string, expiresIn: number }>}
 */
export async function registerWithVerifiedOtp({ name, email, otp, password }) {
  const { data } = await post('/auth/register/verify-otp', { name, email, otp, password }, { skipAuth: true });
  return data;
}

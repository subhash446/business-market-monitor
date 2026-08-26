/**
 * Authentication module (Document 2 §5.1, Document 5 §4.1).
 *
 * register, login, refresh, logout: implemented (Phase 2).
 * Password Reset / Email Verification: explicitly out of scope for Phase 2,
 * left as 501 stubs from Phase 1 — untouched.
 */
const authService = require('../services/auth.service');
const { sendSuccess } = require('../utils/response');
const notImplemented = require('../utils/notImplemented');

// POST /api/v1/auth/register — FR-AUTH-01, 02, 03
async function register(req, res, next) {
  try {
    const { email, password, fullName } = req.body;
    const user = await authService.registerUser({ email, password, fullName });
    sendSuccess(res, user, undefined, 201);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login — FR-AUTH-04, 05
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const tokens = await authService.authenticate({ email, password });
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/refresh — Document 5 §2.1, §2.2
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshAccessToken(refreshToken);
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout — FR-AUTH-06 (client-side semantics only,
// Document 5 §2.2 — stateless refresh token, nothing to invalidate server-side).
function logout(req, res) {
  sendSuccess(res, { message: 'Logged out' });
}

// POST /api/v1/auth/password-reset/request — FR-AUTH-07
async function requestPasswordReset(req, res, next) {
  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email);
    // Document 5 §4.1: identical response regardless of whether the email
    // is registered — prevents email enumeration.
    sendSuccess(res, { message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/password-reset/confirm — FR-AUTH-07
async function confirmPasswordReset(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    await authService.confirmPasswordReset(token, newPassword);
    sendSuccess(res, { message: 'Password updated' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  requestPasswordReset,
  confirmPasswordReset,
  // Out of scope (FR-AUTH-08 is optional/non-blocking, not requested here) — untouched:
  requestEmailVerification: notImplemented,
  confirmEmailVerification: notImplemented,
};

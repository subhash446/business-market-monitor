/**
 * Authentication module (Document 2 §5.1, Document 5 §4.1).
 *
 * register, login, refresh, logout: implemented (Phase 2).
 * Password Reset / Email Verification: explicitly out of scope for Phase 2,
 * left as 501 stubs from Phase 1 — untouched.
 */
const authService = require('../services/auth.service');
const userRepository = require('../repositories/user.repository');
const businessRepository = require('../repositories/business.repository');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/response');
const notImplemented = require('../utils/notImplemented');
const env = require('../config/env');

// GET /api/v1/auth/me — V3-M5
async function getMe(req, res, next) {
  try {
    const { userId } = req.auth;
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }
    const business = await businessRepository.findByUserId(userId);
    sendSuccess(res, {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      businessId: business ? business.id : null,
      businessRole: business ? (business.businessRole || business.business_role || 'OWNER') : null,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/register — FR-AUTH-01, 02, 03
async function register(req, res, next) {
  try {
    const { email, password, fullName, sendVerificationOtp } = req.body;
    const user = await authService.registerUser({ email, password, fullName, sendVerificationOtp });
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

// GET /api/v1/auth/config — Migration 036
function getConfig(req, res) {
  const googleClientId = env.google?.clientId || null;
  sendSuccess(res, {
    googleEnabled: Boolean(googleClientId),
    googleClientId,
    emailOtpEnabled: true,
  });
}

// POST /api/v1/auth/google — Migration 036
async function googleLogin(req, res, next) {
  try {
    const { credential } = req.body;
    if (!credential) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Google credential is required');
    }
    const tokens = await authService.authenticateWithGoogle({ credential });
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/email-otp/request — Migration 036
async function requestEmailOtp(req, res, next) {
  try {
    const { email, name, purpose } = req.body;
    const result = await authService.requestEmailOtp({ email, name, purpose });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/email-otp/verify — Migration 036
async function verifyEmailOtp(req, res, next) {
  try {
    const { email, otp, name, purpose } = req.body;
    let tokens;
    if (purpose === 'VERIFY_EMAIL') {
      tokens = await authService.verifyEmailAndActivate({ email, otp });
    } else {
      tokens = await authService.verifyEmailOtpAndAuthenticate({ email, otp, name });
    }
    sendSuccess(res, tokens);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/register/verify-otp — Atomic 2-step OTP-verified registration
async function registerVerifyOtp(req, res, next) {
  try {
    const { name, fullName, email, otp, password } = req.body;
    const tokens = await authService.registerWithVerifiedOtp({
      name: name ?? fullName,
      email,
      otp,
      password,
    });
    sendSuccess(res, tokens, undefined, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  register,
  login,
  refresh,
  logout,
  requestPasswordReset,
  confirmPasswordReset,
  getConfig,
  googleLogin,
  requestEmailOtp,
  verifyEmailOtp,
  registerVerifyOtp,
  // Out of scope (FR-AUTH-08 is optional/non-blocking, not requested here) — untouched:
  requestEmailVerification: notImplemented,
  confirmEmailVerification: notImplemented,
};

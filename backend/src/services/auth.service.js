/**
 * Authentication business logic (Document 2 §5.1 FR-AUTH-01–06, Document 3 §5
 * AuthService). Framework-agnostic — no req/res, no SQL (Document 3 §3).
 *
 * Password Reset (FR-AUTH-07) and Email Verification (FR-AUTH-08) are
 * explicitly out of scope for Phase 2 and are not implemented here.
 */
const userRepository = require('../repositories/user.repository');
const businessRepository = require('../repositories/business.repository');
const userTokenRepository = require('../repositories/userToken.repository');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateResetToken, hashResetToken } = require('../utils/resetToken');
const { signAccessToken, signRefreshToken, verifyRefreshToken, expiryToSeconds } = require('../utils/jwt');
const jwtConfig = require('../config/jwt.config');
const env = require('../config/env');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

// Production Hardening Phase B, finding H-3: looks up the user's business
// once, at token-issuance time (login/refresh), instead of leaving
// businessId permanently null and forcing every controller to look it up
// on every single request (utils/resolveBusinessId.js). Returns null if
// the user has no business yet — identical to the value that was always
// hardcoded here before, so a user without a business sees no behavior
// change at all.
async function getBusinessIdForUser(userId) {
  const business = await businessRepository.findByUserId(userId);
  return business ? business.id : null;
}

async function registerUser({ email, password, fullName }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError(409, 'CONFLICT', 'Email already registered');
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await userRepository.create({ email, passwordHash, fullName });
  } catch (err) {
    // DB-level safety net behind the application-level check above
    // (Document 4 §5.1 UNIQUE KEY uq_users_email) — closes the race-condition gap.
    if (err.code === 'ER_DUP_ENTRY') {
      throw new AppError(409, 'CONFLICT', 'Email already registered');
    }
    throw err;
  }

  return toPublicUser(user);
}

async function authenticate({ email, password }) {
  const user = await userRepository.findByEmail(email);

  // FR-AUTH-05: identical error for "no such user" and "wrong password" —
  // never reveals which one was true.
  if (!user) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid email or password');
  }

  const passwordMatches = await comparePassword(password, user.password_hash);
  if (!passwordMatches) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid email or password');
  }

  return issueTokens(user);
}

async function refreshAccessToken(refreshToken) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid or expired refresh token');
  }

  const user = await userRepository.findById(payload.sub);
  if (!user) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid or expired refresh token');
  }

  const businessId = await getBusinessIdForUser(user.id);
  const accessToken = signAccessToken({ id: user.id, email: user.email, businessId });
  return { accessToken, expiresIn: expiryToSeconds(jwtConfig.accessExpiry) };
}

async function issueTokens(user) {
  const businessId = await getBusinessIdForUser(user.id);
  const accessToken = signAccessToken({ id: user.id, email: user.email, businessId });
  const refreshToken = signRefreshToken({ id: user.id });
  return { accessToken, refreshToken, expiresIn: expiryToSeconds(jwtConfig.accessExpiry) };
}

function toPublicUser(user) {
  return { id: user.id, email: user.email, fullName: user.full_name };
}

// FR-AUTH-07. Document 5 §4.1: always succeeds regardless of whether the
// email exists — identical email-enumeration protection to FR-AUTH-05's
// login error handling elsewhere in this file. The controller sends the
// same generic message either way; this function simply returns without
// creating a token when there's no matching account.
async function requestPasswordReset(email) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    return;
  }

  // A new reset request invalidates any still-active ones — only the
  // newest link should ever work (Document 4 §5.1's consumed_at is the
  // only invalidation mechanism this schema has; reused here rather than
  // adding a new state).
  await userTokenRepository.invalidateActiveTokensForUser(user.id, 'PASSWORD_RESET');

  const rawToken = generateResetToken();
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + env.passwordReset.tokenExpiryMinutes * 60 * 1000);

  await userTokenRepository.create({
    userId: user.id,
    tokenType: 'PASSWORD_RESET',
    tokenHash,
    expiresAt,
  });

  // Nodemailer/email delivery has never been implemented in this project
  // (explicitly deferred since Phase 9 — Document 3 §10's channel-agnostic
  // NotificationService doesn't exist yet either). Logging the raw token
  // is a development-only stand-in for the real email send this endpoint
  // is documented to perform (Document 5 §4.1) — it is never returned in
  // the API response, only written to the server-side log.
  logger.info(`[auth] Password reset requested for user ${user.id} — DEV-ONLY, no email service configured: raw token = ${rawToken}`);
}

// FR-AUTH-07. Document 5 §4.1: 401 AUTHENTICATION_ERROR for any invalid,
// expired, or already-consumed token — userTokenRepository.findValidByHash
// already enforces both the expiry and single-use conditions at the query
// level, so a null result here covers all three cases identically, without
// this function needing to distinguish which one occurred (consistent
// with FR-AUTH-05's "don't reveal which part was wrong" pattern).
async function confirmPasswordReset(rawToken, newPassword) {
  const tokenHash = hashResetToken(rawToken);
  const tokenRow = await userTokenRepository.findValidByHash(tokenHash, 'PASSWORD_RESET');

  if (!tokenRow) {
    throw new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid or expired token');
  }

  const passwordHash = await hashPassword(newPassword);
  await userRepository.updatePassword(tokenRow.user_id, passwordHash);
  await userTokenRepository.markConsumed(tokenRow.id);
}

module.exports = { registerUser, authenticate, refreshAccessToken, requestPasswordReset, confirmPasswordReset };

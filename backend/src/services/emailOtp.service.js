'use strict';

/**
 * emailOtp.service.js — 6-Digit Email OTP generation, cooldown enforcement & verification.
 */
const crypto = require('crypto');
const emailOtpRepository = require('../repositories/emailOtp.repository');
const mailer = require('../email/mailer');
const { buildEmailOtpEmail } = require('../email/templates/emailOtp.template');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const COOLDOWN_SECONDS = 45;
const EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function hashOtp(email, otp) {
  return crypto
    .createHash('sha256')
    .update(`${email.toLowerCase().trim()}:${String(otp).trim()}`)
    .digest('hex');
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const [user, domain] = email.split('@');
  if (!domain) return email;
  if (user.length <= 2) {
    return `${user[0]}***@${domain}`;
  }
  return `${user[0]}***${user.slice(-1)}@${domain}`;
}

/**
 * Requests a new 6-digit verification code. Enforces 45s cooldown.
 */
async function requestOtp({ email, name = '', purpose = 'LOGIN_OTP' }) {
  if (!email || typeof email !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid email address is required');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const validPurpose = purpose === 'VERIFY_EMAIL' ? 'VERIFY_EMAIL' : 'LOGIN_OTP';

  // Cooldown check (45 seconds)
  const latestOtp = await emailOtpRepository.getLatestOtp(normalizedEmail, validPurpose);
  if (latestOtp) {
    const elapsedMs = Date.now() - new Date(latestOtp.created_at).getTime();
    if (elapsedMs < COOLDOWN_SECONDS * 1000) {
      const remainingSeconds = Math.ceil((COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
      throw new AppError(
        429,
        'OTP_COOLDOWN',
        `Please wait ${remainingSeconds}s before requesting a new code`
      );
    }
  }

  // Generate cryptographically secure 6-digit numeric OTP
  const rawOtp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(normalizedEmail, rawOtp);
  const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

  await emailOtpRepository.createOtp({
    email: normalizedEmail,
    purpose: validPurpose,
    otpHash,
    expiresAt,
  });

  // Never log raw OTP in production logs
  logger.info(`[emailOtp] Generated ${validPurpose} OTP for ${maskEmail(normalizedEmail)} (expires in ${EXPIRY_MINUTES}m)`);

  const { subject, html } = buildEmailOtpEmail({
    otp: rawOtp,
    purpose: validPurpose,
    expiryMinutes: EXPIRY_MINUTES,
  });

  try {
    await mailer.sendEmail({
      to: normalizedEmail,
      subject,
      html,
    });
  } catch (err) {
    logger.error(`[emailOtp] Delivery failed for ${maskEmail(normalizedEmail)}: ${err.message}`);
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to send verification email. Please try again.');
  }

  return {
    sent: true,
    expiresInSeconds: EXPIRY_MINUTES * 60,
    cooldownSeconds: COOLDOWN_SECONDS,
    maskedEmail: maskEmail(normalizedEmail),
  };
}

/**
 * Verifies a 6-digit OTP code. Enforces maximum 5 attempts and single consumption.
 */
async function verifyOtp({ email, otp, purpose = 'LOGIN_OTP' }) {
  if (!email || !otp) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Email and 6-digit OTP code are required');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const validPurpose = purpose === 'VERIFY_EMAIL' ? 'VERIFY_EMAIL' : 'LOGIN_OTP';

  const otpRow = await emailOtpRepository.getLatestActiveOtp(normalizedEmail, validPurpose);
  if (!otpRow) {
    throw new AppError(400, 'INVALID_OTP', 'Invalid or expired verification code');
  }

  if (otpRow.attempts >= MAX_ATTEMPTS) {
    throw new AppError(429, 'OTP_MAX_ATTEMPTS', 'Too many failed attempts. Please request a new code.');
  }

  const candidateHash = hashOtp(normalizedEmail, otp);
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(otpRow.otp_hash, 'hex');

  let matches = false;
  if (bufA.length === bufB.length) {
    matches = crypto.timingSafeEqual(bufA, bufB);
  }

  if (!matches) {
    await emailOtpRepository.incrementAttempts(otpRow.id);
    const remaining = Math.max(0, MAX_ATTEMPTS - (otpRow.attempts + 1));
    if (remaining === 0) {
      throw new AppError(429, 'OTP_MAX_ATTEMPTS', 'Too many failed attempts. Please request a new code.');
    }
    throw new AppError(400, 'INVALID_OTP', `Invalid code. ${remaining} attempts remaining.`);
  }

  // Mark consumed on successful verification
  await emailOtpRepository.markConsumed(otpRow.id);
  logger.info(`[emailOtp] Successfully verified ${validPurpose} OTP for ${maskEmail(normalizedEmail)}`);

  return {
    verified: true,
    email: normalizedEmail,
  };
}

module.exports = {
  requestOtp,
  verifyOtp,
  hashOtp,
  maskEmail,
};

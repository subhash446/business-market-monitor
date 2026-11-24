'use strict';

/**
 * Unit & Integration tests for Google OAuth 2.0 & 6-Digit Email OTP Verification (Migration 036).
 */

const crypto = require('crypto');

// Mocks
jest.mock('../src/database/connection', () => ({
  pool: {
    execute: jest.fn().mockResolvedValue([[]]),
    query: jest.fn().mockResolvedValue([[]]),
  },
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/email/mailer', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'resend_msg_test_123' }),
  verifyConnection: jest.fn().mockResolvedValue(true),
}));

const authService = require('../src/services/auth.service');
const googleAuthService = require('../src/services/googleAuth.service');
const emailOtpService = require('../src/services/emailOtp.service');
const userRepository = require('../src/repositories/user.repository');
const emailOtpRepository = require('../src/repositories/emailOtp.repository');
const businessRepository = require('../src/repositories/business.repository');
const mailer = require('../src/email/mailer');
const { buildEmailOtpEmail } = require('../src/email/templates/emailOtp.template');

describe('Google OAuth 2.0 & 6-Digit Email OTP Authentication (Migration 036)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    googleAuthService.setCustomVerifier(null);
  });

  // =========================================================================
  // 1. Template Verification
  // =========================================================================
  describe('1. Email OTP Template', () => {
    test('renders subject with OTP and Zinc-styled HTML', () => {
      const emailObj = buildEmailOtpEmail({ otp: '849201', purpose: 'LOGIN_OTP', expiryMinutes: 10 });
      expect(emailObj.subject).toBe('Your Business Market Monitor verification code: 849201');
      expect(emailObj.html).toContain('849201');
      expect(emailObj.html).toContain('Business Market Monitor');
      expect(emailObj.html).toContain('10 minutes');
    });

    test('renders verification copy when purpose is VERIFY_EMAIL', () => {
      const emailObj = buildEmailOtpEmail({ otp: '123456', purpose: 'VERIFY_EMAIL', expiryMinutes: 10 });
      expect(emailObj.html).toContain('Verify your email address');
    });
  });

  // =========================================================================
  // 2. Google OAuth ID Token Verification & User Resolution
  // =========================================================================
  describe('2. Google OAuth ID Token Flow', () => {
    test('auto-registers a new user when Google Sub does not exist', async () => {
      googleAuthService.setCustomVerifier(async (token) => {
        if (token === 'valid_google_jwt') {
          return {
            sub: 'google_user_998877',
            email: 'newuser@packaging.com',
            name: 'New Google User',
          };
        }
        throw new Error('Invalid token');
      });

      jest.spyOn(userRepository, 'findByGoogleSub').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(userRepository, 'create').mockResolvedValue({
        id: 42,
        email: 'newuser@packaging.com',
        full_name: 'New Google User',
        auth_provider: 'GOOGLE',
        google_sub: 'google_user_998877',
        email_verified: 1,
      });
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue(null);

      const tokens = await authService.authenticateWithGoogle({ credential: 'valid_google_jwt' });

      expect(userRepository.create).toHaveBeenCalledWith({
        email: 'newuser@packaging.com',
        passwordHash: null,
        fullName: 'New Google User',
        authProvider: 'GOOGLE',
        googleSub: 'google_user_998877',
        emailVerified: 1,
      });
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    test('links Google Sub to existing local user matching email', async () => {
      googleAuthService.setCustomVerifier(async () => ({
        sub: 'google_user_554433',
        email: 'existing@polymers.com',
        name: 'Existing User',
      }));

      const existingUser = {
        id: 15,
        email: 'existing@polymers.com',
        full_name: 'Existing User',
        google_sub: null,
        email_verified: 0,
      };

      jest.spyOn(userRepository, 'findByGoogleSub').mockResolvedValue(null);
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue(existingUser);
      jest.spyOn(userRepository, 'updateGoogleSub').mockResolvedValue({ ...existingUser, google_sub: 'google_user_554433' });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ ...existingUser, google_sub: 'google_user_554433' });
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue({ id: 8 });

      const tokens = await authService.authenticateWithGoogle({ credential: 'valid_google_jwt' });

      expect(userRepository.updateGoogleSub).toHaveBeenCalledWith(15, 'google_user_554433');
      expect(tokens.accessToken).toBeDefined();
    });

    test('cryptographic validator rejects malformed tokens without 3 parts', async () => {
      await expect(
        googleAuthService.verifyGoogleIdToken('malformed_token_string')
      ).rejects.toThrow('Malformed Google ID token');
    });
  });

  // =========================================================================
  // 3. 6-Digit Email OTP Request & Cooldown
  // =========================================================================
  describe('3. Email OTP Request Service', () => {
    test('generates OTP, hashes with SHA-256, and sends email via mailer', async () => {
      jest.spyOn(emailOtpRepository, 'getLatestOtp').mockResolvedValue(null);
      jest.spyOn(emailOtpRepository, 'createOtp').mockResolvedValue({ id: 101 });

      const res = await emailOtpService.requestOtp({
        email: 'procurement@factory.com',
        purpose: 'LOGIN_OTP',
      });

      expect(res.sent).toBe(true);
      expect(res.maskedEmail).toBe('p***t@factory.com');
      expect(emailOtpRepository.createOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'procurement@factory.com',
          purpose: 'LOGIN_OTP',
          otpHash: expect.any(String),
        })
      );
      expect(mailer.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'procurement@factory.com',
          subject: expect.stringContaining('Your Business Market Monitor verification code'),
        })
      );
    });

    test('enforces 45-second cooldown on consecutive requests', async () => {
      jest.spyOn(emailOtpRepository, 'getLatestOtp').mockResolvedValue({
        id: 102,
        created_at: new Date(Date.now() - 15000), // 15 seconds ago
      });

      await expect(
        emailOtpService.requestOtp({ email: 'sme@factory.com', purpose: 'LOGIN_OTP' })
      ).rejects.toThrow(/Please wait \d+s before requesting a new code/);
    });
  });

  // =========================================================================
  // 4. 6-Digit Email OTP Verification & Rate-Limiting
  // =========================================================================
  describe('4. Email OTP Verification & Attempts Counter', () => {
    const rawOtp = '654321';
    const email = 'owner@sme.com';
    const validHash = crypto.createHash('sha256').update(`${email}:${rawOtp}`).digest('hex');

    test('verifies matching OTP and signs in user', async () => {
      jest.spyOn(emailOtpRepository, 'getLatestActiveOtp').mockResolvedValue({
        id: 77,
        email,
        purpose: 'LOGIN_OTP',
        otp_hash: validHash,
        attempts: 0,
      });
      jest.spyOn(emailOtpRepository, 'markConsumed').mockResolvedValue();

      const user = { id: 9, email, full_name: 'SME Owner', email_verified: 1 };
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue(user);
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue({ id: 3 });

      const tokens = await authService.verifyEmailOtpAndAuthenticate({ email, otp: rawOtp });

      expect(emailOtpRepository.markConsumed).toHaveBeenCalledWith(77);
      expect(tokens.accessToken).toBeDefined();
    });

    test('increments attempts on mismatch and warns with remaining attempts', async () => {
      jest.spyOn(emailOtpRepository, 'getLatestActiveOtp').mockResolvedValue({
        id: 78,
        email,
        purpose: 'LOGIN_OTP',
        otp_hash: validHash,
        attempts: 1,
      });
      jest.spyOn(emailOtpRepository, 'incrementAttempts').mockResolvedValue();

      await expect(
        authService.verifyEmailOtpAndAuthenticate({ email, otp: '000000' })
      ).rejects.toThrow(/Invalid code\. 3 attempts remaining\./);

      expect(emailOtpRepository.incrementAttempts).toHaveBeenCalledWith(78);
    });

    test('locks out request when 5 attempts are exceeded (429 OTP_MAX_ATTEMPTS)', async () => {
      jest.spyOn(emailOtpRepository, 'getLatestActiveOtp').mockResolvedValue({
        id: 79,
        email,
        purpose: 'LOGIN_OTP',
        otp_hash: validHash,
        attempts: 5,
      });

      await expect(
        authService.verifyEmailOtpAndAuthenticate({ email, otp: rawOtp })
      ).rejects.toThrow('Too many failed attempts. Please request a new code.');
    });

    test('verifies email for registration and marks user verified', async () => {
      const verifyHash = crypto.createHash('sha256').update(`${email}:112233`).digest('hex');
      jest.spyOn(emailOtpRepository, 'getLatestActiveOtp').mockResolvedValue({
        id: 80,
        email,
        purpose: 'VERIFY_EMAIL',
        otp_hash: verifyHash,
        attempts: 0,
      });
      jest.spyOn(emailOtpRepository, 'markConsumed').mockResolvedValue();

      const unverifiedUser = { id: 11, email, full_name: 'Pending User', email_verified: 0 };
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue(unverifiedUser);
      jest.spyOn(userRepository, 'updateEmailVerified').mockResolvedValue({ ...unverifiedUser, email_verified: 1 });
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue(null);

      const tokens = await authService.verifyEmailAndActivate({ email, otp: '112233' });

      expect(userRepository.updateEmailVerified).toHaveBeenCalledWith(11, 1);
      expect(tokens.accessToken).toBeDefined();
    });
  });
});

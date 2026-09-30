/**
 * Password Reset Flow & Security Unit Tests (FR-AUTH-07, Document 5 §4.1)
 *
 * Verifies:
 * 1. requestPasswordReset dispatches email via Resend mailer
 * 2. Raw token and reset URL are never leaked in logs
 * 3. Mailer failure safely throws 500 INTERNAL_ERROR (no false success)
 * 4. Unregistered email resolves silently without enumeration leak
 * 5. Active tokens are invalidated on new request
 * 6. confirmPasswordReset updates password and consumes token
 * 7. Invalid/expired token rejects with 401 AUTHENTICATION_ERROR
 */

jest.mock('../src/database/connection', () => ({
  pool: {
    execute: jest.fn().mockResolvedValue([[]]),
    query:   jest.fn().mockResolvedValue([[]]),
  },
}));

jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/email/mailer', () => ({
  sendEmail: jest.fn(),
  verifyConnection: jest.fn().mockResolvedValue(true),
}));

const authService = require('../src/services/auth.service');
const userRepository = require('../src/repositories/user.repository');
const userTokenRepository = require('../src/repositories/userToken.repository');
const mailer = require('../src/email/mailer');
const logger = require('../src/utils/logger');
const env = require('../src/config/env');
const { buildPasswordResetEmail } = require('../src/email/templates/passwordReset.template');

describe('Password Reset Service & Email Dispatch (FR-AUTH-07)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('buildPasswordResetEmail template', () => {
    test('renders subject and html with reset link and expiry notice', () => {
      const resetUrl = 'https://app.example.com/reset-password?token=abc123xyz';
      const result = buildPasswordResetEmail({ resetUrl, expiryMinutes: 45 });

      expect(result.subject).toBe('Reset Your Password - Business Market Monitor');
      expect(result.html).toContain('href="https://app.example.com/reset-password?token=abc123xyz"');
      expect(result.html).toContain('45 minutes');
      expect(result.html).toContain('Reset Password');
      expect(result.html).toContain('safely ignore this email');
    });
  });

  describe('requestPasswordReset', () => {
    test('successfully generates token, invalidates prior tokens, and sends email', async () => {
      const mockUser = { id: 10, email: 'owner@bellecure.com' };
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'create').mockResolvedValue({ id: 1 });
      jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 'resend-msg-001' });

      await authService.requestPasswordReset('owner@bellecure.com');

      // 1. Prior active tokens must be invalidated
      expect(userTokenRepository.invalidateActiveTokensForUser).toHaveBeenCalledWith(10, 'PASSWORD_RESET');

      // 2. New token must be recorded in DB with hash and expiry
      expect(userTokenRepository.create).toHaveBeenCalledTimes(1);
      const tokenRecord = userTokenRepository.create.mock.calls[0][0];
      expect(tokenRecord.userId).toBe(10);
      expect(tokenRecord.tokenType).toBe('PASSWORD_RESET');
      expect(tokenRecord.tokenHash).toHaveLength(64); // SHA-256 hex length
      expect(tokenRecord.expiresAt).toBeInstanceOf(Date);

      // 3. Mailer must be called with recipient and HTML containing reset URL
      expect(mailer.sendEmail).toHaveBeenCalledTimes(1);
      const mailArgs = mailer.sendEmail.mock.calls[0][0];
      expect(mailArgs.to).toBe('owner@bellecure.com');
      expect(mailArgs.subject).toBe('Reset Your Password - Business Market Monitor');
      expect(mailArgs.html).toContain('/reset-password?token=');

      // 4. Logger must log user ID only, NEVER raw token or reset URL
      expect(logger.info).toHaveBeenCalledWith('[auth] Password reset email sent for user 10');
      const allLogs = [
        ...logger.info.mock.calls.map(c => c[0]),
        ...logger.warn.mock.calls.map(c => c[0]),
        ...logger.error.mock.calls.map(c => c[0]),
      ].join(' ');
      expect(allLogs).not.toContain('/reset-password?token=');
      expect(allLogs).not.toContain('raw token');
    });

    test('unregistered email resolves silently without calling mailer or creating token', async () => {
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'create').mockResolvedValue();

      await expect(
        authService.requestPasswordReset('unknown@example.com')
      ).resolves.toBeUndefined();

      expect(userTokenRepository.invalidateActiveTokensForUser).not.toHaveBeenCalled();
      expect(userTokenRepository.create).not.toHaveBeenCalled();
      expect(mailer.sendEmail).not.toHaveBeenCalled();
    });

    test('mailer delivery failure throws 500 INTERNAL_ERROR and logs error safely', async () => {
      const mockUser = { id: 10, email: 'owner@bellecure.com' };
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'create').mockResolvedValue({ id: 1 });
      jest.spyOn(mailer, 'sendEmail').mockRejectedValue(new Error('Resend rate limit exceeded'));

      await expect(
        authService.requestPasswordReset('owner@bellecure.com')
      ).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Failed to send password reset email. Please try again later.',
      });

      // Error must be logged but must not contain raw token or URL
      expect(logger.error).toHaveBeenCalledTimes(1);
      const errorLog = logger.error.mock.calls[0][0];
      expect(errorLog).toContain('[auth] Failed to send password reset email for user 10: Resend rate limit exceeded');
      expect(errorLog).not.toContain('/reset-password?token=');
      expect(errorLog).not.toContain('raw token');
    });
  });

  describe('confirmPasswordReset', () => {
    test('updates password and marks token consumed when token is valid', async () => {
      const mockTokenRow = { id: 55, user_id: 10 };
      jest.spyOn(userTokenRepository, 'findValidByHash').mockResolvedValue(mockTokenRow);
      jest.spyOn(userRepository, 'updatePassword').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'markConsumed').mockResolvedValue();

      await authService.confirmPasswordReset('validRawToken123', 'NewValidPassword123!');

      expect(userTokenRepository.findValidByHash).toHaveBeenCalledTimes(1);
      expect(userRepository.updatePassword).toHaveBeenCalledWith(10, expect.any(String));
      expect(userTokenRepository.markConsumed).toHaveBeenCalledWith(55);
    });

    test('rejects with 401 AUTHENTICATION_ERROR when token is invalid or expired', async () => {
      jest.spyOn(userTokenRepository, 'findValidByHash').mockResolvedValue(null);
      jest.spyOn(userRepository, 'updatePassword').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'markConsumed').mockResolvedValue();

      await expect(
        authService.confirmPasswordReset('invalidToken', 'NewValidPassword123!')
      ).rejects.toMatchObject({
        statusCode: 401,
        code: 'AUTHENTICATION_ERROR',
        message: 'Invalid or expired token',
      });

      expect(userRepository.updatePassword).not.toHaveBeenCalled();
      expect(userTokenRepository.markConsumed).not.toHaveBeenCalled();
    });
  });
});

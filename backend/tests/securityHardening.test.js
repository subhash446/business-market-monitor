/**
 * Security Hardening Regression Tests (Step 2 Audit)
 *
 * Verifies:
 * 1. Express app disables x-powered-by technology fingerprinting
 * 2. Express app sets security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
 * 3. Password reset raw token is never logged in production
 * 4. Password reset confirmation endpoint (/password-reset/confirm) has rateLimiter wired
 * 5. Repository SQL query strings defensively parse/clamp inlined LIMIT and OFFSET to valid integers
 */

jest.mock('../src/database/connection', () => ({
  pool: {
    execute: jest.fn().mockResolvedValue([[]]),
    query: jest.fn().mockResolvedValue([[]]),
  },
}));

jest.mock('../src/utils/logger', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
  flush: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/email/mailer', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'msg-test-123' }),
  verifyConnection: jest.fn().mockResolvedValue(true),
}));

const { pool } = require('../src/database/connection');
const logger = require('../src/utils/logger');
const env = require('../src/config/env');

describe('Security Hardening Audit Checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. HTTP Security Headers and Fingerprinting', () => {
    test('express app disables x-powered-by header', () => {
      const app = require('../src/app');
      expect(app.get('x-powered-by')).toBe(false);
    });

    test('express app sets standard security headers on requests', async () => {
      const app = require('../src/app');
      const req = { method: 'GET', url: '/api/v1/health', headers: {} };
      const res = {
        headers: {},
        setHeader: jest.fn((k, v) => { res.headers[k] = v; }),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      // Find the security headers middleware in app stack
      const middlewareLayer = app._router.stack.find(
        layer => layer.name === '<anonymous>' && layer.handle.length === 3
      );
      expect(middlewareLayer).toBeDefined();

      middlewareLayer.handle(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(res.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('SPA fallback does not intercept /api or /api/v1 requests', () => {
      const app = require('../src/app');
      // Find the SPA fallback middleware layer
      const spaLayer = app._router.stack.find(
        layer => layer.name === '<anonymous>' && layer.handle.toString().includes('frontend-react/dist/index.html')
      );
      expect(spaLayer).toBeDefined();

      const next = jest.fn();
      const res = { sendFile: jest.fn() };

      // Request to /api should not sendFile
      spaLayer.handle({ method: 'GET', path: '/api' }, res, next);
      expect(res.sendFile).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);

      // Request to /api/v1/health should not sendFile
      spaLayer.handle({ method: 'GET', path: '/api/v1/health' }, res, next);
      expect(res.sendFile).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. Password Reset Token Logging Security', () => {
    const userRepository = require('../src/repositories/user.repository');
    const userTokenRepository = require('../src/repositories/userToken.repository');
    const authService = require('../src/services/auth.service');
    const mailer = require('../src/email/mailer');

    test('raw password reset token and reset URL are NEVER logged in any environment', async () => {
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 42, email: 'user@example.com' });
      jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'create').mockResolvedValue();
      jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 'msg-1' });

      for (const testEnv of ['production', 'development', 'staging', 'test']) {
        const originalEnv = env.nodeEnv;
        env.nodeEnv = testEnv;
        try {
          logger.info.mockClear();
          logger.error.mockClear();
          logger.warn.mockClear();

          await authService.requestPasswordReset('user@example.com');

          expect(logger.info).toHaveBeenCalledWith('[auth] Password reset email sent for user 42');

          const allLogged = [
            ...logger.info.mock.calls.map(c => c[0]),
            ...logger.error.mock.calls.map(c => c[0]),
            ...logger.warn.mock.calls.map(c => c[0]),
          ].join(' ');

          expect(allLogged).not.toContain('raw token');
          expect(allLogged).not.toContain('/reset-password?token=');
          expect(allLogged).not.toContain('DEV-ONLY');
        } finally {
          env.nodeEnv = originalEnv;
        }
      }
    });

    test('dispatches email via mailer with recipient and reset link', async () => {
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 42, email: 'user@example.com' });
      jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'create').mockResolvedValue();
      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockResolvedValue({ id: 'msg-1' });

      await authService.requestPasswordReset('user@example.com');

      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const callArg = sendEmailSpy.mock.calls[0][0];
      expect(callArg.to).toBe('user@example.com');
      expect(callArg.subject).toBe('Reset Your Password - Business Market Monitor');
      expect(callArg.html).toContain('/reset-password?token=');
      expect(callArg.html).toContain('Reset Password');
    });

    test('handles mailer failure safely without falsely reporting success and without leaking tokens', async () => {
      jest.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 42, email: 'user@example.com' });
      jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
      jest.spyOn(userTokenRepository, 'create').mockResolvedValue();
      jest.spyOn(mailer, 'sendEmail').mockRejectedValue(new Error('Resend API down'));

      await expect(
        authService.requestPasswordReset('user@example.com')
      ).rejects.toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Failed to send password reset email. Please try again later.',
      });

      expect(logger.error).toHaveBeenCalledTimes(1);
      const errorMsg = logger.error.mock.calls[0][0];
      expect(errorMsg).toContain('[auth] Failed to send password reset email for user 42: Resend API down');
      expect(errorMsg).not.toContain('token=');
      expect(errorMsg).not.toContain('raw token');
    });
  });

  describe('3. Auth Route Rate Limiting', () => {
    test('/password-reset/confirm route is protected by rateLimiter middleware', () => {
      const authRouter = require('../src/routes/auth.routes');
      const rateLimiter = require('../src/middleware/rateLimiter.middleware');
      const confirmLayer = authRouter.stack.find(
        layer => layer.route && layer.route.path === '/password-reset/confirm' && layer.route.methods.post
      );

      expect(confirmLayer).toBeDefined();
      expect(confirmLayer.route.stack.length).toBe(3);
      // The first middleware in the stack must be rateLimiter
      expect(confirmLayer.route.stack[0].handle).toBe(rateLimiter);
    });
  });

  describe('4. SQL Pagination Integer Hardening (Anti-NaN Injection)', () => {
    const aiInsightRepo = require('../src/repositories/aiInsight.repository');
    const priceRepo = require('../src/repositories/price.repository');
    const newsRepo = require('../src/repositories/news.repository');
    const alertEventRepo = require('../src/repositories/alertEvent.repository');

    test('aiInsightRepository.findLatestByBusiness safely handles NaN limit', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      await aiInsightRepo.findLatestByBusiness(1, 'not-a-number');

      const sqlExecuted = pool.execute.mock.calls[0][0];
      expect(sqlExecuted).not.toContain('NaN');
      expect(sqlExecuted).toContain('LIMIT 3');
    });

    test('aiInsightRepository.listByMaterial safely handles NaN limit and offset', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      await aiInsightRepo.listByMaterial(1, 1, { limit: 'abc', offset: 'xyz' });

      const sqlExecuted = pool.execute.mock.calls[0][0];
      expect(sqlExecuted).not.toContain('NaN');
      expect(sqlExecuted).toContain('LIMIT 20 OFFSET 0');
    });

    test('priceRepository.findHistoryForMaterial safely handles NaN limit and offset', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      await priceRepo.findHistoryForMaterial(1, { limit: 'bad', offset: 'bad' });

      const sqlExecuted = pool.execute.mock.calls[0][0];
      expect(sqlExecuted).not.toContain('NaN');
      expect(sqlExecuted).toContain('LIMIT 20 OFFSET 0');
    });

    test('newsRepository.listByIndustry safely handles NaN limit and offset', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      await newsRepo.listByIndustry(1, { limit: 'invalid', offset: 'invalid' });

      const sqlExecuted = pool.execute.mock.calls[0][0];
      expect(sqlExecuted).not.toContain('NaN');
      expect(sqlExecuted).toContain('LIMIT 20 OFFSET 0');
    });

    test('alertEventRepository.listByBusinessId safely handles NaN limit and offset', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      await alertEventRepo.listByBusinessId(1, { limit: 'oops', offset: 'oops' });

      const sqlExecuted = pool.execute.mock.calls[0][0];
      expect(sqlExecuted).not.toContain('NaN');
      expect(sqlExecuted).toContain('LIMIT 20 OFFSET 0');
    });
  });
});

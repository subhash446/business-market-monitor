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

    test('raw password reset token is NOT logged in production environment', async () => {
      const originalNodeEnv = env.nodeEnv;
      try {
        env.nodeEnv = 'production';

        jest.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 42, email: 'user@example.com' });
        jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
        jest.spyOn(userTokenRepository, 'create').mockResolvedValue();

        await authService.requestPasswordReset('user@example.com');

        expect(logger.info).toHaveBeenCalledTimes(1);
        const loggedMessage = logger.info.mock.calls[0][0];

        // Must log that reset was requested, but must NOT leak the raw token in production
        expect(loggedMessage).toContain('Password reset requested for user 42');
        expect(loggedMessage).not.toContain('raw token =');
      } finally {
        env.nodeEnv = originalNodeEnv;
      }
    });

    test('raw password reset token is only logged in non-production environments with DEV-ONLY tag', async () => {
      const originalNodeEnv = env.nodeEnv;
      try {
        env.nodeEnv = 'development';

        jest.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 42, email: 'user@example.com' });
        jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
        jest.spyOn(userTokenRepository, 'create').mockResolvedValue();

        await authService.requestPasswordReset('user@example.com');

        expect(logger.info).toHaveBeenCalledTimes(1);
        const loggedMessage = logger.info.mock.calls[0][0];

        expect(loggedMessage).toContain('DEV-ONLY, no email service configured: raw token =');
      } finally {
        env.nodeEnv = originalNodeEnv;
      }
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

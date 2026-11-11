/**
 * Phase 12 — System Health API Integration & Diagnostics Test Suite
 *
 * Implements comprehensive verification of the System Health endpoint:
 *   GET /api/v1/health (Document 5 §4.11, Document 3 §15, NFR-REL-01, NFR-REL-02)
 *
 * Verifies:
 *   1. Route Registration & Public Access:
 *      - Mounted at /api/v1/health without authMiddleware (public probe per Document 5 §2.3, §4.11).
 *   2. Healthy Status (HTTP 200):
 *      - Lightweight connectivity probe (`SELECT 1`).
 *      - Returns `{ success: true, data: { status: "ok", database: "connected", timestamp, scheduler } }`.
 *   3. Scheduler Serialization (Document 5 §4.11):
 *      - Correctly maps `priceIngestion` and `newsIngestion` rows from `sync_statuses`.
 *      - Surfaces `lastRunAt`, `lastSuccessAt`, and `lastStatus`.
 *   4. Null Handling for Unexecuted Jobs:
 *      - When a job has never run, `lastRunAt`, `lastSuccessAt`, `lastStatus` return `null` (not omitted).
 *   5. Database Unreachable Failure (HTTP 500):
 *      - When database query throws, returns HTTP 500 with top-level `database: "unreachable"`
 *        and standard error envelope `{ success: false, error: { code: "INTERNAL_ERROR", message: "Health check failed" } }`.
 *   6. Security & Information Leakage Defense:
 *      - Confirms no database credentials, connection strings, hostnames, or stack traces are leaked.
 */

'use strict';

const healthController = require('../src/controllers/health.controller');
const syncStatusRepository = require('../src/repositories/syncStatus.repository');
const healthRouter = require('../src/routes/health.routes');
const authMiddleware = require('../src/middleware/auth.middleware');
const { pool } = require('../src/database/connection');

describe('Phase 12 — System Health API (GET /api/v1/health)', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  // =========================================================================
  // 1. Route Registration & Public Access
  // =========================================================================
  describe('1. Route Registration & Public Access', () => {

    test('1.1 registers GET / without authMiddleware (public endpoint)', () => {
      const getRoutes = healthRouter.stack.filter(
        (layer) => layer.route && layer.route.methods && layer.route.methods.get
      );
      expect(getRoutes.length).toBeGreaterThanOrEqual(1);

      const rootGet = getRoutes.find((layer) => layer.route.path === '/');
      expect(rootGet).toBeDefined();

      const handlers = rootGet.route.stack.map((s) => s.handle);
      expect(handlers).not.toContain(authMiddleware);
      expect(handlers).toContain(healthController.getHealth);
    });

  });

  // =========================================================================
  // 2. Healthy System Status (HTTP 200)
  // =========================================================================
  describe('2. Healthy System Status (HTTP 200)', () => {

    test('2.1 returns 200 with status ok, database connected, valid ISO timestamp, and scheduler block', async () => {
      const req = {};
      const res = createMockRes();

      jest.spyOn(pool, 'query').mockResolvedValueOnce([[{ '1': 1 }]]);
      jest.spyOn(syncStatusRepository, 'findAll').mockResolvedValueOnce([
        {
          job_type: 'PRICE_INGESTION',
          last_run_at: '2026-07-18T05:00:00.000Z',
          last_success_at: '2026-07-18T05:00:00.000Z',
          last_status: 'SUCCESS',
        },
        {
          job_type: 'NEWS_INGESTION',
          last_run_at: '2026-07-18T05:00:00.000Z',
          last_success_at: '2026-07-18T05:00:00.000Z',
          last_status: 'SUCCESS',
        },
      ]);

      await healthController.getHealth(req, res);

      expect(pool.query).toHaveBeenCalledWith('SELECT 1');
      expect(res.status).toHaveBeenCalledWith(200);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(true);
      expect(responseBody.data).toBeDefined();
      expect(responseBody.data.status).toBe('ok');
      expect(responseBody.data.database).toBe('connected');

      // Verify ISO timestamp
      expect(typeof responseBody.data.timestamp).toBe('string');
      expect(Number.isNaN(new Date(responseBody.data.timestamp).getTime())).toBe(false);

      // Verify scheduler entries match Document 5 §4.11
      expect(responseBody.data.scheduler).toEqual({
        priceIngestion: {
          lastRunAt: '2026-07-18T05:00:00.000Z',
          lastSuccessAt: '2026-07-18T05:00:00.000Z',
          lastStatus: 'SUCCESS',
        },
        newsIngestion: {
          lastRunAt: '2026-07-18T05:00:00.000Z',
          lastSuccessAt: '2026-07-18T05:00:00.000Z',
          lastStatus: 'SUCCESS',
        },
      });
    });

  });

  // =========================================================================
  // 3. Scheduler Serialization & Null Safety
  // =========================================================================
  describe('3. Scheduler Serialization & Null Safety', () => {

    test('3.1 handles empty sync_statuses table returning null fields rather than omitting keys (Document 5 §4.11)', async () => {
      const req = {};
      const res = createMockRes();

      jest.spyOn(pool, 'query').mockResolvedValueOnce([[{ '1': 1 }]]);
      jest.spyOn(syncStatusRepository, 'findAll').mockResolvedValueOnce([]); // No jobs have run yet

      await healthController.getHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseBody = res.json.mock.calls[0][0];

      expect(responseBody.data.scheduler.priceIngestion).toEqual({
        lastRunAt: null,
        lastSuccessAt: null,
        lastStatus: null,
      });
      expect(responseBody.data.scheduler.newsIngestion).toEqual({
        lastRunAt: null,
        lastSuccessAt: null,
        lastStatus: null,
      });
    });

    test('3.2 surfaces FAILED status when a background ingestion run encountered errors', async () => {
      const req = {};
      const res = createMockRes();

      jest.spyOn(pool, 'query').mockResolvedValueOnce([[{ '1': 1 }]]);
      jest.spyOn(syncStatusRepository, 'findAll').mockResolvedValueOnce([
        {
          job_type: 'PRICE_INGESTION',
          last_run_at: '2026-07-18T06:00:00.000Z',
          last_success_at: '2026-07-18T05:00:00.000Z',
          last_status: 'FAILED',
        },
        {
          job_type: 'NEWS_INGESTION',
          last_run_at: '2026-07-18T06:00:00.000Z',
          last_success_at: '2026-07-18T06:00:00.000Z',
          last_status: 'SUCCESS',
        },
      ]);

      await healthController.getHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const responseBody = res.json.mock.calls[0][0];

      expect(responseBody.data.scheduler.priceIngestion.lastStatus).toBe('FAILED');
      expect(responseBody.data.scheduler.priceIngestion.lastSuccessAt).toBe('2026-07-18T05:00:00.000Z');
      expect(responseBody.data.scheduler.newsIngestion.lastStatus).toBe('SUCCESS');
    });

  });

  // =========================================================================
  // 4. Database Failure & Error Handling (HTTP 500)
  // =========================================================================
  describe('4. Database Failure & Error Handling (HTTP 500)', () => {

    test('4.1 returns HTTP 500 with database: unreachable when pool connection fails', async () => {
      const req = {};
      const res = createMockRes();

      jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('Connection lost ETIMEDOUT'));

      await healthController.getHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Health check failed',
        },
        database: 'unreachable',
      });
    });

    test('4.2 returns HTTP 500 with database: unreachable when syncStatus repository fails', async () => {
      const req = {};
      const res = createMockRes();

      jest.spyOn(pool, 'query').mockResolvedValueOnce([[{ '1': 1 }]]);
      jest.spyOn(syncStatusRepository, 'findAll').mockRejectedValueOnce(new Error('Table sync_statuses locked'));

      await healthController.getHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Health check failed',
        },
        database: 'unreachable',
      });
    });

  });

  // =========================================================================
  // 5. Security & Information Leakage Defense
  // =========================================================================
  describe('5. Security & Information Leakage Defense', () => {

    test('5.1 never leaks sensitive environment credentials or stack traces in error response', async () => {
      const req = {};
      const res = createMockRes();

      const sensitiveErr = new Error('Access denied for user root@192.168.1.5 (using password: YES)');
      sensitiveErr.stack = 'Error at Connection.connect (/var/app/backend/db.js:123)';
      jest.spyOn(pool, 'query').mockRejectedValueOnce(sensitiveErr);

      await healthController.getHealth(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const payload = res.json.mock.calls[0][0];

      const stringified = JSON.stringify(payload);
      expect(stringified).not.toContain('root');
      expect(stringified).not.toContain('192.168.1.5');
      expect(stringified).not.toContain('password');
      expect(stringified).not.toContain('stack');
      expect(stringified).not.toContain('/var/app');
    });

  });

});

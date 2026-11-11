/**
 * Phase 9 — Email Alerts API Integration & Security Test Suite
 *
 * Implements comprehensive verification of the five Phase 9 alert endpoints:
 *   1. GET    /api/v1/alerts/rules
 *   2. POST   /api/v1/alerts/rules
 *   3. PATCH  /api/v1/alerts/rules/:ruleId
 *   4. DELETE /api/v1/alerts/rules/:ruleId
 *   5. GET    /api/v1/alerts/events
 *
 * Verifies:
 *   - Route registration and middleware binding (authMiddleware, validation middleware).
 *   - Authentication and authorization guards (401 UNAUTHORIZED).
 *   - Tenant isolation & IDOR defense: foreign materials and foreign rules return 404 NOT_FOUND.
 *   - Request body validation: rejects missing fields, negative prices, unknown update keys with 400 VALIDATION_ERROR.
 *   - Soft-delete semantics: DELETE returns 200 with { id, deletedAt }, excludes rule from GET /rules,
 *     returns 404 on subsequent update or delete, and preserves alert_events audit history intact.
 *   - Alert event history pagination: default limit 20, max limit 100, page offsets, meta calculation.
 *   - Phase 2 backward compatibility: preserves extended fields (thresholdType, cooldownHours, lastTriggeredAt,
 *     thresholdTypeSnapshot, triggeredChangePercent).
 *   - Architecture integrity: Controller -> Service -> Repository separation; parameterized SQL.
 */

'use strict';

const alertController = require('../src/controllers/alert.controller');
const alertRuleService = require('../src/services/alertRule.service');
const alertRuleRepository = require('../src/repositories/alertRule.repository');
const alertEventRepository = require('../src/repositories/alertEvent.repository');
const materialRepository = require('../src/repositories/material.repository');
const businessRepository = require('../src/repositories/business.repository');
const alertsRouter = require('../src/routes/alerts.routes');
const authMiddleware = require('../src/middleware/auth.middleware');
const validate = require('../src/middleware/validate.middleware');
const { validateCreateRule, validateUpdateRule } = require('../src/validators/alert.validator');
const { pool } = require('../src/database/connection');
const AppError = require('../src/utils/AppError');

describe('Phase 9 — Email Alerts API', () => {

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
  // 1. Route Registration & Middleware Architecture
  // =========================================================================
  describe('1. Route Registration & Middleware Architecture', () => {

    test('1.1 registers all 5 alert endpoints with authMiddleware and correct handlers', () => {
      const routes = alertsRouter.stack
        .filter((layer) => layer.route)
        .map((layer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
          stack: layer.route.stack.map((s) => s.handle),
        }));

      // GET /rules
      const getRules = routes.find((r) => r.path === '/rules' && r.methods.includes('get'));
      expect(getRules).toBeDefined();
      expect(getRules.stack).toContain(authMiddleware);
      expect(getRules.stack).toContain(alertController.listAlertRules);

      // POST /rules
      const postRules = routes.find((r) => r.path === '/rules' && r.methods.includes('post'));
      expect(postRules).toBeDefined();
      expect(postRules.stack).toContain(authMiddleware);
      expect(postRules.stack).toContain(alertController.createAlertRule);

      // PATCH /rules/:ruleId
      const patchRule = routes.find((r) => r.path === '/rules/:ruleId' && r.methods.includes('patch'));
      expect(patchRule).toBeDefined();
      expect(patchRule.stack).toContain(authMiddleware);
      expect(patchRule.stack).toContain(alertController.updateAlertRule);

      // DELETE /rules/:ruleId
      const deleteRule = routes.find((r) => r.path === '/rules/:ruleId' && r.methods.includes('delete'));
      expect(deleteRule).toBeDefined();
      expect(deleteRule.stack).toContain(authMiddleware);
      expect(deleteRule.stack).toContain(alertController.deleteAlertRule);

      // GET /events
      const getEvents = routes.find((r) => r.path === '/events' && r.methods.includes('get'));
      expect(getEvents).toBeDefined();
      expect(getEvents.stack).toContain(authMiddleware);
      expect(getEvents.stack).toContain(alertController.listAlertEvents);
    });

  });

  // =========================================================================
  // 2. GET /api/v1/alerts/rules
  // =========================================================================
  describe('2. GET /api/v1/alerts/rules', () => {

    test('2.1 returns 200 with list of active alert rules for caller business', async () => {
      const req = { auth: { userId: 1, businessId: 42 } };
      const res = createMockRes();
      const next = jest.fn();

      const mockRules = [
        {
          id: 200,
          tracked_material_id: 100,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '150.00',
          threshold_type: 'ABSOLUTE',
          cooldown_hours: 24,
          last_triggered_at: null,
          is_active: 1,
        },
      ];

      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce(mockRules);

      await alertController.listAlertRules(req, res, next);

      expect(alertRuleRepository.listActiveByBusinessId).toHaveBeenCalledWith(42);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            id: 200,
            trackedMaterialId: 100,
            conditionType: 'PRICE_ABOVE',
            thresholdPrice: '150.00',
            isActive: true,
            thresholdType: 'ABSOLUTE',
            cooldownHours: 24,
            lastTriggeredAt: null,
          }),
        ],
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('2.2 resolves businessId via repository fallback when token has no businessId', async () => {
      const req = { auth: { userId: 9 } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce({ id: 88 });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([]);

      await alertController.listAlertRules(req, res, next);

      expect(businessRepository.findByUserId).toHaveBeenCalledWith(9);
      expect(alertRuleRepository.listActiveByBusinessId).toHaveBeenCalledWith(88);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    });

    test('2.3 passes 404 NOT_FOUND when business profile is missing', async () => {
      const req = { auth: { userId: 99 } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce(null);

      await alertController.listAlertRules(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
        })
      );
    });

    test('2.4 passes 401 UNAUTHORIZED when authentication is missing', async () => {
      const req = { auth: null };
      const res = createMockRes();
      const next = jest.fn();

      await alertController.listAlertRules(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });

    test('2.5 excludes soft-deleted rules from the response (repository query verification)', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValueOnce([[]]);

      await alertRuleRepository.listActiveByBusinessId(42);

      const [sql, params] = executeSpy.mock.calls[0];
      expect(params).toEqual([42]);
      expect(sql).toContain('business_id = ?');
      expect(sql).toContain('deleted_at IS NULL');
    });

  });

  // =========================================================================
  // 3. POST /api/v1/alerts/rules
  // =========================================================================
  describe('3. POST /api/v1/alerts/rules', () => {

    test('3.1 creates a valid rule and returns 201 Created with rule object', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        body: {
          trackedMaterialId: 100,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: '150.00',
        },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 100,
        business_id: 42,
        name: 'PET Resin',
      });

      jest.spyOn(alertRuleRepository, 'create').mockResolvedValueOnce({
        id: 205,
        tracked_material_id: 100,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '150.00',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        is_active: 1,
        last_triggered_at: null,
      });

      await alertController.createAlertRule(req, res, next);

      expect(materialRepository.findByIdForBusiness).toHaveBeenCalledWith(100, 42);
      expect(alertRuleRepository.create).toHaveBeenCalledWith({
        businessId: 42,
        trackedMaterialId: 100,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: '150.00',
        thresholdType: 'ABSOLUTE',
        cooldownHours: 24,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 205,
          trackedMaterialId: 100,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: '150.00',
          isActive: true,
        }),
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('3.2 IDOR protection: rejects creating rule for material belonging to another business (404 NOT_FOUND)', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        body: {
          trackedMaterialId: 999, // foreign material
          conditionType: 'PRICE_BELOW',
          thresholdPrice: '50.00',
        },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

      await alertController.createAlertRule(req, res, next);

      expect(materialRepository.findByIdForBusiness).toHaveBeenCalledWith(999, 42);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Material not found',
        })
      );
    });

    test('3.3 accepts Phase 2 extended fields (thresholdType=PERCENTAGE, cooldownHours=48)', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        body: {
          trackedMaterialId: 100,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 8.5,
          thresholdType: 'PERCENTAGE',
          cooldownHours: 48,
        },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({ id: 100 });
      jest.spyOn(alertRuleRepository, 'create').mockResolvedValueOnce({
        id: 206,
        tracked_material_id: 100,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '8.50',
        threshold_type: 'PERCENTAGE',
        cooldown_hours: 48,
        is_active: 1,
      });

      await alertController.createAlertRule(req, res, next);

      expect(alertRuleRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          thresholdType: 'PERCENTAGE',
          cooldownHours: 48,
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('3.4 allows multiple thresholds configured for the same material and conditionType', async () => {
      // Document 5 has no unique constraint across (business_id, tracked_material_id, condition_type)
      jest.spyOn(materialRepository, 'findByIdForBusiness')
        .mockResolvedValueOnce({ id: 100 })
        .mockResolvedValueOnce({ id: 100 });

      const createSpy = jest.spyOn(alertRuleRepository, 'create')
        .mockResolvedValueOnce({ id: 207, tracked_material_id: 100, condition_type: 'PRICE_ABOVE', threshold_price: '100.00', is_active: 1 })
        .mockResolvedValueOnce({ id: 208, tracked_material_id: 100, condition_type: 'PRICE_ABOVE', threshold_price: '120.00', is_active: 1 });

      const r1 = await alertRuleService.createRule(42, {
        trackedMaterialId: 100,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: '100.00',
      });
      const r2 = await alertRuleService.createRule(42, {
        trackedMaterialId: 100,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: '120.00',
      });

      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(r1.id).toBe(207);
      expect(r2.id).toBe(208);
    });

    // Validation middleware behavior
    describe('validateCreateRule checks', () => {
      test('rejects missing or invalid trackedMaterialId', () => {
        expect(validateCreateRule({ conditionType: 'PRICE_ABOVE', thresholdPrice: 100 }))
          .toContainEqual(expect.objectContaining({ field: 'trackedMaterialId' }));
        expect(validateCreateRule({ trackedMaterialId: -5, conditionType: 'PRICE_ABOVE', thresholdPrice: 100 }))
          .toContainEqual(expect.objectContaining({ field: 'trackedMaterialId' }));
        expect(validateCreateRule({ trackedMaterialId: 'invalid', conditionType: 'PRICE_ABOVE', thresholdPrice: 100 }))
          .toContainEqual(expect.objectContaining({ field: 'trackedMaterialId' }));
      });

      test('rejects missing or invalid conditionType', () => {
        expect(validateCreateRule({ trackedMaterialId: 1, thresholdPrice: 100 }))
          .toContainEqual(expect.objectContaining({ field: 'conditionType' }));
        expect(validateCreateRule({ trackedMaterialId: 1, conditionType: 'PRICE_EQUALS', thresholdPrice: 100 }))
          .toContainEqual(expect.objectContaining({ field: 'conditionType' }));
      });

      test('rejects thresholdPrice <= 0 or NaN', () => {
        expect(validateCreateRule({ trackedMaterialId: 1, conditionType: 'PRICE_ABOVE', thresholdPrice: 0 }))
          .toContainEqual(expect.objectContaining({ field: 'thresholdPrice' }));
        expect(validateCreateRule({ trackedMaterialId: 1, conditionType: 'PRICE_ABOVE', thresholdPrice: -10 }))
          .toContainEqual(expect.objectContaining({ field: 'thresholdPrice' }));
        expect(validateCreateRule({ trackedMaterialId: 1, conditionType: 'PRICE_ABOVE', thresholdPrice: 'not-a-number' }))
          .toContainEqual(expect.objectContaining({ field: 'thresholdPrice' }));
      });

      test('rejects invalid cooldownHours (out of range or non-integer)', () => {
        expect(validateCreateRule({ trackedMaterialId: 1, conditionType: 'PRICE_ABOVE', thresholdPrice: 50, cooldownHours: 0 }))
          .toContainEqual(expect.objectContaining({ field: 'cooldownHours' }));
        expect(validateCreateRule({ trackedMaterialId: 1, conditionType: 'PRICE_ABOVE', thresholdPrice: 50, cooldownHours: 721 }))
          .toContainEqual(expect.objectContaining({ field: 'cooldownHours' }));
      });
    });

  });

  // =========================================================================
  // 4. PATCH /api/v1/alerts/rules/:ruleId
  // =========================================================================
  describe('4. PATCH /api/v1/alerts/rules/:ruleId', () => {

    test('4.1 successfully toggles isActive flag and returns updated rule', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { ruleId: '200' },
        body: { isActive: false },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 200,
        business_id: 42,
        tracked_material_id: 100,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '150.00',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        is_active: 1,
      });

      jest.spyOn(alertRuleRepository, 'update').mockResolvedValueOnce({
        id: 200,
        tracked_material_id: 100,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '150.00',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        is_active: 0,
      });

      await alertController.updateAlertRule(req, res, next);

      expect(alertRuleRepository.findByIdForBusiness).toHaveBeenCalledWith('200', 42);
      expect(alertRuleRepository.update).toHaveBeenCalledWith('200', expect.objectContaining({
        isActive: false,
      }));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 200,
          isActive: false,
        }),
      });
    });

    test('4.2 updates thresholdPrice and conditionType', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { ruleId: '200' },
        body: { conditionType: 'PRICE_BELOW', thresholdPrice: '140.00' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 200,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '150.00',
        is_active: 1,
      });

      jest.spyOn(alertRuleRepository, 'update').mockResolvedValueOnce({
        id: 200,
        condition_type: 'PRICE_BELOW',
        threshold_price: '140.00',
        is_active: 1,
      });

      await alertController.updateAlertRule(req, res, next);

      expect(alertRuleRepository.update).toHaveBeenCalledWith('200', expect.objectContaining({
        conditionType: 'PRICE_BELOW',
        thresholdPrice: '140.00',
      }));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          conditionType: 'PRICE_BELOW',
          thresholdPrice: '140.00',
        }),
      });
    });

    test('4.3 IDOR protection: returns 404 NOT_FOUND when updating rule of another tenant', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { ruleId: '999' },
        body: { isActive: false },
      };
      const res = createMockRes();
      const next = jest.fn();

      // Rule not found for businessId 42
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

      await alertController.updateAlertRule(req, res, next);

      expect(alertRuleRepository.findByIdForBusiness).toHaveBeenCalledWith('999', 42);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Alert rule not found',
        })
      );
    });

    test('4.4 returns 404 NOT_FOUND when trying to update a soft-deleted rule', async () => {
      // soft-deleted rules have deleted_at IS NOT NULL; findByIdForBusiness returns null
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

      await expect(
        alertRuleService.updateRule(42, 200, { isActive: true })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    describe('validateUpdateRule checks', () => {
      test('rejects empty body', () => {
        expect(validateUpdateRule({}))
          .toContainEqual(expect.objectContaining({ field: 'body', issue: 'at least one field must be provided' }));
      });

      test('rejects disallowed fields (trackedMaterialId, businessId, id)', () => {
        const errors = validateUpdateRule({ trackedMaterialId: 105, businessId: 99 });
        expect(errors).toContainEqual(expect.objectContaining({ field: 'trackedMaterialId', issue: 'cannot be updated' }));
        expect(errors).toContainEqual(expect.objectContaining({ field: 'businessId', issue: 'cannot be updated' }));
      });

      test('rejects invalid conditionType', () => {
        expect(validateUpdateRule({ conditionType: 'INVALID' }))
          .toContainEqual(expect.objectContaining({ field: 'conditionType' }));
      });

      test('rejects negative or zero thresholdPrice', () => {
        expect(validateUpdateRule({ thresholdPrice: -5 }))
          .toContainEqual(expect.objectContaining({ field: 'thresholdPrice' }));
        expect(validateUpdateRule({ thresholdPrice: 0 }))
          .toContainEqual(expect.objectContaining({ field: 'thresholdPrice' }));
      });

      test('rejects non-boolean isActive', () => {
        expect(validateUpdateRule({ isActive: 'true' }))
          .toContainEqual(expect.objectContaining({ field: 'isActive', issue: 'must be a boolean' }));
        expect(validateUpdateRule({ isActive: 1 }))
          .toContainEqual(expect.objectContaining({ field: 'isActive', issue: 'must be a boolean' }));
      });
    });

  });

  // =========================================================================
  // 5. DELETE /api/v1/alerts/rules/:ruleId (Soft Delete)
  // =========================================================================
  describe('5. DELETE /api/v1/alerts/rules/:ruleId', () => {

    test('5.1 soft deletes rule and returns 200 with { id, deletedAt } body', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { ruleId: '200' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 200,
        business_id: 42,
      });
      jest.spyOn(alertRuleRepository, 'softDelete').mockResolvedValueOnce(new Date('2026-07-18T10:00:00Z'));

      await alertController.deleteAlertRule(req, res, next);

      expect(alertRuleRepository.findByIdForBusiness).toHaveBeenCalledWith('200', 42);
      expect(alertRuleRepository.softDelete).toHaveBeenCalledWith('200');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 200,
          deletedAt: '2026-07-18T10:00:00.000Z',
        },
      });
    });

    test('5.2 IDOR protection: returns 404 NOT_FOUND when attempting to delete another tenant rule', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { ruleId: '999' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

      await alertController.deleteAlertRule(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
        })
      );
    });

    test('5.3 repeated delete returns 404 NOT_FOUND because rule is already soft-deleted', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        params: { ruleId: '200' },
      };
      const res = createMockRes();
      const next = jest.fn();

      // Second delete attempt finds no active rule
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

      await alertController.deleteAlertRule(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
        })
      );
    });

    test('5.4 repository softDelete sets deleted_at = NOW() (never hard deletes)', async () => {
      const executeSpy = jest.spyOn(pool, 'execute')
        .mockResolvedValueOnce([{}])
        .mockResolvedValueOnce([[{ deleted_at: '2026-07-18T10:00:00Z' }]]);

      const deletedAt = await alertRuleRepository.softDelete(200);

      expect(executeSpy).toHaveBeenCalledTimes(2);
      const [updateSql, updateParams] = executeSpy.mock.calls[0];
      expect(updateSql).toContain('UPDATE alert_rules SET deleted_at = NOW() WHERE id = ?');
      expect(updateParams).toEqual([200]);
      expect(deletedAt).toBe('2026-07-18T10:00:00Z');
    });

  });

  // =========================================================================
  // 6. GET /api/v1/alerts/events (Audit History)
  // =========================================================================
  describe('6. GET /api/v1/alerts/events', () => {

    test('6.1 returns paginated alert events matching Document 5 schema', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        query: { page: '1', limit: '20' },
      };
      const res = createMockRes();
      const next = jest.fn();

      const mockEvents = [
        {
          id: 5,
          alert_rule_id: 200,
          tracked_material_id: 100,
          triggered_price: '151.2000',
          threshold_price_snapshot: '150.0000',
          condition_type_snapshot: 'PRICE_ABOVE',
          threshold_type_snapshot: 'ABSOLUTE',
          triggered_change_percent: null,
          notification_channel: 'EMAIL',
          delivery_status: 'SENT',
          triggered_at: new Date('2026-07-16T06:00:00.000Z'),
        },
      ];

      jest.spyOn(alertEventRepository, 'listByBusinessId').mockResolvedValueOnce(mockEvents);
      jest.spyOn(alertEventRepository, 'countByBusinessId').mockResolvedValueOnce(1);

      await alertController.listAlertEvents(req, res, next);

      expect(alertEventRepository.listByBusinessId).toHaveBeenCalledWith(42, { limit: 20, offset: 0 });
      expect(alertEventRepository.countByBusinessId).toHaveBeenCalledWith(42);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          expect.objectContaining({
            id: 5,
            alertRuleId: 200,
            trackedMaterialId: 100,
            triggeredPrice: '151.2000',
            thresholdPriceSnapshot: '150.0000',
            conditionTypeSnapshot: 'PRICE_ABOVE',
            notificationChannel: 'EMAIL',
            deliveryStatus: 'SENT',
            triggeredAt: '2026-07-16T06:00:00.000Z',
          }),
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('6.2 respects explicit page, limit, and calculates totalPages correctly', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        query: { page: '3', limit: '10' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(alertEventRepository, 'listByBusinessId').mockResolvedValueOnce([]);
      jest.spyOn(alertEventRepository, 'countByBusinessId').mockResolvedValueOnce(45);

      await alertController.listAlertEvents(req, res, next);

      expect(alertEventRepository.listByBusinessId).toHaveBeenCalledWith(42, { limit: 10, offset: 20 });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        meta: {
          page: 3,
          limit: 10,
          total: 45,
          totalPages: 5,
        },
      });
    });

    test('6.3 clamps limit to 100 maximum when excessive limit is requested', async () => {
      const req = {
        auth: { userId: 1, businessId: 42 },
        query: { page: '1', limit: '500' },
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(alertEventRepository, 'listByBusinessId').mockResolvedValueOnce([]);
      jest.spyOn(alertEventRepository, 'countByBusinessId').mockResolvedValueOnce(0);

      await alertController.listAlertEvents(req, res, next);

      expect(alertEventRepository.listByBusinessId).toHaveBeenCalledWith(42, { limit: 100, offset: 0 });
    });

    test('6.4 repository listByBusinessId enforces parameterized business_id and ORDER BY triggered_at DESC', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValueOnce([[]]);

      await alertEventRepository.listByBusinessId(42, { limit: 20, offset: 0 });

      const [sql, params] = executeSpy.mock.calls[0];
      expect(params).toEqual([42]);
      expect(sql).toContain('WHERE business_id = ?');
      expect(sql).toContain('ORDER BY triggered_at DESC');
      expect(sql).toContain('LIMIT 20 OFFSET 0');
    });

    test('6.5 audit preservation: alert events remain queryable even after rules are soft-deleted', async () => {
      // alert_events does not join against alert_rules; events for soft-deleted rules are returned
      const mockHistoricalEvent = {
        id: 12,
        alert_rule_id: 999, // rule was deleted
        tracked_material_id: 100,
        triggered_price: '160.00',
        threshold_price_snapshot: '155.00',
        condition_type_snapshot: 'PRICE_ABOVE',
        notification_channel: 'EMAIL',
        delivery_status: 'SENT',
        triggered_at: '2026-06-01T00:00:00Z',
      };

      jest.spyOn(alertEventRepository, 'listByBusinessId').mockResolvedValueOnce([mockHistoricalEvent]);
      jest.spyOn(alertEventRepository, 'countByBusinessId').mockResolvedValueOnce(1);

      const result = await alertRuleService.listEvents(42, { page: 1, limit: 20, offset: 0 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].alertRuleId).toBe(999);
      expect(result.items[0].triggeredPrice).toBe('160.00');
    });

  });

  // =========================================================================
  // 7. Tenant Isolation & Cross-Business Boundary Tests
  // =========================================================================
  describe('7. Tenant Isolation & Cross-Business Boundary Tests', () => {

    test('7.1 business A and business B cannot read each other alert rules', async () => {
      const repoSpy = jest.spyOn(alertRuleRepository, 'listActiveByBusinessId')
        .mockResolvedValueOnce([{ id: 1, tracked_material_id: 10, condition_type: 'PRICE_ABOVE', threshold_price: '50' }])
        .mockResolvedValueOnce([{ id: 2, tracked_material_id: 20, condition_type: 'PRICE_BELOW', threshold_price: '30' }]);

      const rulesA = await alertRuleService.listRules(101);
      const rulesB = await alertRuleService.listRules(202);

      expect(repoSpy).toHaveBeenNthCalledWith(1, 101);
      expect(repoSpy).toHaveBeenNthCalledWith(2, 202);

      expect(rulesA[0].id).toBe(1);
      expect(rulesB[0].id).toBe(2);
    });

    test('7.2 business A and business B cannot read each other alert events', async () => {
      const eventSpy = jest.spyOn(alertEventRepository, 'listByBusinessId')
        .mockResolvedValueOnce([{ id: 50, alert_rule_id: 1, triggered_price: '52.00', triggered_at: '2026-07-01' }])
        .mockResolvedValueOnce([{ id: 60, alert_rule_id: 2, triggered_price: '28.00', triggered_at: '2026-07-02' }]);

      jest.spyOn(alertEventRepository, 'countByBusinessId').mockResolvedValue(1);

      const eventsA = await alertRuleService.listEvents(101, { page: 1, limit: 20, offset: 0 });
      const eventsB = await alertRuleService.listEvents(202, { page: 1, limit: 20, offset: 0 });

      expect(eventSpy).toHaveBeenNthCalledWith(1, 101, { limit: 20, offset: 0 });
      expect(eventSpy).toHaveBeenNthCalledWith(2, 202, { limit: 20, offset: 0 });

      expect(eventsA.items[0].id).toBe(50);
      expect(eventsB.items[0].id).toBe(60);
    });

  });

});

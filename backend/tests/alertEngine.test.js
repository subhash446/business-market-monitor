/**
 * Phase 2 — Alert Rule Engine & Notification Pipeline Test Suite.
 *
 * Verifies:
 *   1. Validation of threshold types (ABSOLUTE vs PERCENTAGE) and cooldown hours.
 *   2. Absolute threshold evaluation (PRICE_ABOVE, PRICE_BELOW).
 *   3. Percentage threshold evaluation (like-for-like currency history, 2-point requirement).
 *   4. Data integrity: invalid prices (is_valid=0) and unmapped proxies are skipped.
 *   5. Cooldown suppression and deduplication.
 *   6. Tenant isolation across businesses.
 *   7. Notification pipeline and delivery status persistence (PENDING -> SENT / FAILED).
 *   8. Standalone cron job behavior (enabled flag, overlap guard, sync status).
 *   9. Migration 023 structure and idempotency.
 */

const { validateCreateRule, validateUpdateRule } = require('../src/validators/alert.validator');
const alertEvaluationService = require('../src/services/alertEvaluation.service');
const alertRuleService = require('../src/services/alertRule.service');
const alertEvaluationJob = require('../src/jobs/alertEvaluation.job');
const alertRuleRepository = require('../src/repositories/alertRule.repository');
const alertEventRepository = require('../src/repositories/alertEvent.repository');
const priceRepository = require('../src/repositories/price.repository');
const materialRepository = require('../src/repositories/material.repository');
const businessRepository = require('../src/repositories/business.repository');
const userRepository = require('../src/repositories/user.repository');
const syncStatusRepository = require('../src/repositories/syncStatus.repository');
const notificationService = require('../src/services/notification.service');
const env = require('../src/config/env');
const migration023 = require('../src/migrations/023_add_alert_rule_enhancements');

describe('Phase 2 — Alert Rule Engine & Notification Pipeline', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /* =========================================================================
   * 1. Validator Tests
   * ========================================================================= */
  describe('Alert Validator', () => {
    test('accepts valid ABSOLUTE threshold rule', () => {
      const errors = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdType: 'ABSOLUTE',
        thresholdPrice: 150.5,
        cooldownHours: 24,
      });
      expect(errors).toHaveLength(0);
    });

    test('accepts valid PERCENTAGE threshold rule', () => {
      const errors = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_BELOW',
        thresholdType: 'PERCENTAGE',
        thresholdPrice: 7.5,
        cooldownHours: 12,
      });
      expect(errors).toHaveLength(0);
    });

    test('defaults thresholdType to ABSOLUTE when omitted', () => {
      const errors = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: 100,
      });
      expect(errors).toHaveLength(0);
    });

    test('rejects invalid thresholdType', () => {
      const errors = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdType: 'INVALID_TYPE',
        thresholdPrice: 100,
      });
      expect(errors.some((e) => e.field === 'thresholdType')).toBe(true);
    });

    test('rejects negative or zero threshold', () => {
      const errorsZero = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: 0,
      });
      expect(errorsZero.some((e) => e.field === 'thresholdPrice')).toBe(true);

      const errorsNeg = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: -10,
      });
      expect(errorsNeg.some((e) => e.field === 'thresholdPrice')).toBe(true);
    });

    test('rejects percentage threshold exceeding 1000%', () => {
      const errors = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdType: 'PERCENTAGE',
        thresholdPrice: 1200,
      });
      expect(errors.some((e) => e.field === 'thresholdPrice')).toBe(true);
    });

    test('rejects invalid cooldown hours (out of 1-720 range or non-integer)', () => {
      const err0 = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: 50,
        cooldownHours: 0,
      });
      expect(err0.some((e) => e.field === 'cooldownHours')).toBe(true);

      const errMax = validateCreateRule({
        trackedMaterialId: 1,
        conditionType: 'PRICE_ABOVE',
        thresholdPrice: 50,
        cooldownHours: 800,
      });
      expect(errMax.some((e) => e.field === 'cooldownHours')).toBe(true);
    });

    test('validateUpdateRule accepts new fields', () => {
      const errors = validateUpdateRule({
        thresholdType: 'PERCENTAGE',
        thresholdPrice: 5,
        cooldownHours: 48,
        isActive: false,
      });
      expect(errors).toHaveLength(0);
    });
  });

  /* =========================================================================
   * 2. Absolute Threshold Evaluation
   * ========================================================================= */
  describe('Absolute Threshold Evaluation', () => {
    test('triggers PRICE_ABOVE when currentPrice > thresholdPrice', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '110.00',
        currency: 'INR',
        unit_label: 'kg',
        is_valid: 1,
        recorded_at: '2026-11-09 10:00:00',
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 101,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_type: 'ABSOLUTE',
          threshold_price: '100.00',
          cooldown_hours: 24,
          last_triggered_at: null,
          is_active: 1,
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'PET Resin' });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ email: 'sme@example.com' });
      jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValue(true);
      jest.spyOn(alertEventRepository, 'create').mockResolvedValue({ id: 999, triggered_at: new Date() });
      jest.spyOn(notificationService, 'sendAlertNotification').mockResolvedValue({ id: 'msg-1' });
      jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(1);
      expect(events[0].delivery_status).toBe('SENT');
      expect(alertRuleRepository.claimTriggerCooldown).toHaveBeenCalledWith(101, expect.any(Date), 10);
      expect(notificationService.sendAlertNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'sme@example.com',
          materialName: 'PET Resin',
          conditionType: 'PRICE_ABOVE',
          thresholdType: 'ABSOLUTE',
          thresholdPrice: 100,
          triggeredPrice: 110,
        })
      );
    });

    test('does NOT trigger PRICE_ABOVE when currentPrice <= thresholdPrice', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '95.00',
        currency: 'INR',
        is_valid: 1,
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 102,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_type: 'ABSOLUTE',
          threshold_price: '100.00',
          cooldown_hours: 24,
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'PET Resin' });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ email: 'sme@example.com' });

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(0);
    });

    test('triggers PRICE_BELOW when currentPrice < thresholdPrice', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '85.00',
        currency: 'INR',
        is_valid: 1,
        recorded_at: '2026-11-09 10:00:00',
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 103,
          tracked_material_id: 1,
          condition_type: 'PRICE_BELOW',
          threshold_type: 'ABSOLUTE',
          threshold_price: '90.00',
          cooldown_hours: 24,
          last_triggered_at: null,
          is_active: 1,
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'PET Resin' });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ email: 'sme@example.com' });
      jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValue(true);
      jest.spyOn(alertEventRepository, 'create').mockResolvedValue({ id: 1000, triggered_at: new Date() });
      jest.spyOn(notificationService, 'sendAlertNotification').mockResolvedValue({ id: 'msg-2' });
      jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(1);
      expect(events[0].delivery_status).toBe('SENT');
    });
  });

  /* =========================================================================
   * 3. Percentage Threshold Evaluation
   * ========================================================================= */
  describe('Percentage Threshold Evaluation', () => {
    test('triggers percentage increase alert when change >= threshold', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 2,
        price: '106.00',
        currency: 'INR',
        recorded_at: '2026-11-09 10:00:00',
        is_valid: 1,
      });
      jest.spyOn(priceRepository, 'findPreviousValidPrice').mockResolvedValue({
        id: 1,
        price: '100.00',
        currency: 'INR',
        recorded_at: '2026-11-08 10:00:00',
        is_valid: 1,
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 201,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_type: 'PERCENTAGE',
          threshold_price: '5.00', // 5% increase
          cooldown_hours: 24,
          last_triggered_at: null,
          is_active: 1,
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'Corrugated Box' });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ email: 'boxmaker@example.com' });
      jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValue(true);
      jest.spyOn(alertEventRepository, 'create').mockResolvedValue({ id: 1001, triggered_at: new Date() });
      jest.spyOn(notificationService, 'sendAlertNotification').mockResolvedValue({ id: 'msg-3' });
      jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(1);
      expect(notificationService.sendAlertNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          thresholdType: 'PERCENTAGE',
          thresholdPrice: 5,
          triggeredChangePercent: 6, // ((106 - 100) / 100) * 100 = 6%
        })
      );
    });

    test('skips percentage alert when only 1 price observation exists', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '100.00',
        currency: 'INR',
        is_valid: 1,
      });
      // No previous price point found
      jest.spyOn(priceRepository, 'findPreviousValidPrice').mockResolvedValue(null);
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 202,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_type: 'PERCENTAGE',
          threshold_price: '5.00',
          cooldown_hours: 24,
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'Corrugated Box' });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ email: 'boxmaker@example.com' });

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(0);
    });
  });

  /* =========================================================================
   * 4. Data Integrity: Invalid Prices & Proxy Mislabelling Prevention
   * ========================================================================= */
  describe('Data Integrity & Proxy Mislabelling Rules', () => {
    test('skips evaluation completely if latest price is_valid is false', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '500.00',
        is_valid: 0,
        invalid_reason: 'Spike outlier anomaly detected',
      });
      const listSpy = jest.spyOn(alertRuleRepository, 'listActiveByBusinessId');

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(0);
      expect(listSpy).not.toHaveBeenCalled();
    });

    test('never triggers domestic material alert using unmapped crude proxy', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '78.50',
        currency: 'USD',
        unit_label: 'USD/bbl',
        data_class: 'MARKET_INDICATIVE',
        is_valid: 1,
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 301,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '70.00', // user configured 70 INR/kg
        },
      ]);
      // Tracked material does NOT have external_symbol mapped!
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 1,
        name: 'PET Resin',
        external_symbol: null,
      });

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(0);
    });
  });

  /* =========================================================================
   * 5. Cooldown & Deduplication
   * ========================================================================= */
  describe('Cooldown & Deduplication', () => {
    test('suppresses alert trigger when within cooldown window', async () => {
      const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);

      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '120.00',
        currency: 'INR',
        is_valid: 1,
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 401,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '100.00',
          cooldown_hours: 24,
          last_triggered_at: oneHourAgo, // fired 1 hr ago, cooldown 24h
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'PET Resin' });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ email: 'sme@example.com' });

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(0);
    });

    test('triggers when cooldown period has elapsed', async () => {
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '120.00',
        currency: 'INR',
        is_valid: 1,
        recorded_at: '2026-11-09 10:00:00',
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 402,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '100.00',
          cooldown_hours: 24,
          last_triggered_at: twentyFiveHoursAgo, // 25 hrs ago > 24h cooldown
          is_active: 1,
        },
      ]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'PET Resin' });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ email: 'sme@example.com' });
      jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValue(true);
      jest.spyOn(alertEventRepository, 'create').mockResolvedValue({ id: 1002, triggered_at: new Date() });
      jest.spyOn(notificationService, 'sendAlertNotification').mockResolvedValue({ id: 'msg-4' });
      jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(1);
      expect(events[0].delivery_status).toBe('SENT');
    });
  });

  /* =========================================================================
   * 6. Tenant Isolation
   * ========================================================================= */
  describe('Tenant Isolation', () => {
    test('rule service rejects rule creation for another business material', async () => {
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

      await expect(
        alertRuleService.createRule(10, {
          trackedMaterialId: 999, // belongs to another business
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 100,
        })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });

    test('rule service rejects update for rule belonging to another business', async () => {
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValue(null);

      await expect(
        alertRuleService.updateRule(10, 555, { isActive: false })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
  });

  /* =========================================================================
   * 7. Standalone Cron Job
   * ========================================================================= */
  describe('Standalone Alert Evaluation Job', () => {
    test('skips when ALERT_EVALUATION_ENABLED is false', async () => {
      const originalFlag = env.alertEvaluation.enabled;
      env.alertEvaluation.enabled = false;

      const result = await alertEvaluationJob.runEvaluation();
      expect(result.status).toBe('SKIPPED');
      expect(result.reason).toBe('disabled');

      env.alertEvaluation.enabled = originalFlag;
    });

    test('executes and writes sync status when enabled', async () => {
      const originalFlag = env.alertEvaluation.enabled;
      env.alertEvaluation.enabled = true;

      jest.spyOn(syncStatusRepository, 'upsert').mockResolvedValue(true);
      jest.spyOn(alertEvaluationService, 'evaluateAllActive').mockResolvedValue({
        evaluatedCount: 4,
        triggeredCount: 1,
        events: [{ id: 101, delivery_status: 'SENT' }],
      });

      const result = await alertEvaluationJob.runEvaluation();
      expect(result.status).toBe('SUCCESS');
      expect(result.evaluated).toBe(4);
      expect(result.triggered).toBe(1);
      expect(syncStatusRepository.upsert).toHaveBeenCalledWith(
        'ALERT_EVALUATION',
        expect.objectContaining({ lastStatus: 'SUCCESS' })
      );

      env.alertEvaluation.enabled = originalFlag;
    });
  });

  /* =========================================================================
   * 8. Database Migration 023 Integrity
   * ========================================================================= */
  describe('Migration 023 — Alert Rule Enhancements', () => {
    test('exports up and down functions', () => {
      expect(typeof migration023.up).toBe('function');
      expect(typeof migration023.down).toBe('function');
    });

    test('up() checks information_schema and runs idempotent DDL', async () => {
      const mockPool = {
        query: jest.fn().mockImplementation((sql) => {
          if (sql.includes('TABLE_NAME = \'alert_rules\'')) {
            return [[{ cnt: 0 }]];
          }
          if (sql.includes('TABLE_NAME = \'alert_events\'')) {
            return [[{ cnt: 0 }]];
          }
          return [[]];
        }),
      };

      await migration023.up(mockPool);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('threshold_type')
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ALERT_EVALUATION')
      );
    });
  });

  describe('P1 Security & Concurrency — Atomic Cooldown & Validation', () => {
    test('concurrent evaluateMaterial invocations race atomically: only 1 alert event and 1 email emitted', async () => {
      const { pool } = require('../src/database/connection');
      const ruleRow = {
        id: 501,
        business_id: 10,
        tracked_material_id: 1,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '80.00',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        last_triggered_at: null,
        is_active: true,
        deleted_at: null,
        notification_channel: 'EMAIL',
      };

      const execSpy = jest.spyOn(pool, 'execute').mockImplementation(async (sql, params) => {
        expect(sql).toContain('is_active = TRUE');
        expect(sql).toContain('deleted_at IS NULL');
        expect(sql).toContain('last_triggered_at IS NULL');
        expect(sql).toContain('TIMESTAMPDIFF(SECOND, last_triggered_at');
        expect(sql).toContain('COALESCE(cooldown_hours, 24) * 3600');

        const [ts, targetId, nowTs] = params;
        const cooldownMs = (ruleRow.cooldown_hours ?? 24) * 3600 * 1000;
        const canClaim =
          ruleRow.id === targetId &&
          ruleRow.is_active &&
          ruleRow.deleted_at === null &&
          (ruleRow.last_triggered_at === null ||
            new Date(nowTs).getTime() - new Date(ruleRow.last_triggered_at).getTime() >= cooldownMs);

        if (canClaim) {
          ruleRow.last_triggered_at = ts;
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      });

      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 901,
        price: '95.00',
        currency: 'INR',
        unit_label: null,
        recorded_at: '2026-11-10 10:00:00',
        is_valid: 1,
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([{ ...ruleRow }]);
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 1,
        name: 'PET Resin',
        unit_abbreviation: 'kg',
        external_symbol: null,
      });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ id: 5, email: 'owner@example.com' });
      const createEventSpy = jest.spyOn(alertEventRepository, 'create').mockResolvedValue({
        id: 7001,
        triggered_at: new Date(),
      });
      const sendSpy = jest.spyOn(notificationService, 'sendAlertNotification').mockResolvedValue({ id: 'msg-race' });
      jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);

      const [eventsA, eventsB] = await Promise.all([
        alertEvaluationService.evaluateMaterial(10, 1),
        alertEvaluationService.evaluateMaterial(10, 1),
      ]);

      expect(execSpy).toHaveBeenCalledTimes(2);
      expect(eventsA.length + eventsB.length).toBe(1);
      expect(createEventSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ unitLabel: 'kg' }));
    });

    test('validator rejects cooldownHours: null and boolean/array coercion on create and update', () => {
      expect(
        validateCreateRule({
          trackedMaterialId: 1,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 100,
          cooldownHours: null,
        })
      ).toContainEqual(expect.objectContaining({ field: 'cooldownHours' }));

      expect(
        validateUpdateRule({ cooldownHours: null })
      ).toContainEqual(expect.objectContaining({ field: 'cooldownHours' }));

      expect(
        validateCreateRule({
          trackedMaterialId: true,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: true,
        })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'trackedMaterialId' }),
          expect.objectContaining({ field: 'thresholdPrice' }),
        ])
      );

      expect(
        validateUpdateRule({ thresholdPrice: [50], cooldownHours: true })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'thresholdPrice' }),
          expect.objectContaining({ field: 'cooldownHours' }),
        ])
      );
    });

    test('alertRuleService blocks cooldownHours: null on create and blocks PATCH percentage > 1000 on merged rule state', async () => {
      await expect(
        alertRuleService.createRule(10, {
          trackedMaterialId: 1,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 100,
          cooldownHours: null,
        })
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

      // Existing PERCENTAGE rule + partial PATCH raising thresholdPrice above 1000
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 88,
        business_id: 10,
        tracked_material_id: 1,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '25.00',
        threshold_type: 'PERCENTAGE',
        cooldown_hours: 24,
        is_active: 1,
      });

      await expect(
        alertRuleService.updateRule(10, 88, { thresholdPrice: 5000 })
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });

      // Existing high ABSOLUTE rule + partial PATCH switching thresholdType to PERCENTAGE
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 89,
        business_id: 10,
        tracked_material_id: 1,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '5000.00',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        is_active: 1,
      });

      await expect(
        alertRuleService.updateRule(10, 89, { thresholdType: 'PERCENTAGE' })
      ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    });

    test('migration 026 widens cooldown_hours from TINYINT to SMALLINT cleanly and refuses unsafe rollback > 255', async () => {
      const migration026 = require('../src/migrations/026_widen_alert_rule_cooldown_hours');

      // 1. Widens when DATA_TYPE is tinyint
      const upgradePool = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('information_schema.COLUMNS')) {
            return [[{ DATA_TYPE: 'tinyint' }]];
          }
          return [{}];
        }),
      };
      await migration026.up(upgradePool);
      expect(upgradePool.query).toHaveBeenCalledWith(
        expect.stringContaining('MODIFY COLUMN cooldown_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24')
      );

      // 2. Idempotent skip when already widened
      const idempotentPool = {
        query: jest.fn().mockResolvedValueOnce([[{ DATA_TYPE: 'smallint' }]]),
      };
      await migration026.up(idempotentPool);
      expect(idempotentPool.query).toHaveBeenCalledTimes(1);

      // 3. Unsafe rollback blocked when any row exceeds TINYINT max (255)
      const blockedDownPool = {
        query: jest.fn().mockResolvedValueOnce([[{ cnt: 2 }]]),
      };
      await expect(migration026.down(blockedDownPool)).rejects.toThrow(/cooldown_hours > 255/i);
      expect(blockedDownPool.query).toHaveBeenCalledTimes(1);

      // 4. Safe rollback permitted when cnt === 0
      const safeDownPool = {
        query: jest.fn().mockImplementation(async (sql) => {
          if (sql.includes('COUNT(*)')) {
            return [[{ cnt: 0 }]];
          }
          return [{}];
        }),
      };
      await migration026.down(safeDownPool);
      expect(safeDownPool.query).toHaveBeenCalledWith(
        expect.stringContaining('MODIFY COLUMN cooldown_hours TINYINT UNSIGNED NOT NULL DEFAULT 24')
      );
    });

    test('validates and persists cooldownHours boundary values 255, 256, and 720 while rejecting 721', async () => {
      for (const cooldownHours of [255, 256, 720]) {
        expect(
          validateCreateRule({
            trackedMaterialId: 1,
            conditionType: 'PRICE_ABOVE',
            thresholdPrice: 100,
            cooldownHours,
          })
        ).toEqual([]);
        expect(validateUpdateRule({ cooldownHours })).toEqual([]);
      }

      expect(
        validateCreateRule({
          trackedMaterialId: 1,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 100,
          cooldownHours: 721,
        })
      ).toContainEqual(expect.objectContaining({ field: 'cooldownHours' }));

      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({ id: 1, name: 'Resin' });
      const createRepoSpy = jest.spyOn(alertRuleRepository, 'create').mockImplementation(async (payload) => ({
        id: 300,
        business_id: payload.businessId,
        tracked_material_id: payload.trackedMaterialId,
        condition_type: payload.conditionType,
        threshold_price: payload.thresholdPrice,
        threshold_type: payload.thresholdType,
        cooldown_hours: payload.cooldownHours,
        is_active: 1,
      }));

      for (const cooldownHours of [255, 256, 720]) {
        const rule = await alertRuleService.createRule(10, {
          trackedMaterialId: 1,
          conditionType: 'PRICE_ABOVE',
          thresholdPrice: 120,
          cooldownHours,
        });
        expect(rule.cooldownHours).toBe(cooldownHours);
      }
      expect(createRepoSpy).toHaveBeenCalledTimes(3);

      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 300,
        business_id: 10,
        tracked_material_id: 1,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '120.00',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        is_active: 1,
      });
      jest.spyOn(alertRuleRepository, 'update').mockImplementation(async (_id, merged) => ({
        id: 300,
        tracked_material_id: 1,
        condition_type: merged.conditionType,
        threshold_price: merged.thresholdPrice,
        threshold_type: merged.thresholdType,
        cooldown_hours: merged.cooldownHours,
        is_active: merged.isActive ? 1 : 0,
      }));

      const updated720 = await alertRuleService.updateRule(10, 300, { cooldownHours: 720 });
      expect(updated720.cooldownHours).toBe(720);
    });

    test('evaluateMaterial cooldown pre-check treats null, undefined, and missing cooldown_hours as 24h', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '150.00',
        currency: 'INR',
        is_valid: 1,
      });
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
        id: 1,
        name: 'PET Resin',
      });
      jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValue({ id: 5, email: 'sme@example.com' });
      const claimSpy = jest.spyOn(alertRuleRepository, 'claimTriggerCooldown');

      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 910,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '100.00',
          cooldown_hours: null,
          last_triggered_at: twoHoursAgo,
        },
        {
          id: 911,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '100.00',
          cooldown_hours: undefined,
          last_triggered_at: twoHoursAgo,
        },
        {
          id: 912,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '100.00',
          last_triggered_at: twoHoursAgo,
        },
      ]);

      const events = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(events).toHaveLength(0);
      expect(claimSpy).not.toHaveBeenCalled();
    });

    test('evaluateMaterial skips OFFICIAL_BENCHMARK prices when external_symbol is missing or invalid', async () => {
      jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValue({
        id: 1,
        price: '75.00',
        currency: 'USD',
        unit_label: 'USD/bbl',
        data_class: 'OFFICIAL_BENCHMARK',
        is_valid: 1,
      });
      jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValue([
        {
          id: 920,
          tracked_material_id: 1,
          condition_type: 'PRICE_ABOVE',
          threshold_price: '70.00',
        },
      ]);
      const businessSpy = jest.spyOn(businessRepository, 'findById');

      // 1. Missing external_symbol on OFFICIAL_BENCHMARK row
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 1,
        name: 'PET Resin',
        external_symbol: null,
      });
      const eventsNullSym = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(eventsNullSym).toHaveLength(0);
      expect(businessSpy).not.toHaveBeenCalled();

      // 2. Invalid/unsupported external_symbol on OFFICIAL_BENCHMARK row
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 1,
        name: 'PET Resin',
        external_symbol: 'UNSUPPORTED_FEED',
      });
      const eventsBadSym = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(eventsBadSym).toHaveLength(0);
      expect(businessSpy).not.toHaveBeenCalled();

      // 3. Valid SUPPORTED_SYMBOLS symbol proceeds to evaluation
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({
        id: 1,
        name: 'PET Resin',
        external_symbol: 'WTI',
        unit_abbreviation: 'kg',
      });
      businessSpy.mockResolvedValueOnce({ id: 10, user_id: 5 });
      jest.spyOn(userRepository, 'findById').mockResolvedValueOnce({ id: 5, email: 'sme@example.com' });
      jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValueOnce(true);
      jest.spyOn(alertEventRepository, 'create').mockResolvedValueOnce({ id: 777, triggered_at: new Date() });
      jest.spyOn(notificationService, 'sendAlertNotification').mockResolvedValueOnce({ id: 'msg-wti' });
      jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValueOnce(true);

      const eventsValid = await alertEvaluationService.evaluateMaterial(10, 1);
      expect(eventsValid).toHaveLength(1);
    });

    test('claimTriggerCooldown SQL enforces business_id alongside active, cooldown, and soft-delete predicates', async () => {
      const { pool } = require('../src/database/connection');
      const now = new Date('2026-11-11T10:00:00Z');
      const rowsById = new Map([
        [1, { id: 1, business_id: 10, is_active: true, deleted_at: null, cooldown_hours: 24, last_triggered_at: new Date('2026-11-10T09:59:59Z') }], // 24h+1s elapsed
        [2, { id: 2, business_id: 10, is_active: true, deleted_at: null, cooldown_hours: 24, last_triggered_at: new Date('2026-11-11T05:00:00Z') }], // only 5h elapsed
        [3, { id: 3, business_id: 10, is_active: true, deleted_at: null, cooldown_hours: null, last_triggered_at: new Date('2026-11-11T08:00:00Z') }], // NULL -> COALESCE 24h -> 2h elapsed (blocked)
        [4, { id: 4, business_id: 10, is_active: true, deleted_at: null, cooldown_hours: null, last_triggered_at: new Date('2026-11-09T00:00:00Z') }], // NULL -> COALESCE 24h -> >24h elapsed (claimed)
        [5, { id: 5, business_id: 10, is_active: false, deleted_at: null, cooldown_hours: 24, last_triggered_at: null }], // inactive (blocked)
        [6, { id: 6, business_id: 10, is_active: true, deleted_at: new Date('2026-11-01T00:00:00Z'), cooldown_hours: 24, last_triggered_at: null }], // soft-deleted (blocked)
      ]);

      const execSpy = jest.spyOn(pool, 'execute').mockImplementation(async (sql, params) => {
        expect(sql).toContain('SET last_triggered_at = ?');
        expect(sql).toContain('AND business_id = ?');
        expect(sql).toContain('TIMESTAMPDIFF(SECOND, last_triggered_at, ?) >= COALESCE(cooldown_hours, 24) * 3600');
        const [setTs, targetId, targetBizId, cmpTs] = params;
        expect(setTs).toBe(cmpTs);

        const r = rowsById.get(targetId);
        const effCooldownSec = (r.cooldown_hours ?? 24) * 3600;
        const diffSec = r.last_triggered_at
          ? (cmpTs.getTime() - r.last_triggered_at.getTime()) / 1000
          : Infinity;
        const matched = Boolean(
          r &&
          r.business_id === targetBizId &&
          r.is_active === true &&
          r.deleted_at === null &&
          (r.last_triggered_at === null || diffSec >= effCooldownSec)
        );
        if (matched) {
          r.last_triggered_at = setTs;
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      });

      expect(await alertRuleRepository.claimTriggerCooldown(1, now, 10)).toBe(true);
      expect(await alertRuleRepository.claimTriggerCooldown(2, now, 10)).toBe(false);
      expect(await alertRuleRepository.claimTriggerCooldown(3, now, 10)).toBe(false);
      expect(await alertRuleRepository.claimTriggerCooldown(4, now, 999)).toBe(false); // wrong tenant denied
      expect(await alertRuleRepository.claimTriggerCooldown(4, now, 10)).toBe(true);  // real owning tenant succeeds
      expect(await alertRuleRepository.claimTriggerCooldown(5, now, 10)).toBe(false);
      expect(await alertRuleRepository.claimTriggerCooldown(6, now, 10)).toBe(false);
      expect(execSpy).toHaveBeenCalledTimes(7);
    });
  });
});

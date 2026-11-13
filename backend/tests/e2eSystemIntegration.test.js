/**
 * Phase 12 — End-to-End System Integration QA Test Suite
 *
 * Implements comprehensive verification of the complete platform lifecycle
 * across all frozen specification modules (Document 1 §8 Milestone 9,
 * Document 2 §5.1–§5.10, Document 3 §6–§11, Document 5 §4.1–§4.11):
 *
 * 1. User Registration & Authentication (FR-AUTH-01–06, Document 5 §4.1)
 * 2. Business Onboarding & Profile Creation (FR-BIZ-01–04, Document 5 §4.2)
 * 3. Automatic Template Material Mapping (FR-TPL-01–03, Document 5 §4.4)
 * 4. Manual Supplier Quote & Benchmark Price Logging (FR-PRICE-01–05, Document 5 §4.6)
 * 5. Alert Rule Engine, Notification & Cooldown (FR-ALERT-01–08, Document 5 §4.8)
 * 6. Dashboard Aggregation Payload Consumption (FR-DASH-01–04, Document 5 §4.9)
 * 7. Historical Price Trends & Multi-Material Comparison (FR-HIST-01–03, Document 5 §4.10)
 * 8. System Health Probe & Scheduler State Diagnostics (Document 5 §4.11, Document 3 §15)
 * 9. Multi-Tenant Isolation & IDOR Defense (NFR-SEC-01, Document 5 §2.4)
 */

'use strict';

const authService = require('../src/services/auth.service');
const businessService = require('../src/services/business.service');
const materialTrackingService = require('../src/services/materialTracking.service');
const priceQueryService = require('../src/services/priceQuery.service');
const priceIngestionService = require('../src/services/priceIngestion.service');
const alertRuleService = require('../src/services/alertRule.service');
const alertEvaluationService = require('../src/services/alertEvaluation.service');
const dashboardAggregationService = require('../src/services/dashboardAggregation.service');
const trendQueryService = require('../src/services/trendQuery.service');
const knowledgeBaseService = require('../src/services/knowledgeBase.service');

const healthController = require('../src/controllers/health.controller');
const userRepository = require('../src/repositories/user.repository');
const businessRepository = require('../src/repositories/business.repository');
const materialRepository = require('../src/repositories/material.repository');
const priceRepository = require('../src/repositories/price.repository');
const alertRuleRepository = require('../src/repositories/alertRule.repository');
const alertEventRepository = require('../src/repositories/alertEvent.repository');
const newsRepository = require('../src/repositories/news.repository');
const syncStatusRepository = require('../src/repositories/syncStatus.repository');
const knowledgeBaseRepository = require('../src/repositories/knowledgeBase.repository');
const notificationService = require('../src/services/notification.service');
const { pool } = require('../src/database/connection');
const AppError = require('../src/utils/AppError');

describe('Phase 12 — End-to-End System Integration QA', () => {

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
  // Complete Lifecycle Test Journey
  // =========================================================================
  test('Complete End-to-End Lifecycle: Auth → Onboarding → Template Mapping → Price Ingestion → Alerts → Dashboard → Trends → Health', async () => {

    // -----------------------------------------------------------------------
    // Step 1: User Registration & Authentication (FR-AUTH-01, 04)
    // -----------------------------------------------------------------------
    jest.spyOn(userRepository, 'findByEmail').mockResolvedValueOnce(null);
    jest.spyOn(userRepository, 'create').mockResolvedValueOnce({
      id: 101,
      email: 'founder@pureaqua.in',
      full_name: 'Rajesh Kumar',
    });

    const registeredUser = await authService.registerUser({
      email: 'founder@pureaqua.in',
      password: 'SecurePassword123!',
      fullName: 'Rajesh Kumar',
    });

    expect(registeredUser).toBeDefined();
    expect(registeredUser.id).toBe(101);
    expect(registeredUser.email).toBe('founder@pureaqua.in');

    // -----------------------------------------------------------------------
    // Step 2: Business Onboarding & Profile Creation (FR-BIZ-01, 02)
    // -----------------------------------------------------------------------
    jest.spyOn(businessRepository, 'findByUserId').mockImplementationOnce(async (uid) => {
      expect(uid).toBe(101);
      return null;
    });
    jest.spyOn(businessRepository, 'industryExists').mockImplementationOnce(async (indId) => {
      expect(indId).toBe(1);
      return true;
    });
    jest.spyOn(businessRepository, 'create').mockImplementationOnce(async (payload) => {
      expect(payload).toEqual({
        userId: 101,
        industryId: 1,
        name: 'PureAqua Bottlers Pvt Ltd',
        contactEmail: 'procurement@pureaqua.in',
        contactPhone: undefined,
        address: 'Indore, India',
      });
      return {
        id: 42,
        user_id: 101,
        industry_id: 1,
        name: 'PureAqua Bottlers Pvt Ltd',
        contact_email: 'procurement@pureaqua.in',
        address: 'Indore, India',
      };
    });

    // Strict template material generation mocks matching real signatures and return structure
    jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsForTemplateGeneration').mockImplementationOnce(async (indId) => {
      expect(indId).toBe(1);
      return [
        { id: 1, name: 'PET Resin', default_unit_id: 1, default_external_symbol: 'WTI', industry_slug: 'packaged-drinking-water' },
        { id: 2, name: 'Bottle Caps', default_unit_id: 2, default_external_symbol: null, industry_slug: 'packaged-drinking-water' },
        { id: 3, name: 'Labels', default_unit_id: 2, default_external_symbol: null, industry_slug: 'packaged-drinking-water' },
        { id: 4, name: 'Cartons', default_unit_id: 2, default_external_symbol: null, industry_slug: 'packaged-drinking-water' },
        { id: 5, name: 'Shrink Film', default_unit_id: 1, default_external_symbol: 'WTI', industry_slug: 'packaged-drinking-water' },
      ];
    });
    jest.spyOn(materialRepository, 'bulkCreateFromTemplate').mockImplementationOnce(async (bizId, rawMaterials) => {
      expect(bizId).toBe(42);
      expect(Array.isArray(rawMaterials)).toBe(true);
      expect(rawMaterials).toHaveLength(5);
      expect(rawMaterials[0]).toEqual(expect.objectContaining({ id: 1, external_symbol: 'WTI' }));
      return {
        materialsGenerated: 5,
        createdMaterials: [
          { id: 501, rawMaterialId: 1, businessId: 42, unitId: 1, externalSymbol: 'WTI' },
          { id: 502, rawMaterialId: 2, businessId: 42, unitId: 2, externalSymbol: null },
          { id: 503, rawMaterialId: 3, businessId: 42, unitId: 2, externalSymbol: null },
          { id: 504, rawMaterialId: 4, businessId: 42, unitId: 2, externalSymbol: null },
          { id: 505, rawMaterialId: 5, businessId: 42, unitId: 1, externalSymbol: 'WTI' },
        ],
      };
    });
    jest.spyOn(priceRepository, 'findLatestPriceByExternalSymbol').mockResolvedValue(null);

    const mockTrackedMaterials = [
      { id: 501, business_id: 42, raw_material_id: 1, name: 'PET Resin', unit_abbreviation: 'kg', is_tracked: 1, external_symbol: 'WTI' },
      { id: 502, business_id: 42, raw_material_id: 2, name: 'Bottle Caps', unit_abbreviation: 'pcs', is_tracked: 1, external_symbol: null },
      { id: 503, business_id: 42, raw_material_id: 3, name: 'Labels', unit_abbreviation: 'pcs', is_tracked: 1, external_symbol: null },
      { id: 504, business_id: 42, raw_material_id: 4, name: 'Cartons', unit_abbreviation: 'pcs', is_tracked: 1, external_symbol: null },
      { id: 505, business_id: 42, raw_material_id: 5, name: 'Shrink Film', unit_abbreviation: 'kg', is_tracked: 1, external_symbol: 'WTI' },
    ];
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue(mockTrackedMaterials);

    const createdBusiness = await businessService.createBusiness({
      userId: 101,
      name: 'PureAqua Bottlers Pvt Ltd',
      industryId: 1,
      contactEmail: 'procurement@pureaqua.in',
      address: 'Indore, India',
    });

    expect(createdBusiness.id).toBe(42);
    expect(createdBusiness.industryId).toBe(1);
    expect(createdBusiness.materialsGenerated).toBe(5);
    expect(createdBusiness.materials).toHaveLength(5);

    // -----------------------------------------------------------------------
    // Step 3: Verify Automated Template Material Tracking (FR-TPL-01–03, FR-MAT-01)
    // -----------------------------------------------------------------------
    const materials = await materialTrackingService.listMaterials(42);
    expect(materials).toHaveLength(5);
    expect(materials[0].name).toBe('PET Resin');
    expect(materials[0].externalSymbol).toBe('WTI');
    expect(materials[1].name).toBe('Bottle Caps');

    // -----------------------------------------------------------------------
    // Step 4: Price Logging — Domestic Supplier Quote & Benchmark Feed (FR-PRICE-01, 04)
    // -----------------------------------------------------------------------
    const evaluateMaterialSpy = jest.spyOn(alertEvaluationService, 'evaluateMaterial').mockResolvedValue([]);

    // 4A: Manual supplier quote for domestic SKU (Bottle Caps in INR/pcs)
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(mockTrackedMaterials[1]);
    jest.spyOn(priceRepository, 'create').mockResolvedValueOnce({
      id: 901,
      tracked_material_id: 502,
      price: '0.45',
      recorded_at: '2026-07-18 10:00:00',
      source: 'MANUAL',
      currency: 'INR',
      unit_label: 'pcs',
      data_class: 'SUPPLIER_QUOTE',
      is_valid: 1,
    });

    const manualPrice = await priceIngestionService.addManualPrice(42, 502, {
      price: '0.45',
      recordedAt: '2026-07-18 10:00:00',
      currency: 'INR',
      unitLabel: 'pcs',
    });

    expect(manualPrice.price).toBe('0.45');
    expect(manualPrice.source).toBe('MANUAL');
    expect(evaluateMaterialSpy).toHaveBeenCalledWith(42, 502);

    // 4B: Automated benchmark ingestion for upstream proxy (WTI Crude Oil in USD/bbl)
    jest.spyOn(priceRepository, 'existsByMaterialDateSource').mockResolvedValueOnce(false);
    jest.spyOn(priceRepository, 'create').mockResolvedValueOnce({
      id: 902,
      tracked_material_id: 501,
      price: '76.25',
      recorded_at: '2026-07-18 00:00:00',
      source: 'THIRD_PARTY_API',
      currency: 'USD',
      unit_label: 'USD/bbl',
      data_class: 'OFFICIAL_BENCHMARK',
      is_valid: 1,
    });

    const benchmarkIngestion = await priceIngestionService.ingestFromProvider(
      { id: 501, business_id: 42 },
      { symbol: 'WTI', price: 76.25, recordedAt: '2026-07-18' }
    );

    expect(benchmarkIngestion.status).toBe('inserted');
    expect(evaluateMaterialSpy).toHaveBeenCalledWith(42, 501);

    // Restore real alert evaluation for Step 5
    evaluateMaterialSpy.mockRestore();

    // -----------------------------------------------------------------------
    // Step 5: Alert Rule Creation, Evaluation & Cooldown (FR-ALERT-01, 03, 04, 08)
    // -----------------------------------------------------------------------
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(mockTrackedMaterials[1]); // Bottle Caps
    jest.spyOn(businessRepository, 'findById').mockResolvedValue({ id: 42, user_id: 101, contact_email: 'founder@pureaqua.in' });
    jest.spyOn(userRepository, 'findById').mockResolvedValue({
      id: 101,
      email: 'founder@pureaqua.in',
      full_name: 'Rajesh Kumar',
    });
    jest.spyOn(alertRuleRepository, 'create').mockResolvedValueOnce({
      id: 801,
      business_id: 42,
      tracked_material_id: 502,
      condition_type: 'PRICE_ABOVE',
      threshold_price: '0.50',
      threshold_type: 'ABSOLUTE',
      cooldown_hours: 24,
      is_active: 1,
      last_triggered_at: null,
    });

    const rule = await alertRuleService.createRule(42, {
      trackedMaterialId: 502,
      conditionType: 'PRICE_ABOVE',
      thresholdPrice: '0.50',
      thresholdType: 'ABSOLUTE',
      cooldownHours: 24,
    });

    expect(rule.id).toBe(801);
    expect(rule.thresholdType).toBe('ABSOLUTE');

    // Simulate price hike on Bottle Caps triggering the alert
    jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([
      {
        id: 801,
        business_id: 42,
        tracked_material_id: 502,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '0.50',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        last_triggered_at: null, // Eligible to fire
      },
    ]);
    jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValueOnce({
      id: 903,
      price: '0.55', // Above 0.50 threshold
      recorded_at: '2026-07-18 14:00:00',
      is_valid: 1,
    });
    jest.spyOn(notificationService, 'sendAlertNotification').mockResolvedValueOnce({ messageId: 'resend-123' });
    jest.spyOn(alertEventRepository, 'create').mockResolvedValueOnce({ id: 1001, alert_rule_id: 801, ruleId: 801, triggered_at: new Date() });
    jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue(true);
    jest.spyOn(alertRuleRepository, 'claimTriggerCooldown').mockResolvedValueOnce(true);

    const triggeredEvents = await alertEvaluationService.evaluateMaterial(42, 502);

    expect(triggeredEvents).toHaveLength(1);
    expect(triggeredEvents[0].id).toBe(1001);
    expect(notificationService.sendAlertNotification).toHaveBeenCalled();
    expect(alertRuleRepository.claimTriggerCooldown).toHaveBeenCalledWith(801, expect.any(Date), 42);

    // Verify cooldown defense: subsequent evaluation within 24h skips notification
    jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([
      {
        id: 801,
        business_id: 42,
        tracked_material_id: 502,
        condition_type: 'PRICE_ABOVE',
        threshold_price: '0.50',
        threshold_type: 'ABSOLUTE',
        cooldown_hours: 24,
        last_triggered_at: new Date(), // Cooldown active!
      },
    ]);
    jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValueOnce({
      id: 904,
      price: '0.58',
      recorded_at: '2026-07-18 14:30:00',
      is_valid: 1,
    });

    const cooldownEvents = await alertEvaluationService.evaluateMaterial(42, 502);
    expect(cooldownEvents).toHaveLength(0); // Suppressed by cooldown

    // -----------------------------------------------------------------------
    // Step 6: Dashboard Aggregation Consumption (FR-DASH-01–04)
    // -----------------------------------------------------------------------
    jest.spyOn(businessRepository, 'findById').mockResolvedValueOnce({ id: 42, industry_id: 1 });
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValueOnce([
      { id: 501, name: 'PET Resin', is_tracked: 1 },
      { id: 502, name: 'Bottle Caps', is_tracked: 1 },
    ]);
    jest.spyOn(priceRepository, 'findLatestPricesByMaterialIds').mockResolvedValueOnce([
      { tracked_material_id: 501, price: '76.25', recorded_at: '2026-07-18', currency: 'USD', unit_label: 'USD/bbl', is_valid: 1 },
      { tracked_material_id: 502, price: '0.55', recorded_at: '2026-07-18', currency: 'INR', unit_label: 'pcs', is_valid: 1 },
    ]);
    jest.spyOn(newsRepository, 'listByIndustry').mockResolvedValueOnce([
      { id: 301, title: 'Indian Packaging Polymer Market Outlook', published_at: '2026-07-18' },
    ]);
    jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([
      { id: 801, condition_type: 'PRICE_ABOVE', threshold_price: '0.50', is_active: 1 },
    ]);
    jest.spyOn(alertEventRepository, 'listByBusinessId').mockResolvedValueOnce([
      { id: 1001, triggered_price: '0.55', triggered_at: '2026-07-18' },
    ]);
    jest.spyOn(syncStatusRepository, 'findAll').mockResolvedValueOnce([
      { job_type: 'PRICE_INGESTION', last_run_at: '2026-07-18', last_success_at: '2026-07-18', last_status: 'SUCCESS' },
      { job_type: 'NEWS_INGESTION', last_run_at: '2026-07-18', last_success_at: '2026-07-18', last_status: 'SUCCESS' },
    ]);

    const dashboard = await dashboardAggregationService.getDashboard(42);

    expect(dashboard.trackedMaterials).toHaveLength(2);
    expect(dashboard.recentNews).toHaveLength(1);
    expect(dashboard.activeAlertRules).toHaveLength(1);
    expect(dashboard.recentAlertEvents).toHaveLength(1);
    expect(dashboard.recentAlertEvents[0].triggeredAt).toBe('2026-07-18');
    expect(dashboard.sync.lastPriceSyncAt).toBe('2026-07-18');

    // -----------------------------------------------------------------------
    // Step 7: Historical Trends & Multi-Material Comparison (FR-HIST-01–03)
    // -----------------------------------------------------------------------
    jest.spyOn(materialRepository, 'findByIdForBusiness')
      .mockResolvedValueOnce(mockTrackedMaterials[0]) // 501
      .mockResolvedValueOnce(mockTrackedMaterials[1]); // 502

    jest.spyOn(priceRepository, 'findSeriesForMaterials').mockResolvedValueOnce([
      { tracked_material_id: 501, price: '75.00', recorded_at: '2026-07-01 00:00:00', is_valid: 1 },
      { tracked_material_id: 501, price: '76.25', recorded_at: '2026-07-18 10:00:00', is_valid: 1 },
      { tracked_material_id: 502, price: '0.45', recorded_at: '2026-07-01 00:00:00', is_valid: 1 },
      { tracked_material_id: 502, price: '0.55', recorded_at: '2026-07-18 14:00:00', is_valid: 1 },
    ]);

    const comparison = await trendQueryService.compareMaterials(42, ['501', '502'], {
      from: '2026-07-01',
      to: '2026-07-18', // Tests inclusive end-of-day boundary normalization
    });

    expect(comparison).toHaveLength(2);
    expect(comparison[0].name).toBe('PET Resin');
    expect(comparison[0].series).toHaveLength(2);
    expect(comparison[1].name).toBe('Bottle Caps');
    expect(comparison[1].series).toHaveLength(2);

    // -----------------------------------------------------------------------
    // Step 8: Operational System Health Probe (Document 5 §4.11)
    // -----------------------------------------------------------------------
    const healthReq = {};
    const healthRes = createMockRes();

    jest.spyOn(pool, 'query').mockResolvedValueOnce([[{ '1': 1 }]]);
    jest.spyOn(syncStatusRepository, 'findAll').mockResolvedValueOnce([
      { job_type: 'PRICE_INGESTION', last_run_at: '2026-07-18T05:00:00Z', last_success_at: '2026-07-18T05:00:00Z', last_status: 'SUCCESS' },
      { job_type: 'NEWS_INGESTION', last_run_at: '2026-07-18T05:00:00Z', last_success_at: '2026-07-18T05:00:00Z', last_status: 'SUCCESS' },
    ]);

    await healthController.getHealth(healthReq, healthRes);

    expect(healthRes.status).toHaveBeenCalledWith(200);
    const healthPayload = healthRes.json.mock.calls[0][0];
    expect(healthPayload.success).toBe(true);
    expect(healthPayload.data.status).toBe('ok');
    expect(healthPayload.data.database).toBe('connected');
    expect(healthPayload.data.scheduler.priceIngestion.lastStatus).toBe('SUCCESS');
  });

  // =========================================================================
  // Multi-Tenant Isolation & IDOR Defense (NFR-SEC-01)
  // =========================================================================
  describe('Multi-Tenant Isolation & IDOR Defense across Integrated Platform', () => {

    test('Business B cannot view, query, or mutate Business A materials, prices, rules, or alerts', async () => {
      const businessAId = 42;
      const businessBId = 99;

      // 1. Material Access Guard
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);
      await expect(
        priceQueryService.getLatestPrice(businessBId, 501)
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

      // 2. Material Price History Guard
      jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);
      await expect(
        trendQueryService.getPriceHistory(businessBId, 501, { page: 1, limit: 20 })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

      // 3. Multi-Material Compare Guard
      jest.spyOn(materialRepository, 'findByIdForBusiness')
        .mockImplementation(async (id, busId) => {
          if (busId === businessAId) return { id, name: 'Material' };
          return null; // Forbidden for Business B
        });

      await expect(
        trendQueryService.compareMaterials(businessBId, ['501', '502'], {})
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

      // 4. Alert Rule Modification Guard
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);
      await expect(
        alertRuleService.updateRule(businessBId, 801, { thresholdPrice: '1.00' })
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

      // 5. Alert Rule Deletion Guard
      jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);
      await expect(
        alertRuleService.deleteRule(businessBId, 801)
      ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });

  });

});

/**
 * End-to-End User Flow Integration Test (Step 4 Product QA)
 *
 * Exercises the complete V1 user lifecycle across all layers:
 * 1. Register & Login (JWT auth + bcrypt)
 * 2. Business Onboarding (Profile creation + template materials)
 * 3. Material Tracking (Track/untrack, custom material, external symbol)
 * 4. Manual Price Entry & History Query
 * 5. Automatic Price Ingestion (EIA provider flow)
 * 6. News Ingestion & Relevance Tagging
 * 7. AI Insight Generation & Retrieval
 * 8. Alert Rule Creation & Price-Triggered Email Evaluation
 * 9. Dashboard Aggregation
 * 10. Historical Trends & Compare
 * 11. Cross-Business Isolation (IDOR defence)
 * 12. Token Refresh & Password Reset lifecycle
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

jest.mock('../src/services/notification.service', () => ({
  sendAlertNotification: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
}));

jest.mock('../src/providers/gemini.provider', () => ({
  generateInsight: jest.fn(),
  ProviderError: class ProviderError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  },
}));

jest.mock('../src/providers/eia.provider', () => ({
  fetchLatestPrices: jest.fn(),
  ProviderError: class ProviderError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  },
}));

const authService = require('../src/services/auth.service');
const businessService = require('../src/services/business.service');
const materialTrackingService = require('../src/services/materialTracking.service');
const priceQueryService = require('../src/services/priceQuery.service');
const priceIngestionService = require('../src/services/priceIngestion.service');
const trendQueryService = require('../src/services/trendQuery.service');
const alertRuleService = require('../src/services/alertRule.service');
const alertEvaluationService = require('../src/services/alertEvaluation.service');
const newsQueryService = require('../src/services/newsQuery.service');
const { filterRelevantNews } = require('../src/utils/newsRelevance');
const aiInsightService = require('../src/services/aiInsight.service');
const aiInsightQueryService = require('../src/services/aiInsightQuery.service');
const dashboardService = require('../src/services/dashboardAggregation.service');

const userRepository = require('../src/repositories/user.repository');
const businessRepository = require('../src/repositories/business.repository');
const materialRepository = require('../src/repositories/material.repository');
const priceRepository = require('../src/repositories/price.repository');
const alertRuleRepository = require('../src/repositories/alertRule.repository');
const alertEventRepository = require('../src/repositories/alertEvent.repository');
const newsRepository = require('../src/repositories/news.repository');
const aiInsightRepository = require('../src/repositories/aiInsight.repository');
const templateGenService = require('../src/services/templateGeneration.service');
const notificationService = require('../src/services/notification.service');
const geminiProvider = require('../src/providers/gemini.provider');
const eiaProvider = require('../src/providers/eia.provider');

describe('Full V1 End-to-End Product Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Complete Flow: Register → Onboard → Track → Price → News → AI → Alert → Dashboard → Trends → Auth lifecycle', async () => {
    // =========================================================================
    // STEP 1: Registration & Authentication
    // =========================================================================
    jest.spyOn(userRepository, 'findByEmail').mockResolvedValueOnce(null);
    jest.spyOn(userRepository, 'create').mockResolvedValueOnce({
      id: 1,
      email: 'owner@packagingcorp.com',
      full_name: 'Jane Doe',
    });

    const registered = await authService.registerUser({
      email: 'owner@packagingcorp.com',
      password: 'SecurePassword123!',
      fullName: 'Jane Doe',
    });

    expect(registered).toEqual({
      id: 1,
      email: 'owner@packagingcorp.com',
      fullName: 'Jane Doe',
    });

    // Authenticate with valid credentials
    const { hashPassword } = require('../src/utils/hash');
    const passwordHash = await hashPassword('SecurePassword123!');

    jest.spyOn(userRepository, 'findByEmail').mockResolvedValueOnce({
      id: 1,
      email: 'owner@packagingcorp.com',
      full_name: 'Jane Doe',
      password_hash: passwordHash,
    });
    jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce({ id: 10 });

    const authResult = await authService.authenticate({
      email: 'owner@packagingcorp.com',
      password: 'SecurePassword123!',
    });

    expect(authResult).toHaveProperty('accessToken');
    expect(authResult).toHaveProperty('refreshToken');
    expect(typeof authResult.accessToken).toBe('string');
    expect(authResult.expiresIn).toBeGreaterThan(0);

    // =========================================================================
    // STEP 2: Business Onboarding
    // =========================================================================
    jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce(null);
    jest.spyOn(businessRepository, 'industryExists').mockResolvedValueOnce(true);
    jest.spyOn(businessRepository, 'create').mockResolvedValueOnce({
      id: 10,
      user_id: 1,
      industry_id: 1,
      name: 'Packaging Solutions Ltd',
    });
    jest.spyOn(templateGenService, 'generateTemplate').mockResolvedValueOnce({
      materialsGenerated: 3,
    });

    const business = await businessService.createBusiness({
      userId: 1,
      industryId: 1,
      name: 'Packaging Solutions Ltd',
      contactEmail: 'contact@packagingsolutions.com',
      contactPhone: '+1-555-0199',
      address: '100 Industrial Parkway',
    });

    expect(business.id).toBe(10);
    expect(business.name).toBe('Packaging Solutions Ltd');
    expect(business.materialsGenerated).toBe(3);

    // =========================================================================
    // STEP 3: Material Tracking & Custom Material Management
    // =========================================================================
    const sampleMaterials = [
      { id: 101, raw_material_id: 1, name: 'PET Resin', unit_abbreviation: 'kg', is_tracked: 1, external_symbol: null, created_at: '2026-09-01' },
      { id: 102, raw_material_id: 2, name: 'Cartons', unit_abbreviation: 'units', is_tracked: 0, external_symbol: null, created_at: '2026-09-01' },
    ];
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValueOnce(sampleMaterials);

    const materials = await materialTrackingService.listMaterials(10);
    expect(materials.length).toBe(2);
    expect(materials[0].name).toBe('PET Resin');
    expect(materials[0].isTracked).toBe(true);

    // Toggle track status
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(sampleMaterials[1]);
    jest.spyOn(materialRepository, 'updateTrackingStatus').mockResolvedValueOnce({
      ...sampleMaterials[1],
      is_tracked: 1,
    });

    const updatedMaterial = await materialTrackingService.updateMaterial(10, 102, { isTracked: true });
    expect(updatedMaterial.isTracked).toBe(true);

    // Link commodity external symbol
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(sampleMaterials[0]);
    jest.spyOn(materialRepository, 'updateExternalSymbol').mockResolvedValueOnce({
      ...sampleMaterials[0],
      external_symbol: 'WTI',
    });

    const symbolUpdated = await materialTrackingService.setExternalSymbol(10, 101, 'WTI');
    expect(symbolUpdated.externalSymbol).toBe('WTI');

    // =========================================================================
    // STEP 4: Manual Price Entry & Price History
    // =========================================================================
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(sampleMaterials[0]);
    jest.spyOn(priceRepository, 'create').mockResolvedValueOnce({
      id: 501,
      tracked_material_id: 101,
      price: '95.50',
      recorded_at: '2026-09-15 00:00:00',
      source: 'MANUAL',
    });
    // Alert evaluation trigger inside addManualPrice
    jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValueOnce({
      price: '95.50',
      recorded_at: '2026-09-15 00:00:00',
      source: 'MANUAL',
    });
    jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([]);

    const addedPrice = await priceIngestionService.addManualPrice(10, 101, {
      price: 95.50,
      recordedAt: '2026-09-15',
    });
    expect(addedPrice.price).toBe('95.50');

    // Query latest price
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(sampleMaterials[0]);
    jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValueOnce({
      price: '95.50',
      recorded_at: '2026-09-15',
      source: 'MANUAL',
    });

    const latestPrice = await priceQueryService.getLatestPrice(10, 101);
    expect(latestPrice.price).toBe('95.50');

    // =========================================================================
    // STEP 5: Automatic EIA Price Flow
    // =========================================================================
    jest.spyOn(priceRepository, 'existsByMaterialDateSource').mockResolvedValueOnce(false);
    jest.spyOn(priceRepository, 'create').mockResolvedValueOnce({ id: 502 });
    // Alert evaluation trigger inside ingestFromProvider
    jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValueOnce({
      price: '72.40',
      recorded_at: '2026-09-16 00:00:00',
      source: 'THIRD_PARTY_API',
    });
    jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([]);

    const eiaResult = await priceIngestionService.ingestFromProvider(
      { id: 101, business_id: 10 },
      { symbol: 'WTI', price: 72.40, recordedAt: '2026-09-16' }
    );
    expect(eiaResult.status).toBe('inserted');
    expect(eiaResult.trackedMaterialId).toBe(101);

    // =========================================================================
    // STEP 6: News Ingestion & Relevance Filtering
    // =========================================================================
    const candidateArticles = [
      { title: 'Global packaging demand expands in 2026', source_name: 'Plastics Today', published_at: '2026-09-15T12:00:00Z' },
      { title: 'Unrelated automotive news', source_name: 'Auto Weekly', published_at: '2026-09-15T10:00:00Z' },
    ];

    const relevant = filterRelevantNews(candidateArticles, 'PET Resin', ['packaging', 'plastics'], 5);
    expect(relevant.length).toBe(1);
    expect(relevant[0].title).toContain('packaging demand');

    // =========================================================================
    // STEP 7: AI Market Intelligence Flow
    // =========================================================================
    const mockInsight = {
      headline: 'PET Resin price adjusted downward to 72.40.',
      what_happened: 'Observed prices moved from 95.50 to 72.40 on 2026-09-16.',
      why_it_happened: 'Causal evidence not found in the available data.',
      business_impact: 'Procurement costs for packaging materials may decrease.',
      outlook: 'BEARISH',
      confidence: 'LOW',
    };
    geminiProvider.generateInsight.mockResolvedValueOnce(mockInsight);
    jest.spyOn(aiInsightRepository, 'create').mockResolvedValueOnce({
      id: 801,
      tracked_material_id: 101,
      business_id: 10,
      ...mockInsight,
      model_used: 'gemini-3.6-flash',
      generated_at: new Date(),
    });

    const aiGenResult = await aiInsightService.generateAndStore({
      trackedMaterialId: 101,
      businessId: 10,
      materialName: 'PET Resin',
      prices: [
        { price: 100.0, recorded_at: '2026-09-01' },
        { price: 95.50, recorded_at: '2026-09-08' },
        { price: 72.40, recorded_at: '2026-09-16' },
      ],
      newsHeadlines: relevant,
    });

    expect(aiGenResult.status).toBe('generated');
    expect(aiGenResult.insight.why_it_happened).toBe('Causal evidence not found in the available data.');
    expect(aiGenResult.insight.confidence).toBe('LOW');

    // AI Read API
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(sampleMaterials[0]);
    jest.spyOn(aiInsightRepository, 'findLatestByMaterial').mockResolvedValueOnce(aiGenResult.insight);

    const latestInsight = await aiInsightQueryService.getLatestInsight(10, 101);
    expect(latestInsight.headline).toContain('PET Resin');
    expect(latestInsight).not.toHaveProperty('business_id'); // verified clean public contract

    // =========================================================================
    // STEP 8: Alert Rules & Evaluation
    // =========================================================================
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(sampleMaterials[0]);
    jest.spyOn(alertRuleRepository, 'create').mockResolvedValueOnce({
      id: 201,
      tracked_material_id: 101,
      condition_type: 'PRICE_ABOVE',
      threshold_price: '70.00',
      is_active: 1,
    });

    const rule = await alertRuleService.createRule(10, {
      trackedMaterialId: 101,
      conditionType: 'PRICE_ABOVE',
      thresholdPrice: 70.00,
    });
    expect(rule.id).toBe(201);
    expect(rule.conditionType).toBe('PRICE_ABOVE');

    // Alert Evaluation
    jest.spyOn(priceRepository, 'findLatestByMaterialId').mockResolvedValueOnce({ price: '72.40' });
    jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([
      { id: 201, tracked_material_id: 101, condition_type: 'PRICE_ABOVE', threshold_price: '70.00', is_active: 1 },
    ]);
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce({ name: 'PET Resin' });
    jest.spyOn(businessRepository, 'findById').mockResolvedValueOnce({ user_id: 1, contact_email: 'owner@packagingcorp.com' });
    jest.spyOn(userRepository, 'findById').mockResolvedValueOnce({ email: 'owner@packagingcorp.com' });
    jest.spyOn(alertEventRepository, 'create').mockResolvedValueOnce({
      id: 901,
      triggered_at: '2026-09-16T10:00:00Z',
    });
    jest.spyOn(alertEventRepository, 'updateDeliveryStatus').mockResolvedValue();

    const triggeredEvents = await alertEvaluationService.evaluateMaterial(10, 101);
    expect(triggeredEvents.length).toBe(1);
    expect(triggeredEvents[0].delivery_status).toBe('SENT');
    expect(notificationService.sendAlertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@packagingcorp.com',
        materialName: 'PET Resin',
        conditionType: 'PRICE_ABOVE',
        triggeredPrice: 72.40,
      })
    );

    // =========================================================================
    // STEP 9: Dashboard Aggregation
    // =========================================================================
    jest.spyOn(businessRepository, 'findById').mockResolvedValueOnce({ id: 10, industry_id: 1 });
    jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValueOnce(sampleMaterials);
    jest.spyOn(priceRepository, 'findLatestPricesByMaterialIds').mockResolvedValueOnce([
      { tracked_material_id: 101, price: '72.40', recorded_at: '2026-09-16' },
    ]);
    jest.spyOn(newsRepository, 'listByIndustry').mockResolvedValueOnce([]);
    jest.spyOn(alertRuleRepository, 'listActiveByBusinessId').mockResolvedValueOnce([
      { id: 201, condition_type: 'PRICE_ABOVE', threshold_price: '70.00', is_active: 1 },
    ]);
    jest.spyOn(alertEventRepository, 'listByBusinessId').mockResolvedValueOnce([
      { id: 901, triggered_at: '2026-09-16T10:00:00Z' },
    ]);
    const syncStatusRepo = require('../src/repositories/syncStatus.repository');
    jest.spyOn(syncStatusRepo, 'findAll').mockResolvedValueOnce([]);

    const dashboard = await dashboardService.getDashboard(10);
    expect(dashboard).toHaveProperty('trackedMaterials');
    expect(dashboard).toHaveProperty('activeAlertRules');
    expect(dashboard).toHaveProperty('recentAlertEvents');
    expect(dashboard).toHaveProperty('sync');
    expect(dashboard.trackedMaterials.length).toBe(1); // Only PET Resin is tracked (isTracked: 1)
    expect(dashboard.trackedMaterials[0].latestPrice).toBe('72.40');

    // =========================================================================
    // STEP 10: Trends & Historical Comparison
    // =========================================================================
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(sampleMaterials[0]);
    jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValueOnce([
      { price: '100.00', recorded_at: '2026-09-01' },
      { price: '72.40',  recorded_at: '2026-09-16' },
    ]);
    jest.spyOn(priceRepository, 'countHistoryForMaterial').mockResolvedValueOnce(2);

    const history = await trendQueryService.getPriceHistory(10, 101, { page: 1, limit: 20, offset: 0 });
    expect(history.items.length).toBe(2);
    expect(history.meta.total).toBe(2);

    // =========================================================================
    // STEP 11: Cross-Business Data Isolation (Anti-IDOR)
    // =========================================================================
    // Business 20 attempts to access Business 10's material 101 -> MUST be rejected with 404
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

    await expect(
      materialTrackingService.updateMaterial(20, 101, { isTracked: false })
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    // Business 20 attempts to delete Business 10's alert rule 201 -> MUST be rejected with 404
    jest.spyOn(alertRuleRepository, 'findByIdForBusiness').mockResolvedValueOnce(null);

    await expect(
      alertRuleService.deleteRule(20, 201)
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });

    // =========================================================================
    // STEP 12: Session Refresh & Password Reset Lifecycle
    // =========================================================================
    // Refresh access token
    jest.spyOn(userRepository, 'findById').mockResolvedValueOnce({ id: 1, email: 'owner@packagingcorp.com' });
    jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce({ id: 10 });

    const refreshed = await authService.refreshAccessToken(authResult.refreshToken);
    expect(refreshed).toHaveProperty('accessToken');
    expect(refreshed.expiresIn).toBeGreaterThan(0);

    // Request & confirm password reset
    const userTokenRepository = require('../src/repositories/userToken.repository');
    jest.spyOn(userRepository, 'findByEmail').mockResolvedValueOnce({ id: 1 });
    jest.spyOn(userTokenRepository, 'invalidateActiveTokensForUser').mockResolvedValue();
    jest.spyOn(userTokenRepository, 'create').mockResolvedValue();

    await authService.requestPasswordReset('owner@packagingcorp.com');

    // Confirm password reset with token
    jest.spyOn(userTokenRepository, 'findValidByHash').mockResolvedValueOnce({ id: 99, user_id: 1 });
    jest.spyOn(userRepository, 'updatePassword').mockResolvedValue();
    jest.spyOn(userTokenRepository, 'markConsumed').mockResolvedValue();

    await authService.confirmPasswordReset('dummytoken123', 'BrandNewPassword123!');
    expect(userRepository.updatePassword).toHaveBeenCalled();
    expect(userTokenRepository.markConsumed).toHaveBeenCalledWith(99);
  });
});

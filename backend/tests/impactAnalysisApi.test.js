/**
 * Read-Only Multi-Hop Impact Analysis API Tests (BMM V2 — T-05).
 *
 * Verifies:
 *   1. Route registration & auth protection on `GET /:materialId/impact-analysis`
 *      with zero mutation/synchronous-LLM-trigger routes.
 *   2. Missing auth -> 401 UNAUTHORIZED.
 *   3. Tenant isolation: foreign tracked material -> 404 NOT_FOUND.
 *   4. Strict validation: non-integer materialId or invalid maxDepth -> 400 VALIDATION_ERROR;
 *      maxDepth > 4 clamps cleanly to hard ceiling 4.
 *   5. Server-resolved industry_id (ignores attacker-supplied ?industryId= query param).
 *   6. Zero synchronous geminiProvider.generateInsight() invocations on GET.
 *   7. UI-ready contract separating `kb_impact` (structural_only) from
 *      `empirical_evidence` (observed_data_only) and `latest_ai_insight` (or null).
 *   8. Custom material (`raw_material_id: null`) returns 200 gracefully.
 */

'use strict';

jest.mock('../src/database/connection', () => ({
  pool: { execute: jest.fn().mockResolvedValue([[]]) },
}));

jest.mock('../src/providers/gemini.provider', () => ({
  generateInsight: jest.fn(),
  ProviderError: class ProviderError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = 'ProviderError';
    }
  },
}));

const authMiddleware = require('../src/middleware/auth.middleware');
const aiInsightController = require('../src/controllers/aiInsight.controller');
const aiInsightsMaterialRouter = require('../src/routes/aiInsightsMaterial.routes');
const materialRepository = require('../src/repositories/material.repository');
const businessRepository = require('../src/repositories/business.repository');
const knowledgeBaseRepository = require('../src/repositories/knowledgeBase.repository');
const priceRepository = require('../src/repositories/price.repository');
const newsRepository = require('../src/repositories/news.repository');
const aiInsightRepository = require('../src/repositories/aiInsight.repository');
const geminiProvider = require('../src/providers/gemini.provider');

describe('GET /api/v1/materials/:materialId/impact-analysis', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  function createMockRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  test('1. route is registered on aiInsightsMaterial.routes.js as read-only GET with authMiddleware', () => {
    const impactLayers = aiInsightsMaterialRouter.stack.filter(
      (layer) => layer.route && layer.route.path === '/:materialId/impact-analysis'
    );

    expect(impactLayers).toHaveLength(1);
    const route = impactLayers[0].route;
    expect(route.methods).toEqual({ get: true });
    const middlewares = route.stack.map((s) => s.handle);
    expect(middlewares).toContain(authMiddleware);
    expect(middlewares).toContain(aiInsightController.getImpactAnalysis);
  });

  test('2. unauthenticated request forwards 401 UNAUTHORIZED', async () => {
    const req = { auth: null, params: { materialId: '10' }, query: {} };
    const res = createMockRes();
    const next = jest.fn();

    await aiInsightController.getImpactAnalysis(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(geminiProvider.generateInsight).not.toHaveBeenCalled();
  });

  test('3. foreign or non-existent material enforces 404 NOT_FOUND tenant isolation', async () => {
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue(null);

    const req = { auth: { userId: 7, businessId: 5 }, params: { materialId: '999' }, query: {} };
    const res = createMockRes();
    const next = jest.fn();

    await aiInsightController.getImpactAnalysis(req, res, next);

    expect(materialRepository.findByIdForBusiness).toHaveBeenCalledWith(999, 5);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(geminiProvider.generateInsight).not.toHaveBeenCalled();
  });

  test('4. rejects malformed materialId or invalid maxDepth with 400 VALIDATION_ERROR', async () => {
    const next1 = jest.fn();
    await aiInsightController.getImpactAnalysis(
      { auth: { userId: 7, businessId: 5 }, params: { materialId: 'abc' }, query: {} },
      createMockRes(),
      next1
    );
    expect(next1.mock.calls[0][0].statusCode).toBe(400);
    expect(next1.mock.calls[0][0].code).toBe('VALIDATION_ERROR');

    const next2 = jest.fn();
    await aiInsightController.getImpactAnalysis(
      { auth: { userId: 7, businessId: 5 }, params: { materialId: '10' }, query: { maxDepth: '0' } },
      createMockRes(),
      next2
    );
    expect(next2.mock.calls[0][0].statusCode).toBe(400);
    expect(next2.mock.calls[0][0].code).toBe('VALIDATION_ERROR');
  });

  test('5. returns UI-ready multi-hop analysis using server-resolved industryId and zero Gemini calls', async () => {
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
      id: 10,
      raw_material_id: 2,
      name: 'PET Resin',
      unit_abbreviation: 'kg',
      is_tracked: 1,
    });
    jest.spyOn(businessRepository, 'findById').mockResolvedValue({
      id: 5,
      industry_id: 1,
    });
    const kbSpy = jest
      .spyOn(knowledgeBaseRepository, 'getMultiHopImpactEdges')
      .mockResolvedValue([
        {
          dependency_id: 11,
          depth: 1,
          source_entity_type: 'RAW_MATERIAL',
          source_entity_id: 2,
          source_entity_name: 'PET Resin',
          target_entity_type: 'COST_DRIVER',
          target_entity_id: 20,
          target_entity_name: 'Transportation',
          dependency_type: 'INFLUENCES',
          description: null,
        },
        {
          dependency_id: 12,
          depth: 2,
          source_entity_type: 'COST_DRIVER',
          source_entity_id: 20,
          source_entity_name: 'Transportation',
          target_entity_type: 'EXTERNAL_FACTOR',
          target_entity_id: 30,
          target_entity_name: 'Fuel Price Changes',
          dependency_type: 'DRIVES_COST',
          description: 'Diesel moves freight costs.',
        },
      ]);

    const today = new Date().toISOString().slice(0, 10);
    jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValue([
      { id: 1, price: '95.00', recorded_at: today, is_valid: 1 },
      { id: 2, price: '96.50', recorded_at: today, is_valid: 1 },
      { id: 3, price: '98.00', recorded_at: today, is_valid: 1 },
    ]);
    jest.spyOn(newsRepository, 'listRecentByIndustry').mockResolvedValue([
      {
        id: 51,
        title: 'Diesel and fuel price hike pushes freight rates higher',
        source_name: 'Economic Times',
        published_at: today,
      },
      {
        id: 52,
        title: 'Unrelated dairy cold storage story',
        source_name: 'Daily',
        published_at: today,
      },
    ]);
    jest.spyOn(aiInsightRepository, 'findLatestByMaterial').mockResolvedValue({
      id: 90,
      tracked_material_id: 10,
      business_id: 5,
      headline: 'PET Resin prices edged higher.',
      what_happened: 'Observed price moved from 95.00 to 98.00.',
      why_it_happened: 'Fuel price headlines indicate transport pressure.',
      business_impact: 'Packaging costs may increase.',
      outlook: 'BULLISH',
      confidence: 'LOW',
      evidence_price_range: '95.00-98.00',
      evidence_price_points_count: 3,
      evidence_news_count: 1,
      model_used: 'gemini-1.5-flash',
      generated_at: new Date(),
    });

    // Attacker passes spoofed industryId & excessive maxDepth
    const req = {
      auth: { userId: 7, businessId: 5 },
      params: { materialId: '10' },
      query: { industryId: '999', maxDepth: '10' },
    };
    const res = createMockRes();
    const next = jest.fn();

    await aiInsightController.getImpactAnalysis(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(kbSpy).toHaveBeenCalledWith(2, 1, { maxDepth: 4, maxPaths: 25 });
    expect(geminiProvider.generateInsight).not.toHaveBeenCalled();

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.industry_id).toBe(1);
    expect(payload.data.kb_impact.evidence_classification).toBe('structural_only');
    expect(payload.data.kb_impact.coverage).toBe('multi_hop');
    expect(payload.data.kb_impact.max_depth_applied).toBe(4);
    expect(payload.data.kb_impact.chains).toHaveLength(1);
    expect(payload.data.kb_impact.chains[0].depth).toBe(2);
    expect(payload.data.empirical_evidence.evidence_classification).toBe('observed_data_only');
    expect(payload.data.empirical_evidence.relevant_news).toHaveLength(1);
    expect(payload.data.empirical_evidence.relevant_news[0].id).toBe(51);
    expect(payload.data.latest_ai_insight.id).toBe(90);
  });

  test('6. custom material and missing stored insight return clean 200 empty-state contract', async () => {
    jest.spyOn(materialRepository, 'findByIdForBusiness').mockResolvedValue({
      id: 22,
      raw_material_id: null,
      name: 'Custom Valve',
      unit_abbreviation: 'pc',
      is_tracked: 1,
    });
    jest.spyOn(businessRepository, 'findById').mockResolvedValue({
      id: 5,
      industry_id: 1,
    });
    const kbSpy = jest.spyOn(knowledgeBaseRepository, 'getMultiHopImpactEdges');
    jest.spyOn(priceRepository, 'findHistoryForMaterial').mockResolvedValue([]);
    jest.spyOn(newsRepository, 'listRecentByIndustry').mockResolvedValue([]);
    jest.spyOn(aiInsightRepository, 'findLatestByMaterial').mockResolvedValue(null);

    const req = { auth: { userId: 7, businessId: 5 }, params: { materialId: '22' }, query: {} };
    const res = createMockRes();
    const next = jest.fn();

    await aiInsightController.getImpactAnalysis(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(kbSpy).not.toHaveBeenCalled();
    expect(geminiProvider.generateInsight).not.toHaveBeenCalled();

    const data = res.json.mock.calls[0][0].data;
    expect(data.material.is_custom).toBe(true);
    expect(data.kb_impact.coverage).toBe('custom_material_no_kb_links');
    expect(data.kb_impact.chains).toEqual([]);
    expect(data.empirical_evidence.signal_assessment.has_minimum_price_evidence).toBe(false);
    expect(data.latest_ai_insight).toBeNull();
  });
});

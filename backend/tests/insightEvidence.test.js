/**
 * Phase 3: Evidence Traceability & News Linking Tests.
 *
 * Verifies:
 * 1. Migration 024 creates junction tables with foreign keys and CASCADE delete.
 * 2. news.repository listRecentByIndustry returns article id and url.
 * 3. price.repository findHistoryForMaterial returns price point id and metadata.
 * 4. aiInsight.repository links news and price evidence with duplicate suppression.
 * 5. aiInsight.repository retrieves linked news and price evidence for an insight.
 * 6. aiInsightQuery.service getLatestInsight embeds linked evidence.
 * 7. aiInsightQuery.service getInsightEvidence enforces strict tenant isolation (404 for wrong business).
 * 8. aiInsight.service generateAndStore filters invalid prices from the 3-point evidence floor.
 * 9. aiInsight.service buildPrompt includes currency, unit, data_class, and proxy warning instructions.
 * 10. aiInsight.controller getEvidence endpoint handles auth and tenant scoping.
 */

'use strict';

const mockPool = {
  execute: jest.fn().mockResolvedValue([[]]),
};

jest.mock('../src/database/connection', () => ({
  pool: mockPool,
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

const migration024 = require('../src/migrations/024_create_ai_insight_evidence_tables');
const aiInsightRepo = require('../src/repositories/aiInsight.repository');
const newsRepo = require('../src/repositories/news.repository');
const priceRepo = require('../src/repositories/price.repository');
const aiInsightService = require('../src/services/aiInsight.service');
const aiInsightQueryService = require('../src/services/aiInsightQuery.service');
const aiInsightController = require('../src/controllers/aiInsight.controller');
const geminiProvider = require('../src/providers/gemini.provider');
const materialRepo = require('../src/repositories/material.repository');
const AppError = require('../src/utils/AppError');

describe('Phase 3: Migration 024 (ai_insight_evidence_tables)', () => {
  test('1. migration up executes CREATE TABLE for news and price junction tables', async () => {
    const localPool = { execute: jest.fn().mockResolvedValue([{}]) };
    await migration024.up(localPool);

    expect(localPool.execute).toHaveBeenCalledTimes(2);
    const sql1 = localPool.execute.mock.calls[0][0];
    const sql2 = localPool.execute.mock.calls[1][0];

    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS ai_insight_evidence_news');
    expect(sql1).toContain('FOREIGN KEY (ai_insight_id) REFERENCES ai_insights(id) ON DELETE CASCADE');
    expect(sql1).toContain('FOREIGN KEY (news_item_id) REFERENCES news_items(id) ON DELETE CASCADE');

    expect(sql2).toContain('CREATE TABLE IF NOT EXISTS ai_insight_evidence_prices');
    expect(sql2).toContain('FOREIGN KEY (ai_insight_id) REFERENCES ai_insights(id) ON DELETE CASCADE');
    expect(sql2).toContain('FOREIGN KEY (price_point_id) REFERENCES price_points(id) ON DELETE CASCADE');
  });

  test('2. migration down executes DROP TABLE for both junction tables', async () => {
    const localPool = { execute: jest.fn().mockResolvedValue([{}]) };
    await migration024.down(localPool);

    expect(localPool.execute).toHaveBeenCalledTimes(2);
    expect(localPool.execute.mock.calls[0][0]).toContain('DROP TABLE IF EXISTS ai_insight_evidence_prices');
    expect(localPool.execute.mock.calls[1][0]).toContain('DROP TABLE IF EXISTS ai_insight_evidence_news');
  });
});

describe('Phase 3: Repository Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('3. news.repository listRecentByIndustry selects id and url', async () => {
    const mockRows = [
      { id: 10, title: 'Crude climbs', url: 'https://news.com/1', source_name: 'Reuters', published_at: '2026-09-10' },
    ];
    mockPool.execute.mockResolvedValueOnce([mockRows]);

    const result = await newsRepo.listRecentByIndustry(1, 5);
    expect(result).toEqual(mockRows);
    const query = mockPool.execute.mock.calls[0][0];
    expect(query).toContain('ni.id');
    expect(query).toContain('ni.url');
    expect(query).toContain('ni.title');
    expect(query).toContain('ni.source_name');
  });

  test('4. aiInsight.repository linkEvidenceNews builds parameterized INSERT IGNORE', async () => {
    mockPool.execute.mockResolvedValueOnce([{}]);

    await aiInsightRepo.linkEvidenceNews(100, [10, 20, 10]); // duplicate 10 should be deduplicated
    expect(mockPool.execute).toHaveBeenCalledTimes(1);

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toContain('INSERT IGNORE INTO ai_insight_evidence_news');
    expect(params).toEqual([100, 10, 100, 20]);
  });

  test('5. aiInsight.repository linkEvidencePrices builds parameterized INSERT IGNORE', async () => {
    mockPool.execute.mockResolvedValueOnce([{}]);

    await aiInsightRepo.linkEvidencePrices(100, [501, 502]);
    expect(mockPool.execute).toHaveBeenCalledTimes(1);

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toContain('INSERT IGNORE INTO ai_insight_evidence_prices');
    expect(params).toEqual([100, 501, 100, 502]);
  });

  test('6. aiInsight.repository findByIdAndBusiness enforces business_id scoping', async () => {
    mockPool.execute.mockResolvedValueOnce([[{ id: 100, business_id: 5, headline: 'Market up' }]]);

    const row = await aiInsightRepo.findByIdAndBusiness(100, 5);
    expect(row).toBeDefined();
    expect(row.id).toBe(100);

    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toContain('WHERE id = ? AND business_id = ?');
    expect(params).toEqual([100, 5]);
  });

  test('7. aiInsight.repository findEvidenceNewsByInsightId joins news_items', async () => {
    const mockNews = [{ id: 1, title: 'Oil rallies', url: 'https://news.com/oil' }];
    mockPool.execute.mockResolvedValueOnce([mockNews]);

    const result = await aiInsightRepo.findEvidenceNewsByInsightId(100);
    expect(result).toEqual(mockNews);
    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toContain('FROM news_items ni');
    expect(sql).toContain('JOIN ai_insight_evidence_news aien ON aien.news_item_id = ni.id');
    expect(params).toEqual([100]);
  });

  test('8. aiInsight.repository findEvidencePricesByInsightId joins price_points', async () => {
    const mockPrices = [
      { id: 201, price: 72.5, currency: 'USD', unit_label: 'USD/bbl', data_class: 'OFFICIAL_BENCHMARK' },
    ];
    mockPool.execute.mockResolvedValueOnce([mockPrices]);

    const result = await aiInsightRepo.findEvidencePricesByInsightId(100);
    expect(result).toEqual(mockPrices);
    const [sql, params] = mockPool.execute.mock.calls[0];
    expect(sql).toContain('FROM price_points pp');
    expect(sql).toContain('JOIN ai_insight_evidence_prices aiep ON aiep.price_point_id = pp.id');
    expect(params).toEqual([100]);
  });
});

describe('Phase 3: aiInsightQuery.service & Tenant Isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('9. getLatestInsight embeds linked news and price evidence in response', async () => {
    materialRepo.findByIdForBusiness = jest.fn().mockResolvedValue({ id: 1, business_id: 10, name: 'PET Resin' });
    aiInsightRepo.findLatestByMaterial = jest.fn().mockResolvedValue({
      id: 50,
      tracked_material_id: 1,
      headline: 'PET Resin raw material costs steady',
      what_happened: 'Crude benchmark was flat',
      why_it_happened: 'Refinery maintenance',
      business_impact: 'No near-term cost shift',
      outlook: 'NEUTRAL',
      confidence: 'HIGH',
      evidence_price_range: '70.00-70.50',
      evidence_price_points_count: 5,
      evidence_news_count: 1,
      model_used: 'gemini-1.5-flash',
      generated_at: new Date('2026-09-10T06:00:00Z'),
    });
    aiInsightRepo.findEvidenceNewsByInsightId = jest.fn().mockResolvedValue([
      { id: 101, title: 'Refinery output steady', url: 'https://news.com/refinery', source_name: 'Reuters' },
    ]);
    aiInsightRepo.findEvidencePricesByInsightId = jest.fn().mockResolvedValue([
      { id: 201, price: 70.00, recorded_at: '2026-09-08', currency: 'USD', unit_label: 'USD/bbl', data_class: 'OFFICIAL_BENCHMARK' },
      { id: 202, price: 70.50, recorded_at: '2026-09-09', currency: 'USD', unit_label: 'USD/bbl', data_class: 'OFFICIAL_BENCHMARK' },
    ]);

    const result = await aiInsightQueryService.getLatestInsight(10, 1);
    expect(result).toBeDefined();
    expect(result.id).toBe(50);
    expect(result.evidence_news).toHaveLength(1);
    expect(result.evidence_news[0].title).toBe('Refinery output steady');
    expect(result.evidence_prices).toHaveLength(2);
    expect(result.evidence_prices[0].price).toBe(70.00);
  });

  test('10. getInsightEvidence returns full evidence details when business ownership matches', async () => {
    aiInsightRepo.findByIdAndBusiness = jest.fn().mockResolvedValue({
      id: 50,
      tracked_material_id: 1,
      business_id: 10,
      generated_at: '2026-09-10T06:00:00Z',
      evidence_price_range: '70.00-72.00',
      evidence_price_points_count: 3,
      evidence_news_count: 1,
    });
    aiInsightRepo.findEvidenceNewsByInsightId = jest.fn().mockResolvedValue([
      { id: 101, title: 'Market stable', url: 'https://news.com/1' },
    ]);
    aiInsightRepo.findEvidencePricesByInsightId = jest.fn().mockResolvedValue([
      { id: 201, price: 70.00 },
    ]);

    const evidence = await aiInsightQueryService.getInsightEvidence(10, 50);
    expect(evidence.insight_id).toBe(50);
    expect(evidence.news).toHaveLength(1);
    expect(evidence.prices).toHaveLength(1);
  });

  test('11. getInsightEvidence rejects cross-tenant access with 404 AppError', async () => {
    // Business 99 attempts to access Business 10's insight (id: 50)
    aiInsightRepo.findByIdAndBusiness = jest.fn().mockResolvedValue(null);

    await expect(aiInsightQueryService.getInsightEvidence(99, 50)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(aiInsightRepo.findByIdAndBusiness).toHaveBeenCalledWith(50, 99);
  });
});

describe('Phase 3: aiInsight.service Evidence Floor & Proxy Warning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('12. generateAndStore skips when valid price count is below 3 (ignoring invalid rows)', async () => {
    // 4 price rows provided, but 2 are invalid -> only 2 valid -> below floor of 3
    const prices = [
      { id: 1, price: 70.0, recorded_at: '2026-09-01', is_valid: 1 },
      { id: 2, price: 999.0, recorded_at: '2026-09-02', is_valid: 0, invalid_reason: 'Spike anomaly' },
      { id: 3, price: 71.0, recorded_at: '2026-09-03', is_valid: true },
      { id: 4, price: null, recorded_at: '2026-09-04', is_valid: 1 },
    ];

    const result = await aiInsightService.generateAndStore({
      trackedMaterialId: 1,
      businessId: 5,
      materialName: 'Bottle Caps',
      prices,
      newsHeadlines: [],
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('insufficient_evidence');
    expect(result.priceCount).toBe(2);
    expect(result.requiredCount).toBe(3);
    expect(geminiProvider.generateInsight).not.toHaveBeenCalled();
  });

  test('13. buildPrompt contains currency, unit, data_class and proxy warning when proxy benchmark used', () => {
    const prices = [
      { id: 1, price: 70.0, recorded_at: '2026-09-01', currency: 'USD', unit_label: 'USD/bbl', data_class: 'MARKET_INDICATIVE' },
      { id: 2, price: 71.0, recorded_at: '2026-09-02', currency: 'USD', unit_label: 'USD/bbl', data_class: 'MARKET_INDICATIVE' },
      { id: 3, price: 72.0, recorded_at: '2026-09-03', currency: 'USD', unit_label: 'USD/bbl', data_class: 'MARKET_INDICATIVE' },
    ];

    const prompt = aiInsightService.buildPrompt({
      materialName: 'PET Resin',
      prices,
      priceStats: { minPrice: 70.0, maxPrice: 72.0, evidencePriceRange: '70.00-72.00' },
      safeHeadlines: [
        { id: 10, title: 'OPEC considers supply adjustment', source: 'Reuters', date: '2026-09-02' },
      ],
      metadata: {
        currency: 'USD',
        unitLabel: 'USD/bbl',
        dataClass: 'MARKET_INDICATIVE',
        isProxy: true,
      },
    });

    expect(prompt).toContain('currency:     USD');
    expect(prompt).toContain('unit:         USD/bbl');
    expect(prompt).toContain('data_class:   MARKET_INDICATIVE');
    expect(prompt).toContain('is_proxy:     true');
    expect(prompt).toContain('DATA CLASSIFICATION & PROXY WARNING:');
    expect(prompt).toContain('Notice: The price series supplied above represents an upstream global benchmark');
    expect(prompt).toContain('NOT direct material prices for PET Resin');
    expect(prompt).toContain('If data_class is MARKET_INDICATIVE or the currency is USD, note that this is a proxy price and frame business impact accordingly.');
  });

  test('14. generateAndStore links evidence in junction tables after storing insight', async () => {
    const validPrices = [
      { id: 101, price: 70.0, recorded_at: '2026-09-01' },
      { id: 102, price: 71.0, recorded_at: '2026-09-02' },
      { id: 103, price: 72.0, recorded_at: '2026-09-03' },
    ];
    const headlines = [
      { id: 201, title: 'Crude market report', source_name: 'Reuters', published_at: '2026-09-02' },
    ];

    geminiProvider.generateInsight.mockResolvedValueOnce({
      headline: 'Prices moved up 2.8%',
      what_happened: 'Observed increase from 70 to 72',
      why_it_happened: 'Causal evidence not found in the available data.',
      business_impact: 'Indicative cost pressure may rise.',
      outlook: 'BULLISH',
      confidence: 'LOW',
    });

    aiInsightRepo.create = jest.fn().mockResolvedValueOnce({
      id: 999,
      tracked_material_id: 1,
      business_id: 5,
    });
    aiInsightRepo.linkEvidenceNews = jest.fn().mockResolvedValue();
    aiInsightRepo.linkEvidencePrices = jest.fn().mockResolvedValue();

    const result = await aiInsightService.generateAndStore({
      trackedMaterialId: 1,
      businessId: 5,
      materialName: 'Bottle Caps',
      prices: validPrices,
      newsHeadlines: headlines,
    });

    expect(result.status).toBe('generated');
    expect(aiInsightRepo.linkEvidenceNews).toHaveBeenCalledWith(999, [201]);
    expect(aiInsightRepo.linkEvidencePrices).toHaveBeenCalledWith(999, [101, 102, 103]);
  });
});

describe('Phase 3: aiInsight.controller getEvidence Endpoint', () => {
  test('15. getEvidence resolves businessId and returns success envelope', async () => {
    const req = {
      auth: { businessId: 7 },
      params: { insightId: 42 },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    const mockEvidence = {
      insight_id: 42,
      tracked_material_id: 3,
      prices: [{ id: 1, price: 80.0 }],
      news: [{ id: 5, title: 'Global trade news' }],
    };
    aiInsightQueryService.getInsightEvidence = jest.fn().mockResolvedValue(mockEvidence);

    await aiInsightController.getEvidence(req, res, next);

    expect(aiInsightQueryService.getInsightEvidence).toHaveBeenCalledWith(7, 42);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockEvidence,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('16. getEvidence forwards error to next() on failure', async () => {
    const req = {
      auth: { businessId: 7 },
      params: { insightId: 999 },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    const err = new AppError(404, 'NOT_FOUND', 'AI insight not found');
    aiInsightQueryService.getInsightEvidence = jest.fn().mockRejectedValue(err);

    await aiInsightController.getEvidence(req, res, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

describe('P1 Legacy Null Currency Fallback in AI Insights', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('17. buildPrompt safely defaults missing metadata to INR / SUPPLIER_QUOTE instead of USD crude proxy', () => {
    const prompt = aiInsightService.buildPrompt({
      materialName: 'Corrugated Box',
      prices: [
        { price: 42.0, recorded_at: '2026-11-07' },
        { price: 43.0, recorded_at: '2026-11-08' },
        { price: 44.0, recorded_at: '2026-11-09' },
      ],
      priceStats: {
        latestPrice: 44.0,
        minPrice: 42.0,
        maxPrice: 44.0,
        change7dPercent: 4.76,
      },
      safeHeadlines: [],
      metadata: {},
    });

    expect(prompt).toContain('currency:     INR');
    expect(prompt).toContain('unit:         unit');
    expect(prompt).toContain('data_class:   SUPPLIER_QUOTE');
    expect(prompt).toContain('is_proxy:     false');
    expect(prompt).not.toContain('USD/bbl');
  });

  test('18. generateAndStore handles legacy NULL currency rows without labelling domestic prices as USD or crude proxy', async () => {
    geminiProvider.generateInsight.mockResolvedValue({
      headline: 'Domestic corrugated box prices edged up steadily.',
      what_happened: 'Prices rose from 42 to 44.',
      why_it_happened: 'Regional paper mill input firmness.',
      business_impact: 'Procurement costs rose slightly.',
      outlook: 'NEUTRAL',
      confidence: 'MEDIUM',
    });
    aiInsightRepo.create = jest.fn().mockResolvedValue({
      id: 77,
      tracked_material_id: 5,
      business_id: 10,
      model_used: 'gemini-2.5-flash',
      generated_at: new Date(),
    });
    aiInsightRepo.linkEvidencePrices = jest.fn().mockResolvedValue(undefined);
    aiInsightRepo.linkEvidenceNews = jest.fn().mockResolvedValue(undefined);

    const result = await aiInsightService.generateAndStore({
      trackedMaterialId: 5,
      businessId: 10,
      materialName: 'Corrugated Box',
      prices: [
        { id: 1, price: '42.00', recorded_at: '2026-11-07', currency: null, unit_label: null, data_class: null, is_valid: 1 },
        { id: 2, price: '43.00', recorded_at: '2026-11-08', currency: null, unit_label: null, data_class: null, is_valid: 1 },
        { id: 3, price: '44.00', recorded_at: '2026-11-09', currency: null, unit_label: null, data_class: null, is_valid: 1 },
      ],
      newsHeadlines: [],
    });

    expect(result.status).toBe('generated');
    const promptSent = geminiProvider.generateInsight.mock.calls[0][0];
    expect(promptSent).toContain('currency:     INR');
    expect(promptSent).toContain('data_class:   SUPPLIER_QUOTE');
    expect(promptSent).toContain('is_proxy:     false');
    expect(promptSent).not.toContain('USD/bbl');
  });
});

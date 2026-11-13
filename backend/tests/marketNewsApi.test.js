/**
 * Phase 8 — Market News Monitoring API Tests (Document 2 §5.7, Document 5 §4.7)
 *
 * Verifies:
 *   1. Endpoint & Routing: GET /api/v1/news requires authentication (authMiddleware).
 *   2. Tenant Isolation: News is automatically scoped by the business's industry (business.industry_id).
 *   3. Business Guard: Returns 404 NOT_FOUND if the authenticated user has no business.
 *   4. Empty State: Returns 200 with empty data array and valid pagination meta when no articles exist.
 *   5. Response Envelope & Schema: Matches Document 5 §4.7:
 *      {
 *        success: true,
 *        data: [{ id, title, url, sourceName, publishedAt, summary }],
 *        meta: { page, limit, total, totalPages }
 *      }
 *   6. Pagination & Boundary Handling: Clamps limit <= 100, page >= 1, calculates totalPages correctly.
 *   7. Date & Attribute Normalization: Formats Date objects to ISO 8601, preserves sourceName, url, summary.
 *   8. Repository Queries: SQL uses DISTINCT, bounds industry_id, safely inlines integer limit/offset.
 */

'use strict';

const newsController = require('../src/controllers/news.controller');
const newsQueryService = require('../src/services/newsQuery.service');
const newsRepository = require('../src/repositories/news.repository');
const businessRepository = require('../src/repositories/business.repository');
const newsRouter = require('../src/routes/news.routes');
const { pool } = require('../src/database/connection');
const AppError = require('../src/utils/AppError');
const authMiddleware = require('../src/middleware/auth.middleware');

describe('Phase 8 — Market News Monitoring API', () => {

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // 1. Route & Middleware Registration
  // =========================================================================
  describe('1. Route & Middleware Registration', () => {

    test('1.1 news router registers GET / with authMiddleware and newsController.listNews', () => {
      const getRoutes = newsRouter.stack.filter(
        (layer) => layer.route && layer.route.methods && layer.route.methods.get
      );
      expect(getRoutes.length).toBeGreaterThanOrEqual(1);

      const rootGet = getRoutes.find((layer) => layer.route.path === '/');
      expect(rootGet).toBeDefined();

      // Ensure authMiddleware is in the middleware stack for this route
      const handlers = rootGet.route.stack.map((s) => s.handle);
      expect(handlers).toContain(authMiddleware);
      expect(handlers).toContain(newsController.listNews);
    });

  });

  // =========================================================================
  // 2. Controller & Tenant Scoping (listNews)
  // =========================================================================
  describe('2. Controller & Tenant Scoping (listNews)', () => {

    function createMockRes() {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    }

    test('2.1 resolves businessId from JWT and returns paginated news for business industry', async () => {
      const req = {
        auth: { userId: 10, businessId: 42 },
        query: { page: '1', limit: '20' },
      };
      const res = createMockRes();
      const next = jest.fn();

      const mockItems = [
        {
          id: 900,
          title: 'Crude oil prices climb amid global demand',
          url: 'https://example.com/crude-oil-news',
          sourceName: 'Reuters',
          publishedAt: '2026-07-17T00:00:00.000Z',
          summary: 'Oil markets see steady growth.',
        },
      ];
      const mockMeta = { page: 1, limit: 20, total: 1, totalPages: 1 };

      jest.spyOn(newsQueryService, 'listNewsForBusiness').mockResolvedValueOnce({
        items: mockItems,
        meta: mockMeta,
      });

      await newsController.listNews(req, res, next);

      expect(newsQueryService.listNewsForBusiness).toHaveBeenCalledWith(42, {
        page: 1,
        limit: 20,
        offset: 0,
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockItems,
        meta: mockMeta,
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('2.2 resolves businessId via repository fallback when token carries no businessId', async () => {
      const req = {
        auth: { userId: 15 }, // no businessId in token
        query: {},
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce({
        id: 77,
        industry_id: 3,
        name: 'Plastics Corp',
      });

      jest.spyOn(newsQueryService, 'listNewsForBusiness').mockResolvedValueOnce({
        items: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      });

      await newsController.listNews(req, res, next);

      expect(businessRepository.findByUserId).toHaveBeenCalledWith(15);
      expect(newsQueryService.listNewsForBusiness).toHaveBeenCalledWith(77, {
        page: 1,
        limit: 20,
        offset: 0,
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      });
    });

    test('2.3 passes errors to next() when business is not found', async () => {
      const req = {
        auth: { userId: 99 },
        query: {},
      };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValueOnce(null);

      await newsController.listNews(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
        })
      );
    });

    test('2.4 passes errors to next() when unauthenticated (auth missing)', async () => {
      const req = {
        auth: null,
        query: {},
      };
      const res = createMockRes();
      const next = jest.fn();

      await newsController.listNews(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        })
      );
    });

  });

  // =========================================================================
  // 3. Service Layer (newsQuery.service)
  // =========================================================================
  describe('3. Service Layer (newsQuery.service)', () => {

    test('3.1 listNewsForBusiness scopes query to business.industry_id', async () => {
      jest.spyOn(businessRepository, 'findById').mockResolvedValueOnce({
        id: 101,
        industry_id: 5,
        name: 'Agricultural Exports Ltd',
      });

      const rawDbRows = [
        {
          id: 501,
          title: 'Wheat Export Trends 2026',
          url: 'https://news.agri.gov.in/wheat-2026',
          source_name: 'AgriNews',
          published_at: new Date('2026-08-01T10:00:00.000Z'),
          summary: 'Wheat export forecasts revised upwards.',
        },
        {
          id: 502,
          title: 'Sugar Price Benchmark Update',
          url: 'https://news.agri.gov.in/sugar-update',
          source_name: 'Sugar Gazette',
          published_at: '2026-08-02T14:30:00.000Z',
          summary: null,
        },
      ];

      jest.spyOn(newsRepository, 'listByIndustry').mockResolvedValueOnce(rawDbRows);
      jest.spyOn(newsRepository, 'countByIndustry').mockResolvedValueOnce(2);

      const result = await newsQueryService.listNewsForBusiness(101, {
        page: 1,
        limit: 20,
        offset: 0,
      });

      expect(businessRepository.findById).toHaveBeenCalledWith(101);
      expect(newsRepository.listByIndustry).toHaveBeenCalledWith(5, { limit: 20, offset: 0 });
      expect(newsRepository.countByIndustry).toHaveBeenCalledWith(5);

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        id: 501,
        title: 'Wheat Export Trends 2026',
        url: 'https://news.agri.gov.in/wheat-2026',
        sourceName: 'AgriNews',
        publishedAt: '2026-08-01T10:00:00.000Z', // converted Date to ISO string
        summary: 'Wheat export forecasts revised upwards.',
      });
      expect(result.items[1]).toEqual({
        id: 502,
        title: 'Sugar Price Benchmark Update',
        url: 'https://news.agri.gov.in/sugar-update',
        sourceName: 'Sugar Gazette',
        publishedAt: '2026-08-02T14:30:00.000Z',
        summary: null,
      });

      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    test('3.2 calculates correct totalPages across multiple pages', async () => {
      jest.spyOn(businessRepository, 'findById').mockResolvedValueOnce({
        id: 102,
        industry_id: 2,
      });

      jest.spyOn(newsRepository, 'listByIndustry').mockResolvedValueOnce([
        {
          id: 10,
          title: 'Article 10',
          url: 'https://test.com/10',
          source_name: 'News Wire',
          published_at: '2026-07-20T12:00:00.000Z',
          summary: null,
        },
      ]);
      jest.spyOn(newsRepository, 'countByIndustry').mockResolvedValueOnce(35);

      const result = await newsQueryService.listNewsForBusiness(102, {
        page: 2,
        limit: 10,
        offset: 10,
      });

      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 35,
        totalPages: 4, // Math.ceil(35 / 10) = 4
      });
    });

    test('3.3 returns empty list when business has no industry_id assigned', async () => {
      jest.spyOn(businessRepository, 'findById').mockResolvedValueOnce({
        id: 103,
        industry_id: null,
      });

      const listSpy = jest.spyOn(newsRepository, 'listByIndustry');
      const countSpy = jest.spyOn(newsRepository, 'countByIndustry');

      const result = await newsQueryService.listNewsForBusiness(103, {
        page: 1,
        limit: 20,
        offset: 0,
      });

      expect(result.items).toEqual([]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
      });
      // DB queries bypassed when industry_id is null
      expect(listSpy).not.toHaveBeenCalled();
      expect(countSpy).not.toHaveBeenCalled();
    });

    test('3.4 throws 404 NOT_FOUND when business record does not exist', async () => {
      jest.spyOn(businessRepository, 'findById').mockResolvedValue(null);

      await expect(
        newsQueryService.listNewsForBusiness(999, { page: 1, limit: 20, offset: 0 })
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    test('3.5 tenant isolation: business A only receives industry A news, never industry B news', async () => {
      const bizA = { id: 1, industry_id: 10 };
      const bizB = { id: 2, industry_id: 20 };

      jest.spyOn(businessRepository, 'findById')
        .mockResolvedValueOnce(bizA)
        .mockResolvedValueOnce(bizB);

      const repoSpy = jest.spyOn(newsRepository, 'listByIndustry')
        .mockResolvedValueOnce([
          { id: 1, title: 'Industry 10 News', url: 'https://i10.com', source_name: 'S1', published_at: null },
        ])
        .mockResolvedValueOnce([
          { id: 2, title: 'Industry 20 News', url: 'https://i20.com', source_name: 'S2', published_at: null },
        ]);

      jest.spyOn(newsRepository, 'countByIndustry')
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);

      const resA = await newsQueryService.listNewsForBusiness(1, { page: 1, limit: 20, offset: 0 });
      const resB = await newsQueryService.listNewsForBusiness(2, { page: 1, limit: 20, offset: 0 });

      expect(repoSpy).toHaveBeenNthCalledWith(1, 10, { limit: 20, offset: 0 });
      expect(repoSpy).toHaveBeenNthCalledWith(2, 20, { limit: 20, offset: 0 });

      expect(resA.items[0].id).toBe(1);
      expect(resA.items[0].title).toBe('Industry 10 News');
      expect(resB.items[0].id).toBe(2);
      expect(resB.items[0].title).toBe('Industry 20 News');
    });

  });

  // =========================================================================
  // 4. Repository Layer (news.repository)
  // =========================================================================
  describe('4. Repository Layer (news.repository)', () => {

    test('4.1 listByIndustry builds parameterized query with DISTINCT and order by published_at DESC', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValueOnce([
        [
          {
            id: 1,
            title: 'Sample Headline',
            url: 'https://example.com/item',
            source_name: 'Source 1',
            published_at: '2026-08-01',
            summary: 'A summary',
          },
        ],
      ]);

      const rows = await newsRepository.listByIndustry(7, { limit: 10, offset: 20 });

      expect(executeSpy).toHaveBeenCalledTimes(1);
      const [sql, params] = executeSpy.mock.calls[0];

      // Must be parameterized for industryId
      expect(params).toEqual([7]);
      // Must enforce DISTINCT (FR-NEWS-04 deduplication)
      expect(sql).toContain('SELECT DISTINCT');
      expect(sql).toContain('FROM news_items ni');
      expect(sql).toContain('JOIN news_item_tags nit ON nit.news_item_id = ni.id');
      expect(sql).toContain('WHERE nit.industry_id = ?');
      expect(sql).toContain('ORDER BY ni.published_at DESC');
      // Inlines validated limit/offset safe integers
      expect(sql).toContain('LIMIT 10 OFFSET 20');

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(1);
    });

    test('4.2 listByIndustry returns [] immediately if industryId is missing or null', async () => {
      const executeSpy = jest.spyOn(pool, 'execute');

      const rowsNull = await newsRepository.listByIndustry(null, { limit: 10, offset: 0 });
      const rowsZero = await newsRepository.listByIndustry(0, { limit: 10, offset: 0 });

      expect(rowsNull).toEqual([]);
      expect(rowsZero).toEqual([]);
      expect(executeSpy).not.toHaveBeenCalled();
    });

    test('4.3 listByIndustry falls back to safe default limit and offset if invalid numbers passed', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValueOnce([[]]);

      await newsRepository.listByIndustry(7, { limit: 'invalid', offset: -5 });

      const [sql] = executeSpy.mock.calls[0];
      // safeLimit defaults to 20, safeOffset defaults to 0
      expect(sql).toContain('LIMIT 20 OFFSET 0');
    });

    test('4.4 countByIndustry builds parameterized COUNT(DISTINCT ni.id) query', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValueOnce([
        [{ total: 18 }],
      ]);

      const count = await newsRepository.countByIndustry(7);

      expect(count).toBe(18);
      const [sql, params] = executeSpy.mock.calls[0];
      expect(params).toEqual([7]);
      expect(sql).toContain('SELECT COUNT(DISTINCT ni.id) AS total');
      expect(sql).toContain('WHERE nit.industry_id = ?');
    });

    test('4.5 countByIndustry returns 0 if industryId is missing or null', async () => {
      const executeSpy = jest.spyOn(pool, 'execute');

      const count = await newsRepository.countByIndustry(null);
      expect(count).toBe(0);
      expect(executeSpy).not.toHaveBeenCalled();
    });

    test('4.6 listRecentByIndustry enforces positive integer LIMIT bounded to max 100', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[]]);

      // Valid integer & numeric string limits within 1..100
      await newsRepository.listRecentByIndustry(7, 15);
      expect(executeSpy.mock.calls[0][0]).toContain('LIMIT 15');

      await newsRepository.listRecentByIndustry(7, '25');
      expect(executeSpy.mock.calls[1][0]).toContain('LIMIT 25');

      // Oversized limit clamps to 100
      await newsRepository.listRecentByIndustry(7, 999999);
      expect(executeSpy.mock.calls[2][0]).toContain('LIMIT 100');

      await newsRepository.listRecentByIndustry(7, '500');
      expect(executeSpy.mock.calls[3][0]).toContain('LIMIT 100');

      // Negative, zero, fractional, NaN, Infinity, boolean, null, and injection strings safely default to 10
      for (const badLimit of [-5, 0, 3.7, '3.7', NaN, Infinity, '10; DROP TABLE news_items', 'abc', true, null, '']) {
        executeSpy.mockClear();
        await newsRepository.listRecentByIndustry(7, badLimit);
        expect(executeSpy).toHaveBeenCalledTimes(1);
        expect(executeSpy.mock.calls[0][0]).toContain('LIMIT 10');
        expect(executeSpy.mock.calls[0][1]).toEqual([7]);
      }

      // listByIndustry also clamps oversized limits to 100
      executeSpy.mockClear();
      await newsRepository.listByIndustry(7, { limit: 1000, offset: 0 });
      expect(executeSpy.mock.calls[0][0]).toContain('LIMIT 100 OFFSET 0');

      // Missing industryId returns [] cleanly without querying DB
      executeSpy.mockClear();
      expect(await newsRepository.listRecentByIndustry(null, 10)).toEqual([]);
      expect(executeSpy).not.toHaveBeenCalled();
    });

  });

  // =========================================================================
  // 5. Deduplication & Data Integrity (FR-NEWS-04)
  // =========================================================================
  describe('5. Deduplication & Data Integrity (FR-NEWS-04)', () => {

    test('5.1 hashUrl creates standard 64-character sha256 hex digest for dedup check', () => {
      const url = 'https://news.example.com/markets/2026-packaging-demand';
      const hash = newsRepository.hashUrl(url);

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      // Repeated hashing of same URL produces identical digest
      expect(newsRepository.hashUrl(url)).toBe(hash);
    });

    test('5.2 existsByUrlHash checks against uq_news_items_url_hash index', async () => {
      const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValueOnce([[{ 1: 1 }]]);

      const exists = await newsRepository.existsByUrlHash('https://example.com/story-1');
      expect(exists).toBe(true);

      const [sql, params] = executeSpy.mock.calls[0];
      expect(sql).toContain('SELECT 1 FROM news_items WHERE url_hash = ? LIMIT 1');
      expect(params[0]).toBe(newsRepository.hashUrl('https://example.com/story-1'));
    });

  });

});

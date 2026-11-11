/**
 * Phase 12 — Industry Knowledge Base API Integration Test Suite
 *
 * Implements comprehensive verification of the Industry Knowledge Base module:
 *   1. GET /api/v1/industries (Document 2 §5.3 FR-IKB-01, Document 5 §4.3)
 *   2. GET /api/v1/industries/:industryId (Document 5 §4.3)
 *   3. GET /api/v1/industries/:industryId/knowledge-base (Document 2 §5.3 FR-IKB-01, 02, 05, Document 5 §4.3)
 *   4. GET /api/v1/units-of-measurement (Document 2 §5.5 FR-MAT-04, Document 5 §4.3)
 *
 * Verifies:
 *   1. Route Registration & Public Access:
 *      - Mounted at /api/v1 without authMiddleware (public reference data per Document 5 §2.3, §4.3).
 *   2. Industries Listing:
 *      - Returns 200 with all supported industries including `isAnchor` and `isLightweightTemplate` flags.
 *   3. Single Industry Retrieval:
 *      - Returns 200 for valid ID.
 *      - Returns 404 NOT_FOUND for non-existent industry.
 *      - Returns 400 VALIDATION_ERROR for malformed/non-numeric ID.
 *   4. Full Knowledge Base Payload (FR-IKB-01, 02, 05):
 *      - Aggregates raw materials, cost drivers, external factors, news keywords, and dependency relations.
 *      - FMCG lightweight template (FR-IKB-03): rawMaterials is empty, costDrivers/newsKeywords present.
 *      - Relational dependencies (material↔cost driver, material↔external factor) preserved as structured entities.
 *   5. Units of Measurement:
 *      - Returns 200 with standard units (id, name, abbreviation).
 *   6. Read-Only Immutability (OI-1):
 *      - Confirms no mutation routes (POST, PUT, PATCH, DELETE) or write methods exist.
 */

'use strict';

const knowledgeBaseController = require('../src/controllers/knowledgeBase.controller');
const knowledgeBaseService = require('../src/services/knowledgeBase.service');
const knowledgeBaseRepository = require('../src/repositories/knowledgeBase.repository');
const knowledgeBaseRouter = require('../src/routes/knowledgeBase.routes');
const authMiddleware = require('../src/middleware/auth.middleware');

describe('Phase 12 — Industry Knowledge Base API', () => {

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
  describe('1. Route Registration & Public Access (Document 5 §2.3, §4.3)', () => {

    test('1.1 registers all KB endpoints as public without authMiddleware', () => {
      const getRoutes = knowledgeBaseRouter.stack
        .filter((layer) => layer.route && layer.route.methods && layer.route.methods.get)
        .map((layer) => ({
          path: layer.route.path,
          handlers: layer.route.stack.map((s) => s.handle),
        }));

      const industriesRoute = getRoutes.find((r) => r.path === '/industries');
      expect(industriesRoute).toBeDefined();
      expect(industriesRoute.handlers).not.toContain(authMiddleware);
      expect(industriesRoute.handlers).toContain(knowledgeBaseController.listIndustries);

      const singleIndustryRoute = getRoutes.find((r) => r.path === '/industries/:industryId');
      expect(singleIndustryRoute).toBeDefined();
      expect(singleIndustryRoute.handlers).not.toContain(authMiddleware);
      expect(singleIndustryRoute.handlers).toContain(knowledgeBaseController.getIndustry);

      const kbRoute = getRoutes.find((r) => r.path === '/industries/:industryId/knowledge-base');
      expect(kbRoute).toBeDefined();
      expect(kbRoute.handlers).not.toContain(authMiddleware);
      expect(kbRoute.handlers).toContain(knowledgeBaseController.getIndustryKnowledgeBase);

      const unitsRoute = getRoutes.find((r) => r.path === '/units-of-measurement');
      expect(unitsRoute).toBeDefined();
      expect(unitsRoute.handlers).not.toContain(authMiddleware);
      expect(unitsRoute.handlers).toContain(knowledgeBaseController.listUnitsOfMeasurement);
    });

  });

  // =========================================================================
  // 2. GET /api/v1/industries
  // =========================================================================
  describe('2. GET /api/v1/industries (FR-IKB-01, Document 5 §4.3)', () => {

    test('2.1 returns 200 with list of industries and template metadata flags', async () => {
      const req = {};
      const res = createMockRes();
      const next = jest.fn();

      const mockIndustries = [
        {
          id: 1,
          name: 'Packaged Drinking Water',
          slug: 'packaged-drinking-water',
          is_anchor: 1,
          is_lightweight_template: 0,
          description: 'Bottled water manufacturing and distribution',
        },
        {
          id: 5,
          name: 'Fast-Moving Consumer Goods (FMCG)',
          slug: 'fmcg',
          is_anchor: 0,
          is_lightweight_template: 1,
          description: 'High-turnover consumer goods',
        },
      ];

      jest.spyOn(knowledgeBaseRepository, 'listIndustries').mockResolvedValueOnce(mockIndustries);

      await knowledgeBaseController.listIndustries(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          {
            id: 1,
            name: 'Packaged Drinking Water',
            slug: 'packaged-drinking-water',
            isAnchor: true,
            isLightweightTemplate: false,
            description: 'Bottled water manufacturing and distribution',
          },
          {
            id: 5,
            name: 'Fast-Moving Consumer Goods (FMCG)',
            slug: 'fmcg',
            isAnchor: false,
            isLightweightTemplate: true,
            description: 'High-turnover consumer goods',
          },
        ],
      });
      expect(next).not.toHaveBeenCalled();
    });

  });

  // =========================================================================
  // 3. GET /api/v1/industries/:industryId
  // =========================================================================
  describe('3. GET /api/v1/industries/:industryId (Document 5 §4.3)', () => {

    test('3.1 returns 200 with single industry details for valid id', async () => {
      const req = { params: { industryId: '1' } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValueOnce({
        id: 1,
        name: 'Packaged Drinking Water',
        slug: 'packaged-drinking-water',
        is_anchor: 1,
        is_lightweight_template: 0,
        description: 'Bottled water manufacturing',
      });

      await knowledgeBaseController.getIndustry(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          id: 1,
          name: 'Packaged Drinking Water',
          slug: 'packaged-drinking-water',
          isAnchor: true,
          isLightweightTemplate: false,
          description: 'Bottled water manufacturing',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('3.2 passes 404 NOT_FOUND when industryId does not exist', async () => {
      const req = { params: { industryId: '999' } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValueOnce(null);

      await knowledgeBaseController.getIndustry(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Industry not found',
        })
      );
    });

    test('3.3 passes 400 VALIDATION_ERROR when industryId is not a valid positive integer', async () => {
      const req = { params: { industryId: 'invalid-id' } };
      const res = createMockRes();
      const next = jest.fn();

      await knowledgeBaseController.getIndustry(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'industryId must be a valid positive integer',
        })
      );
    });

  });

  // =========================================================================
  // 4. GET /api/v1/industries/:industryId/knowledge-base
  // =========================================================================
  describe('4. GET /api/v1/industries/:industryId/knowledge-base (FR-IKB-01, 02, 05, Document 5 §4.3)', () => {

    test('4.1 returns 200 with aggregated knowledge base graph for Packaged Drinking Water', async () => {
      const req = { params: { industryId: '1' } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValueOnce({
        id: 1,
        name: 'Packaged Drinking Water',
        slug: 'packaged-drinking-water',
        is_anchor: 1,
        is_lightweight_template: 0,
      });

      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsByIndustry').mockResolvedValueOnce([
        { id: 10, name: 'PET Resin', description: 'Plastic resin', unit_abbreviation: 'kg' },
        { id: 11, name: 'Bottle Caps', description: 'HDPE caps', unit_abbreviation: 'pcs' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getCostDriversByIndustry').mockResolvedValueOnce([
        { id: 20, name: 'Electricity', description: 'Power grid costs' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getExternalFactorsByIndustry').mockResolvedValueOnce([
        { id: 30, name: 'Crude Oil Prices', description: 'Global oil benchmark' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getNewsKeywordsByIndustry').mockResolvedValueOnce([
        { id: 40, keyword: 'PET resin price' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getDependenciesByIndustry').mockResolvedValueOnce([
        {
          source_entity_type: 'RAW_MATERIAL',
          source_entity_id: 10,
          target_entity_type: 'EXTERNAL_FACTOR',
          target_entity_id: 30,
          dependency_type: 'DRIVES_COST',
          description: 'Crude oil directly drives PET resin production cost',
        },
      ]);

      await knowledgeBaseController.getIndustryKnowledgeBase(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          industryId: 1,
          rawMaterials: expect.arrayContaining([
            expect.objectContaining({ id: 10, name: 'PET Resin', defaultUnit: 'kg' }),
            expect.objectContaining({ id: 11, name: 'Bottle Caps', defaultUnit: 'pcs' }),
          ]),
          costDrivers: expect.arrayContaining([
            expect.objectContaining({ id: 20, name: 'Electricity' }),
          ]),
          externalFactors: expect.arrayContaining([
            expect.objectContaining({ id: 30, name: 'Crude Oil Prices' }),
          ]),
          newsKeywords: expect.arrayContaining([
            expect.objectContaining({ id: 40, keyword: 'PET resin price' }),
          ]),
          dependencies: expect.arrayContaining([
            expect.objectContaining({
              sourceType: 'RAW_MATERIAL',
              sourceId: 10,
              targetType: 'EXTERNAL_FACTOR',
              targetId: 30,
              dependencyType: 'DRIVES_COST',
            }),
          ]),
        }),
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('4.2 supports FMCG lightweight template with 0 raw materials (FR-IKB-03)', async () => {
      const req = { params: { industryId: '5' } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValueOnce({
        id: 5,
        name: 'Fast-Moving Consumer Goods (FMCG)',
        slug: 'fmcg',
        is_anchor: 0,
        is_lightweight_template: 1,
      });

      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsByIndustry').mockResolvedValueOnce([]); // 0 materials by design
      jest.spyOn(knowledgeBaseRepository, 'getCostDriversByIndustry').mockResolvedValueOnce([
        { id: 50, name: 'Packaging & Logistics', description: 'Freight costs' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getExternalFactorsByIndustry').mockResolvedValueOnce([
        { id: 60, name: 'Inflation', description: 'CPI rate' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getNewsKeywordsByIndustry').mockResolvedValueOnce([
        { id: 70, keyword: 'FMCG margins' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getDependenciesByIndustry').mockResolvedValueOnce([]);

      await knowledgeBaseController.getIndustryKnowledgeBase(req, res, next);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.industryId).toBe(5);
      expect(responseBody.data.rawMaterials).toHaveLength(0); // Explicit verification of FR-IKB-03
      expect(responseBody.data.costDrivers).toHaveLength(1);
      expect(responseBody.data.newsKeywords).toHaveLength(1);
    });

    test('4.3 passes 404 NOT_FOUND for non-existent industry knowledge-base query', async () => {
      const req = { params: { industryId: '888' } };
      const res = createMockRes();
      const next = jest.fn();

      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValueOnce(null);

      await knowledgeBaseController.getIndustryKnowledgeBase(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Industry not found',
        })
      );
    });

  });

  // =========================================================================
  // 5. GET /api/v1/units-of-measurement
  // =========================================================================
  describe('5. GET /api/v1/units-of-measurement (FR-MAT-04, Document 5 §4.3)', () => {

    test('5.1 returns 200 with list of standard units of measurement', async () => {
      const req = {};
      const res = createMockRes();
      const next = jest.fn();

      const mockUnits = [
        { id: 1, name: 'Kilogram', abbreviation: 'kg' },
        { id: 2, name: 'Pieces', abbreviation: 'pcs' },
        { id: 3, name: 'Metric Tonne', abbreviation: 'MT' },
        { id: 4, name: 'Litre', abbreviation: 'L' },
        { id: 5, name: 'Barrel', abbreviation: 'bbl' },
      ];

      jest.spyOn(knowledgeBaseRepository, 'listUnitsOfMeasurement').mockResolvedValueOnce(mockUnits);

      await knowledgeBaseController.listUnitsOfMeasurement(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [
          { id: 1, name: 'Kilogram', abbreviation: 'kg' },
          { id: 2, name: 'Pieces', abbreviation: 'pcs' },
          { id: 3, name: 'Metric Tonne', abbreviation: 'MT' },
          { id: 4, name: 'Litre', abbreviation: 'L' },
          { id: 5, name: 'Barrel', abbreviation: 'bbl' },
        ],
      });
      expect(next).not.toHaveBeenCalled();
    });

  });

  // =========================================================================
  // 6. Read-Only Immutability Verification (Document 2 OI-1)
  // =========================================================================
  describe('6. Read-Only Immutability Verification (Document 2 OI-1)', () => {

    test('6.1 confirms knowledgeBase repository contains zero write methods', () => {
      expect(knowledgeBaseRepository.create).toBeUndefined();
      expect(knowledgeBaseRepository.update).toBeUndefined();
      expect(knowledgeBaseRepository.delete).toBeUndefined();
      expect(knowledgeBaseRepository.insert).toBeUndefined();
    });

    test('6.2 confirms router registers only GET methods (no POST, PUT, PATCH, DELETE)', () => {
      const nonGetRoutes = knowledgeBaseRouter.stack.filter(
        (layer) => layer.route && Object.keys(layer.route.methods).some((m) => m !== 'get')
      );
      expect(nonGetRoutes).toHaveLength(0);
    });

  });

});

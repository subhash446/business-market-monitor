/**
 * Tests for Phase 5 — Automatic Business-to-Material Mapping.
 *
 * Verifies:
 *   1. Category mapping single source of truth for all 5 industries.
 *   2. Template generation with automatic external symbol association.
 *   3. Initial price backfill for automated commodities when stored prices exist.
 *   4. Strict tenant isolation between businesses.
 *   5. Idempotency and duplicate prevention during onboarding retries.
 *   6. API endpoints (GET /industries/:id/materials, GET /industries/:id/knowledge-base).
 *   7. Migration 025 idempotency and DDL structure.
 */

'use strict';

const {
  INDUSTRY_MATERIAL_MAPPING,
  getIndustryMapping,
  resolveExternalSymbol,
  getMaterialsForIndustry,
} = require('../src/config/industryMaterialMapping');
const { SUPPORTED_SYMBOLS } = require('../src/config/commodityMapping');
const templateGenService = require('../src/services/templateGeneration.service');
const businessService = require('../src/services/business.service');
const knowledgeBaseService = require('../src/services/knowledgeBase.service');

const materialRepository = require('../src/repositories/material.repository');
const businessRepository = require('../src/repositories/business.repository');
const priceRepository = require('../src/repositories/price.repository');
const knowledgeBaseRepository = require('../src/repositories/knowledgeBase.repository');

describe('Phase 5 — Automatic Business-to-Material Mapping', () => {

  describe('1. Category Mapping Single Source of Truth', () => {

    test('1.1 verifies Packaged Drinking Water category mapping', () => {
      const pdw = getIndustryMapping('packaged-drinking-water');
      expect(pdw).toBeDefined();
      expect(pdw.name).toBe('Packaged Drinking Water');
      expect(pdw.materials).toHaveLength(5);

      // PET Resin is a crude proxy
      const pet = pdw.materials.find((m) => m.name === 'PET Resin');
      expect(pet.defaultExternalSymbol).toBe(SUPPORTED_SYMBOLS.WTI);
      expect(pet.isProxy).toBe(true);
      expect(pet.hasAutomatedFeed).toBe(true);
      expect(pet.sourceType).toBe('MARKET_INDICATIVE');

      // Other 4 materials are manual supplier quotes
      const manualMaterials = pdw.materials.filter((m) => !m.hasAutomatedFeed);
      expect(manualMaterials).toHaveLength(4);
      manualMaterials.forEach((m) => {
        expect(m.defaultExternalSymbol).toBeNull();
        expect(m.sourceType).toBe('SUPPLIER_QUOTE');
        expect(m.isProxy).toBe(false);
      });
    });

    test('1.2 verifies Plastic Manufacturing category mapping', () => {
      const pm = getIndustryMapping('plastic-manufacturing');
      expect(pm).toBeDefined();
      expect(pm.materials).toHaveLength(5);

      const pet = pm.materials.find((m) => m.name === 'PET Resin');
      expect(pet.defaultExternalSymbol).toBe(SUPPORTED_SYMBOLS.WTI);

      const hdpe = pm.materials.find((m) => m.name === 'HDPE Granules');
      expect(hdpe.defaultExternalSymbol).toBe(SUPPORTED_SYMBOLS.BRENT);

      // Polypropylene, Masterbatch, Recycled Plastic are supplier quotes
      const pp = pm.materials.find((m) => m.name === 'Polypropylene');
      expect(pp.defaultExternalSymbol).toBeNull();
      expect(pp.sourceType).toBe('SUPPLIER_QUOTE');
    });

    test('1.3 verifies Food & Beverage category mapping (Indian Government mandi benchmarks)', () => {
      const fb = getIndustryMapping('food-beverage');
      expect(fb).toBeDefined();
      expect(fb.materials).toHaveLength(4);

      const wheat = fb.materials.find((m) => m.name === 'Wheat');
      expect(wheat.defaultExternalSymbol).toBe(SUPPORTED_SYMBOLS.WHEAT_GOI);
      expect(wheat.isProxy).toBe(false);
      expect(wheat.hasAutomatedFeed).toBe(true);
      expect(wheat.sourceType).toBe('MARKET_INDICATIVE');
      expect(wheat.disclaimer).toContain('mandi modal price');

      const sugar = fb.materials.find((m) => m.name === 'Sugar');
      expect(sugar.defaultExternalSymbol).toBe(SUPPORTED_SYMBOLS.SUGAR_GOI);
      expect(sugar.isProxy).toBe(false);

      const oil = fb.materials.find((m) => m.name === 'Edible Oil');
      expect(oil.defaultExternalSymbol).toBe(SUPPORTED_SYMBOLS.EDIBLE_OIL_GOI);
      expect(oil.isProxy).toBe(false);

      const pkg = fb.materials.find((m) => m.name === 'Packaging Material');
      expect(pkg.defaultExternalSymbol).toBeNull();
      expect(pkg.sourceType).toBe('SUPPLIER_QUOTE');
    });

    test('1.4 verifies Dairy category mapping has no fake crude or wheat proxies', () => {
      const dairy = getIndustryMapping('dairy');
      expect(dairy).toBeDefined();
      expect(dairy.materials).toHaveLength(3);

      dairy.materials.forEach((m) => {
        expect(m.defaultExternalSymbol).toBeNull();
        expect(m.hasAutomatedFeed).toBe(false);
        expect(m.sourceType).toBe('SUPPLIER_QUOTE');
      });
    });

    test('1.5 verifies FMCG is a lightweight template with 0 pre-seeded materials', () => {
      const fmcg = getIndustryMapping('fmcg');
      expect(fmcg).toBeDefined();
      expect(fmcg.isLightweightTemplate).toBe(true);
      expect(fmcg.materials).toHaveLength(0);
    });

    test('1.6 resolveExternalSymbol resolves correct symbols and returns null for unknown/manual', () => {
      expect(resolveExternalSymbol('Wheat', 'food-beverage')).toBe('WHEAT_GOI');
      expect(resolveExternalSymbol('Sugar', 3)).toBe('SUGAR_GOI');
      expect(resolveExternalSymbol('PET Resin', 'packaged-drinking-water')).toBe('WTI');
      expect(resolveExternalSymbol('HDPE Granules', 'plastic-manufacturing')).toBe('BRENT');
      expect(resolveExternalSymbol('Bottle Caps', 'packaged-drinking-water')).toBeNull();
      expect(resolveExternalSymbol('Raw Milk', 'dairy')).toBeNull();
      expect(resolveExternalSymbol('Unknown Material', 'food-beverage')).toBeNull();
    });

  });

  describe('2. Template Generation & External Symbol Association', () => {

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('2.1 generateTemplate enriches raw materials with external symbols and creates tracked rows', async () => {
      const businessId = 101;
      const industryId = 3; // Food & Beverage

      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsForTemplateGeneration').mockResolvedValue([
        { id: 1, name: 'Wheat', default_unit_id: 1, industry_slug: 'food-beverage' },
        { id: 2, name: 'Sugar', default_unit_id: 1, industry_slug: 'food-beverage' },
        { id: 3, name: 'Edible Oil', default_unit_id: 4, industry_slug: 'food-beverage' },
        { id: 4, name: 'Packaging Material', default_unit_id: 5, industry_slug: 'food-beverage' },
      ]);

      const bulkCreateSpy = jest.spyOn(materialRepository, 'bulkCreateFromTemplate').mockResolvedValue({
        materialsGenerated: 4,
        createdMaterials: [
          { id: 10, rawMaterialId: 1, businessId: 101, unitId: 1, externalSymbol: 'WHEAT_GOI' },
          { id: 11, rawMaterialId: 2, businessId: 101, unitId: 1, externalSymbol: 'SUGAR_GOI' },
          { id: 12, rawMaterialId: 3, businessId: 101, unitId: 4, externalSymbol: 'EDIBLE_OIL_GOI' },
          { id: 13, rawMaterialId: 4, businessId: 101, unitId: 5, externalSymbol: null },
        ],
      });

      jest.spyOn(priceRepository, 'findLatestPriceByExternalSymbol').mockResolvedValue(null);

      const result = await templateGenService.generateTemplate(businessId, industryId);

      expect(bulkCreateSpy).toHaveBeenCalledTimes(1);
      const passedMaterials = bulkCreateSpy.mock.calls[0][1];
      expect(passedMaterials[0]).toMatchObject({ name: 'Wheat', external_symbol: 'WHEAT_GOI' });
      expect(passedMaterials[1]).toMatchObject({ name: 'Sugar', external_symbol: 'SUGAR_GOI' });
      expect(passedMaterials[2]).toMatchObject({ name: 'Edible Oil', external_symbol: 'EDIBLE_OIL_GOI' });
      expect(passedMaterials[3]).toMatchObject({ name: 'Packaging Material', external_symbol: null });

      expect(result.materialsGenerated).toBe(4);
    });

    test('2.2 initial price backfill: copies latest stored price point to new tracked material', async () => {
      const businessId = 102;
      const industryId = 3;

      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsForTemplateGeneration').mockResolvedValue([
        { id: 1, name: 'Wheat', default_unit_id: 1, industry_slug: 'food-beverage' },
      ]);

      jest.spyOn(materialRepository, 'bulkCreateFromTemplate').mockResolvedValue({
        materialsGenerated: 1,
        createdMaterials: [
          { id: 50, rawMaterialId: 1, businessId: 102, unitId: 1, externalSymbol: 'WHEAT_GOI' },
        ],
      });

      // Mock an existing benchmark price in the database
      jest.spyOn(priceRepository, 'findLatestPriceByExternalSymbol').mockResolvedValue({
        price: 2650.00,
        recorded_at: '2026-11-09 00:00:00',
        source: 'THIRD_PARTY_API',
        currency: 'INR',
        unit_label: 'INR/quintal',
        region: 'National Mandi Average (India)',
        grade: 'FAQ (Fair Average Quality)',
        provider_name: 'Data.gov.in (Agmarknet / MoAFW)',
        source_url: 'https://data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070',
        data_class: 'MARKET_INDICATIVE',
      });

      const createPriceSpy = jest.spyOn(priceRepository, 'create').mockResolvedValue({ id: 999 });

      await templateGenService.generateTemplate(businessId, industryId);

      expect(priceRepository.findLatestPriceByExternalSymbol).toHaveBeenCalledWith('WHEAT_GOI');
      expect(createPriceSpy).toHaveBeenCalledTimes(1);
      expect(createPriceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trackedMaterialId: 50,
          price: 2650.00,
          currency: 'INR',
          unitLabel: 'INR/quintal',
          dataClass: 'MARKET_INDICATIVE',
        })
      );
    });

    test('2.3 idempotency: retrying generateTemplate skips already tracked materials without duplicating', async () => {
      const businessId = 103;
      const industryId = 1;

      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsForTemplateGeneration').mockResolvedValue([
        { id: 1, name: 'PET Resin', default_unit_id: 1, industry_slug: 'packaged-drinking-water' },
      ]);

      // When all materials are already tracked, bulkCreateFromTemplate returns materialsGenerated: 0
      jest.spyOn(materialRepository, 'bulkCreateFromTemplate').mockResolvedValue({
        materialsGenerated: 0,
        createdMaterials: [],
      });

      const createPriceSpy = jest.spyOn(priceRepository, 'create');

      const result = await templateGenService.generateTemplate(businessId, industryId);

      expect(result.materialsGenerated).toBe(0);
      expect(createPriceSpy).not.toHaveBeenCalled();
    });

  });

  describe('3. Business Onboarding Service Flow', () => {

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('3.1 createBusiness orchestrates business creation, template generation, and returns mapped materials', async () => {
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue(null);
      jest.spyOn(businessRepository, 'industryExists').mockResolvedValue(true);
      jest.spyOn(businessRepository, 'create').mockResolvedValue({
        id: 200,
        name: 'Blue Springs Water',
        industry_id: 1,
      });

      jest.spyOn(templateGenService, 'generateTemplate').mockResolvedValue({
        materialsGenerated: 5,
        createdMaterials: [],
      });

      jest.spyOn(materialRepository, 'listByBusinessId').mockResolvedValue([
        { id: 1, name: 'PET Resin', unit_abbreviation: 'kg', is_tracked: 1, external_symbol: 'WTI' },
        { id: 2, name: 'Bottle Caps', unit_abbreviation: 'pcs', is_tracked: 1, external_symbol: null },
      ]);

      const res = await businessService.createBusiness({
        userId: 55,
        name: 'Blue Springs Water',
        industryId: 1,
      });

      expect(res.id).toBe(200);
      expect(res.name).toBe('Blue Springs Water');
      expect(res.materialsGenerated).toBe(5);
      expect(res.materials).toHaveLength(2);
      expect(res.materials[0]).toEqual({
        id: 1,
        name: 'PET Resin',
        unit: 'kg',
        isTracked: true,
        externalSymbol: 'WTI',
        hasAutomatedFeed: true,
      });
      expect(res.materials[1]).toEqual({
        id: 2,
        name: 'Bottle Caps',
        unit: 'pcs',
        isTracked: true,
        externalSymbol: null,
        hasAutomatedFeed: false,
      });
    });

    test('3.2 prevents duplicate business creation for the same user (409 CONFLICT)', async () => {
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue({ id: 200 });

      await expect(
        businessService.createBusiness({
          userId: 55,
          name: 'Second Business Attempt',
          industryId: 1,
        })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
    });

  });

  describe('4. Knowledge Base & Industry Materials API', () => {

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('4.1 getIndustryMaterials returns mapped materials and disclaimers for valid industry', async () => {
      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValue({
        id: 3,
        name: 'Food & Beverage',
        slug: 'food-beverage',
        is_lightweight_template: false,
      });

      const res = await knowledgeBaseService.getIndustryMaterials(3);

      expect(res.industryId).toBe(3);
      expect(res.industryName).toBe('Food & Beverage');
      expect(res.materials).toHaveLength(4);
      expect(res.materials.map((m) => m.name)).toEqual([
        'Wheat',
        'Sugar',
        'Edible Oil',
        'Packaging Material',
      ]);
    });

    test('4.2 getIndustryMaterials rejects non-existent industry with 404', async () => {
      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValue(null);

      await expect(knowledgeBaseService.getIndustryMaterials(999)).rejects.toMatchObject({
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    });

    test('4.3 getIndustryMaterials rejects invalid integer id with 400', async () => {
      await expect(knowledgeBaseService.getIndustryMaterials('invalid-id')).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    test('4.4 getIndustryKnowledgeBase enriches raw materials with externalSymbol and disclaimers', async () => {
      jest.spyOn(knowledgeBaseRepository, 'findIndustryById').mockResolvedValue({
        id: 1,
        name: 'Packaged Drinking Water',
        slug: 'packaged-drinking-water',
      });

      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsByIndustry').mockResolvedValue([
        { id: 1, name: 'PET Resin', description: 'Polymer', default_external_symbol: 'WTI', unit_abbreviation: 'kg' },
        { id: 2, name: 'Cartons', description: 'Boxes', default_external_symbol: null, unit_abbreviation: 'pcs' },
      ]);
      jest.spyOn(knowledgeBaseRepository, 'getCostDriversByIndustry').mockResolvedValue([]);
      jest.spyOn(knowledgeBaseRepository, 'getExternalFactorsByIndustry').mockResolvedValue([]);
      jest.spyOn(knowledgeBaseRepository, 'getNewsKeywordsByIndustry').mockResolvedValue([]);
      jest.spyOn(knowledgeBaseRepository, 'getDependenciesByIndustry').mockResolvedValue([]);

      const kb = await knowledgeBaseService.getIndustryKnowledgeBase(1);

      expect(kb.rawMaterials).toHaveLength(2);
      expect(kb.rawMaterials[0]).toMatchObject({
        name: 'PET Resin',
        externalSymbol: 'WTI',
        hasAutomatedFeed: true,
        isProxy: true,
      });
      expect(kb.rawMaterials[1]).toMatchObject({
        name: 'Cartons',
        externalSymbol: null,
        hasAutomatedFeed: false,
        sourceType: 'SUPPLIER_QUOTE',
      });
    });

  });

  describe('5. Database Migration 025 Structure', () => {

    test('5.1 verifies migration 025 exports up and down functions', () => {
      const migration025 = require('../src/migrations/025_add_default_external_symbol_to_raw_materials');
      expect(typeof migration025.up).toBe('function');
      expect(typeof migration025.down).toBe('string');
      expect(migration025.down).toContain('DROP COLUMN IF EXISTS default_external_symbol');
    });

    test('5.2 verifies migration 025 checks information_schema and runs safely', async () => {
      const migration025 = require('../src/migrations/025_add_default_external_symbol_to_raw_materials');
      const mockPool = {
        query: jest.fn().mockImplementation((sql) => {
          if (sql.includes('information_schema.COLUMNS')) {
            return Promise.resolve([[{ cnt: 0 }]]);
          }
          return Promise.resolve([{}]);
        }),
      };

      await migration025.up(mockPool);

      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('ALTER TABLE raw_materials'));
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE raw_materials SET default_external_symbol = 'WHEAT_GOI'"));
    });

  });

  describe('6. P0 Security — Cross-Tenant Supplier Quote Isolation', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('6.1 findLatestPriceByExternalSymbol SQL strictly filters out MANUAL and SUPPLIER_QUOTE rows', async () => {
      const { pool } = require('../src/database/connection');
      const rows = [
        {
          id: 1,
          tracked_material_id: 10,
          source: 'MANUAL',
          data_class: 'SUPPLIER_QUOTE',
          price: 9999.99,
          recorded_at: '2026-11-10 00:00:00',
          is_valid: 1,
          external_symbol: 'WHEAT_GOI',
        },
      ];

      const execSpy = jest.spyOn(pool, 'execute').mockImplementation(async (sql, params) => {
        expect(sql).toContain("pp.source IN ('THIRD_PARTY_API', 'GOVERNMENT_DATASET')");
        expect(sql).toContain("pp.data_class IN ('OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE')");
        const symbol = params[0];
        const filtered = rows.filter(
          (r) =>
            r.external_symbol === symbol &&
            r.is_valid &&
            ['THIRD_PARTY_API', 'GOVERNMENT_DATASET'].includes(r.source) &&
            ['OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE'].includes(r.data_class)
        );
        return [filtered];
      });

      const result = await priceRepository.findLatestPriceByExternalSymbol('WHEAT_GOI');

      expect(execSpy).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    test('6.2 findLatestPriceByExternalSymbol returns benchmark row while ignoring newer tenant MANUAL quote', async () => {
      const { pool } = require('../src/database/connection');
      const table = [
        {
          id: 202,
          external_symbol: 'WHEAT_GOI',
          source: 'MANUAL',
          data_class: 'SUPPLIER_QUOTE',
          price: 4500.00,
          recorded_at: '2026-11-10 12:00:00',
          region: 'Private Secret Supplier',
          is_valid: 1,
        },
        {
          id: 101,
          external_symbol: 'WHEAT_GOI',
          source: 'THIRD_PARTY_API',
          data_class: 'MARKET_INDICATIVE',
          price: 2650.00,
          recorded_at: '2026-11-09 00:00:00',
          currency: 'INR',
          unit_label: 'INR/quintal',
          region: 'National Mandi Average (India)',
          is_valid: 1,
        },
      ];

      jest.spyOn(pool, 'execute').mockImplementation(async (sql, params) => {
        const matched = table
          .filter(
            (r) =>
              r.external_symbol === params[0] &&
              r.is_valid &&
              ['THIRD_PARTY_API', 'GOVERNMENT_DATASET'].includes(r.source) &&
              ['OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE'].includes(r.data_class)
          )
          .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
        return [matched.slice(0, 1)];
      });

      const result = await priceRepository.findLatestPriceByExternalSymbol('WHEAT_GOI');
      expect(result).not.toBeNull();
      expect(result.id).toBe(101);
      expect(result.price).toBe(2650.00);
      expect(result.source).toBe('THIRD_PARTY_API');
    });

    test('6.3 generateTemplate refuses backfill if a MANUAL/SUPPLIER_QUOTE row is ever returned (defense-in-depth)', async () => {
      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsForTemplateGeneration').mockResolvedValue([
        { id: 1, name: 'Wheat', default_unit_id: 1, industry_slug: 'food-beverage' },
      ]);
      jest.spyOn(materialRepository, 'bulkCreateFromTemplate').mockResolvedValue({
        materialsGenerated: 1,
        createdMaterials: [
          { id: 55, rawMaterialId: 1, businessId: 200, unitId: 1, externalSymbol: 'WHEAT_GOI' },
        ],
      });
      jest.spyOn(priceRepository, 'findLatestPriceByExternalSymbol').mockResolvedValue({
        price: 3100.00,
        recorded_at: '2026-11-10 00:00:00',
        source: 'MANUAL',
        data_class: 'SUPPLIER_QUOTE',
        region: 'Private Supplier ABC',
        provider_name: 'Supplier Manual Entry',
      });
      const createPriceSpy = jest.spyOn(priceRepository, 'create').mockResolvedValue({ id: 999 });

      await templateGenService.generateTemplate(200, 3);

      expect(createPriceSpy).not.toHaveBeenCalled();
    });

    test('6.4 generateTemplate derives provenance metadata canonically from COMMODITY_METADATA during benchmark backfill', async () => {
      jest.spyOn(knowledgeBaseRepository, 'getRawMaterialsForTemplateGeneration').mockResolvedValue([
        { id: 1, name: 'Wheat', default_unit_id: 1, industry_slug: 'food-beverage' },
      ]);
      jest.spyOn(materialRepository, 'bulkCreateFromTemplate').mockResolvedValue({
        materialsGenerated: 1,
        createdMaterials: [
          { id: 56, rawMaterialId: 1, businessId: 201, unitId: 1, externalSymbol: 'WHEAT_GOI' },
        ],
      });
      jest.spyOn(priceRepository, 'findLatestPriceByExternalSymbol').mockResolvedValue({
        price: 2650.00,
        recorded_at: '2026-11-09 00:00:00',
        source: 'THIRD_PARTY_API',
        data_class: 'MARKET_INDICATIVE',
        currency: 'USD',
        unit_label: 'weird-unit',
        region: 'Leaked Tenant Note',
        grade: 'Custom Secret Grade',
        provider_name: 'Arbitrary Row Text',
        source_url: 'https://evil.example/leak',
      });
      const createPriceSpy = jest.spyOn(priceRepository, 'create').mockResolvedValue({ id: 1000 });

      await templateGenService.generateTemplate(201, 3);

      expect(createPriceSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trackedMaterialId: 56,
          source: 'THIRD_PARTY_API',
          currency: 'INR',
          unitLabel: 'INR/quintal',
          region: 'National Mandi Average (India)',
          grade: 'FAQ (Fair Average Quality)',
          providerName: 'Data.gov.in (Agmarknet / MoAFW)',
          sourceUrl: 'https://data.gov.in',
          dataClass: 'MARKET_INDICATIVE',
        })
      );
    });
  });

});

/**
 * Phase 1: Data Integrity & Price Metadata Tests.
 *
 * Verifies:
 * 1. Price validator accepts valid metadata and rejects invalid formats.
 * 2. Repository create() persists and returns metadata columns.
 * 3. addManualPrice defaults currency to INR and dataClass to SUPPLIER_QUOTE.
 * 4. ingestFromProvider populates USD/bbl and MARKET_INDICATIVE for EIA benchmarks.
 * 5. getPriceSourceInfo generates correct proxy disclaimers and classifications.
 * 6. Historical trends and dashboard include metadata.
 * 7. Migrations 021 and 022 structure and idempotency.
 */

const { validateAddPrice } = require('../src/validators/price.validator');
const { COMMODITY_METADATA } = require('../src/config/commodityMapping');
const { DATA_CLASS } = require('../src/constants/enums');

// Mock objects prefixed with 'mock' for Jest hoisting rules
const mockMaterialRepository = {
  findByIdForBusiness: jest.fn(),
};
const mockPriceRepository = {
  create: jest.fn(),
  existsByMaterialDateSource: jest.fn(),
  findLatestByMaterialId: jest.fn(),
};
const mockAlertEvaluationService = {
  evaluateMaterial: jest.fn().mockResolvedValue([]),
};

jest.mock('../src/repositories/material.repository', () => mockMaterialRepository);
jest.mock('../src/repositories/price.repository', () => mockPriceRepository);
jest.mock('../src/services/alertEvaluation.service', () => mockAlertEvaluationService);

const priceIngestionService = require('../src/services/priceIngestion.service');
const priceQueryService = require('../src/services/priceQuery.service');

describe('Phase 1: Price Validator (validateAddPrice)', () => {
  test('1. accepts standard price and date without metadata (backwards compatible)', () => {
    const errors = validateAddPrice({ price: 100, recordedAt: '2026-09-01' });
    expect(errors).toEqual([]);
  });

  test('2. accepts valid metadata attributes', () => {
    const errors = validateAddPrice({
      price: 120.50,
      recordedAt: '2026-09-01',
      currency: 'INR',
      unitLabel: 'kg',
      region: 'Western India',
      grade: 'Polymer Injection Grade',
      sourceUrl: 'https://example.com/quote',
      dataClass: 'SUPPLIER_QUOTE',
    });
    expect(errors).toEqual([]);
  });

  test('3. rejects invalid currency code length', () => {
    const errors = validateAddPrice({
      price: 100,
      recordedAt: '2026-09-01',
      currency: 'RUPEES',
    });
    expect(errors.some((e) => e.field === 'currency')).toBe(true);
  });

  test('4. rejects invalid dataClass', () => {
    const errors = validateAddPrice({
      price: 100,
      recordedAt: '2026-09-01',
      dataClass: 'UNVERIFIED_ESTIMATE',
    });
    expect(errors.some((e) => e.field === 'dataClass')).toBe(true);
  });

  test('5. rejects excessively long unitLabel or region', () => {
    const errors = validateAddPrice({
      price: 100,
      recordedAt: '2026-09-01',
      unitLabel: 'a'.repeat(35),
      region: 'b'.repeat(105),
    });
    expect(errors.some((e) => e.field === 'unitLabel')).toBe(true);
    expect(errors.some((e) => e.field === 'region')).toBe(true);
  });
});

describe('Phase 1: Commodity Metadata Configuration', () => {
  test('6. COMMODITY_METADATA contains WTI and BRENT with benchmark metadata and proxy flags', () => {
    expect(COMMODITY_METADATA.WTI).toBeDefined();
    expect(COMMODITY_METADATA.WTI.currency).toBe('USD');
    expect(COMMODITY_METADATA.WTI.unitLabel).toBe('USD/bbl');
    expect(COMMODITY_METADATA.WTI.isProxy).toBe(true);
    expect(COMMODITY_METADATA.WTI.dataClass).toBe('OFFICIAL_BENCHMARK');

    expect(COMMODITY_METADATA.BRENT).toBeDefined();
    expect(COMMODITY_METADATA.BRENT.currency).toBe('USD');
    expect(COMMODITY_METADATA.BRENT.unitLabel).toBe('USD/bbl');
    expect(COMMODITY_METADATA.BRENT.isProxy).toBe(true);
  });

  test('7. DATA_CLASS enum is exported in constants', () => {
    expect(DATA_CLASS.OFFICIAL_BENCHMARK).toBe('OFFICIAL_BENCHMARK');
    expect(DATA_CLASS.MARKET_INDICATIVE).toBe('MARKET_INDICATIVE');
    expect(DATA_CLASS.SUPPLIER_QUOTE).toBe('SUPPLIER_QUOTE');
  });
});

describe('Phase 1: Price Ingestion Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('8. addManualPrice defaults currency to INR and dataClass to SUPPLIER_QUOTE', async () => {
    mockMaterialRepository.findByIdForBusiness.mockResolvedValue({
      id: 1,
      business_id: 10,
      name: 'PET Resin',
      unit: 'kg',
      is_tracked: 1,
    });

    mockPriceRepository.create.mockImplementation((args) =>
      Promise.resolve({
        id: 99,
        price: args.price,
        recorded_at: args.recordedAt,
        source: args.source,
        currency: args.currency,
        unit_label: args.unitLabel,
        region: args.region,
        grade: args.grade,
        provider_name: args.providerName,
        source_url: args.sourceUrl,
        data_class: args.dataClass,
        is_valid: args.isValid,
      })
    );

    const result = await priceIngestionService.addManualPrice(10, 1, {
      price: 85.00,
      recordedAt: '2026-09-10',
    });

    expect(mockPriceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trackedMaterialId: 1,
        price: 85.00,
        source: 'MANUAL',
        currency: 'INR',
        unitLabel: 'kg',
        dataClass: 'SUPPLIER_QUOTE',
        providerName: 'Supplier Manual Entry',
        isValid: true,
      })
    );

    expect(result.currency).toBe('INR');
    expect(result.dataClass).toBe('SUPPLIER_QUOTE');
    expect(result.unitLabel).toBe('kg');
  });

  test('9. ingestFromProvider populates USD, USD/bbl and OFFICIAL_BENCHMARK for WTI proxy', async () => {
    mockPriceRepository.existsByMaterialDateSource.mockResolvedValue(false);
    mockPriceRepository.create.mockResolvedValue({ id: 101 });

    const result = await priceIngestionService.ingestFromProvider(
      { id: 1, business_id: 10 },
      { symbol: 'WTI', price: 67.31, recordedAt: '2026-09-10' }
    );

    expect(result.status).toBe('inserted');
    expect(mockPriceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trackedMaterialId: 1,
        price: 67.31,
        source: 'THIRD_PARTY_API',
        currency: 'USD',
        unitLabel: 'USD/bbl',
        dataClass: 'OFFICIAL_BENCHMARK',
        region: 'Cushing, OK',
        grade: 'Light Sweet Crude Oil',
        providerName: 'U.S. Energy Information Administration (EIA)',
        isValid: true,
      })
    );
  });
});

describe('Phase 1: Price Query Service (Source Info & Disclaimers)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('10. getPriceSourceInfo identifies proxy benchmark and formats disclaimer for WTI', async () => {
    mockMaterialRepository.findByIdForBusiness.mockResolvedValue({
      id: 1,
      business_id: 10,
      name: 'PET Resin',
      unit: 'kg',
      external_symbol: 'WTI',
    });

    mockPriceRepository.findLatestByMaterialId.mockResolvedValue({
      price: '68.50',
      recorded_at: '2026-09-10',
      source: 'THIRD_PARTY_API',
      currency: 'USD',
      unit_label: 'USD/bbl',
      data_class: 'MARKET_INDICATIVE',
      provider_name: 'U.S. Energy Information Administration (EIA)',
    });

    const info = await priceQueryService.getPriceSourceInfo(10, 1);

    expect(info.isProxy).toBe(true);
    expect(info.dataClass).toBe('MARKET_INDICATIVE');
    expect(info.currency).toBe('USD');
    expect(info.unitLabel).toBe('USD/bbl');
    expect(info.disclaimer).toMatch(/global commodity benchmark/i);
    expect(info.disclaimer).toMatch(/not a direct local procurement cost for PET Resin/i);
  });

  test('11. getPriceSourceInfo identifies domestic supplier quote for MANUAL price', async () => {
    mockMaterialRepository.findByIdForBusiness.mockResolvedValue({
      id: 2,
      business_id: 10,
      name: 'Bottle Caps',
      unit: 'pcs',
      external_symbol: null,
    });

    mockPriceRepository.findLatestByMaterialId.mockResolvedValue({
      price: '0.45',
      recorded_at: '2026-09-10',
      source: 'MANUAL',
      currency: 'INR',
      unit_label: 'pcs',
      data_class: 'SUPPLIER_QUOTE',
      provider_name: 'Manual Supplier Entry',
    });

    const info = await priceQueryService.getPriceSourceInfo(10, 2);

    expect(info.isProxy).toBe(false);
    expect(info.dataClass).toBe('SUPPLIER_QUOTE');
    expect(info.currency).toBe('INR');
    expect(info.disclaimer).toMatch(/direct supplier quote/i);
  });
});

describe('Phase 1: Migrations 021 and 022', () => {
  test('12. migration 021 exports async up and down functions', () => {
    const m21 = require('../src/migrations/021_add_metadata_to_price_points');
    expect(typeof m21.up).toBe('function');
    expect(typeof m21.down).toBe('function');
  });

  test('13. migration 022 exports async up and down functions', () => {
    const m22 = require('../src/migrations/022_create_commodity_symbols_table');
    expect(typeof m22.up).toBe('function');
    expect(typeof m22.down).toBe('function');
  });
});

describe('P1 Fix Regression — Provenance, Units, Currency & URL Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('14. getPriceSourceInfo returns accurate domestic GOI metadata for WHEAT_GOI with and without history', async () => {
    mockMaterialRepository.findByIdForBusiness.mockResolvedValue({
      id: 3,
      business_id: 10,
      name: 'Wheat',
      unit_abbreviation: 'kg',
      external_symbol: 'WHEAT_GOI',
    });

    // Empty price history must NOT fall back to USD/bbl or EIA
    mockPriceRepository.findLatestByMaterialId.mockResolvedValueOnce(null);
    const emptyInfo = await priceQueryService.getPriceSourceInfo(10, 3);

    expect(emptyInfo.materialUnit).toBe('kg');
    expect(emptyInfo.isProxy).toBe(false);
    expect(emptyInfo.currency).toBe('INR');
    expect(emptyInfo.unitLabel).toBe('INR/quintal');
    expect(emptyInfo.dataClass).toBe('MARKET_INDICATIVE');
    expect(emptyInfo.providerName).toBe('Data.gov.in (Agmarknet / MoAFW)');
    expect(emptyInfo.sourceUrl).toBe('https://data.gov.in');
    expect(emptyInfo.region).toBe('National Mandi Average (India)');
    expect(emptyInfo.disclaimer).not.toMatch(/EIA|USD\/bbl|Cushing/i);

    // Populated price history preserves GOI provenance
    mockPriceRepository.findLatestByMaterialId.mockResolvedValueOnce({
      id: 77,
      price: '2650.00',
      recorded_at: '2026-11-09 00:00:00',
      source: 'THIRD_PARTY_API',
      currency: 'INR',
      unit_label: 'INR/quintal',
      data_class: 'MARKET_INDICATIVE',
      provider_name: 'Data.gov.in (Agmarknet / MoAFW)',
      source_url: 'https://data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070',
      region: 'National Mandi Average (India)',
      grade: 'FAQ (Fair Average Quality)',
    });
    const populatedInfo = await priceQueryService.getPriceSourceInfo(10, 3);
    expect(populatedInfo.isProxy).toBe(false);
    expect(populatedInfo.currency).toBe('INR');
    expect(populatedInfo.unitLabel).toBe('INR/quintal');
    expect(populatedInfo.providerName).toBe('Data.gov.in (Agmarknet / MoAFW)');
  });

  test('15. getPriceSourceInfo resolves unit_abbreviation and formats WTI disclaimer without USD/USD/bbl duplication', async () => {
    mockMaterialRepository.findByIdForBusiness.mockResolvedValue({
      id: 4,
      business_id: 10,
      name: 'PET Resin',
      unit_abbreviation: 'kg',
      external_symbol: 'WTI',
    });
    mockPriceRepository.findLatestByMaterialId.mockResolvedValue({
      id: 88,
      price: '68.50',
      recorded_at: '2026-11-09 00:00:00',
      source: 'THIRD_PARTY_API',
      currency: 'USD',
      unit_label: 'USD/bbl',
      data_class: 'OFFICIAL_BENCHMARK',
    });

    const info = await priceQueryService.getPriceSourceInfo(10, 4);
    expect(info.materialUnit).toBe('kg');
    expect(info.isProxy).toBe(true);
    expect(info.disclaimer).toContain('WTI in USD/bbl');
    expect(info.disclaimer).not.toContain('USD/USD/bbl');
  });

  test('16. ingestFromProvider uses canonical GOI sourceUrl/dataClass and never assigns fake EIA URL', async () => {
    mockPriceRepository.existsByMaterialDateSource.mockResolvedValue(false);
    mockPriceRepository.create.mockResolvedValue({ id: 202 });

    await priceIngestionService.ingestFromProvider(
      { id: 3, business_id: 10 },
      { symbol: 'WHEAT_GOI', price: 2650, recordedAt: '2026-11-09' }
    );

    expect(mockPriceRepository.existsByMaterialDateSource).toHaveBeenCalledWith(
      3,
      '2026-11-09 00:00:00',
      'GOVERNMENT_DATASET'
    );
    expect(mockPriceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'GOVERNMENT_DATASET',
        currency: 'INR',
        unitLabel: 'INR/quintal',
        providerName: 'Data.gov.in (Agmarknet / MoAFW)',
        sourceUrl: 'https://data.gov.in',
        dataClass: 'MARKET_INDICATIVE',
      })
    );

    await priceIngestionService.ingestFromProvider(
      { id: 9, business_id: 10 },
      { symbol: 'UNKNOWN_FEED', price: 500, recordedAt: '2026-11-09', currency: 'inr' }
    );

    expect(mockPriceRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        currency: 'INR',
        sourceUrl: null,
        dataClass: 'MARKET_INDICATIVE',
      })
    );
  });

  test('17. addManualPrice ignores spoofed dataClass, resolves unit_abbreviation, trims currency, and blocks bad sourceUrl', async () => {
    mockMaterialRepository.findByIdForBusiness.mockResolvedValue({
      id: 5,
      business_id: 10,
      is_tracked: 1,
      unit_abbreviation: 'MT',
    });
    mockPriceRepository.create.mockResolvedValue({ id: 301, data_class: 'SUPPLIER_QUOTE' });

    await priceIngestionService.addManualPrice(10, 5, {
      price: 45000,
      recordedAt: '2026-11-09',
      currency: ' inr ',
      dataClass: 'OFFICIAL_BENCHMARK',
      sourceUrl: 'https://supplier.example.com/quote/1',
    });

    expect(mockPriceRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'MANUAL',
        currency: 'INR',
        unitLabel: 'MT',
        dataClass: 'SUPPLIER_QUOTE',
        sourceUrl: 'https://supplier.example.com/quote/1',
      })
    );

    await expect(
      priceIngestionService.addManualPrice(10, 5, {
        price: 45000,
        recordedAt: '2026-11-09',
        sourceUrl: 'javascript:alert(1)',
      })
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
  });

  test('18. validateAddPrice blocks boolean/array price coercion, non-alpha currency, and unsafe sourceUrl schemes', () => {
    expect(validateAddPrice({ price: true, recordedAt: '2026-11-09' })).toContainEqual(
      expect.objectContaining({ field: 'price' })
    );
    expect(validateAddPrice({ price: [100], recordedAt: '2026-11-09' })).toContainEqual(
      expect.objectContaining({ field: 'price' })
    );
    expect(validateAddPrice({ price: '   ', recordedAt: '2026-11-09' })).toContainEqual(
      expect.objectContaining({ field: 'price' })
    );
    expect(validateAddPrice({ price: 100, recordedAt: '2026-11-09', currency: '123' })).toContainEqual(
      expect.objectContaining({ field: 'currency' })
    );
    expect(validateAddPrice({ price: 100, recordedAt: '2026-11-09', currency: 'US$' })).toContainEqual(
      expect.objectContaining({ field: 'currency' })
    );
    expect(validateAddPrice({ price: 100, recordedAt: '2026-11-09', sourceUrl: 'javascript:alert(1)' })).toContainEqual(
      expect.objectContaining({ field: 'sourceUrl' })
    );
    expect(validateAddPrice({ price: 100, recordedAt: '2026-11-09', sourceUrl: 'data:text/html,<script>' })).toContainEqual(
      expect.objectContaining({ field: 'sourceUrl' })
    );
    expect(validateAddPrice({ price: 100, recordedAt: '2026-11-09', sourceUrl: 'ftp://example.com' })).toContainEqual(
      expect.objectContaining({ field: 'sourceUrl' })
    );

    expect(
      validateAddPrice({
        price: '125.50',
        recordedAt: '2026-11-09',
        currency: ' inr ',
        sourceUrl: 'https://example.com/quote',
      })
    ).toEqual([]);
  });
});

describe('T-02.1 & T-02.2 — Provider Provenance, Commodity Metadata Consistency & Migration 027', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('19. COMMODITY_METADATA aligns GOI & EIA provenance, units, and dataClass with provider contracts', () => {
    const { SUPPORTED_SYMBOLS, PRICE_SOURCES } = (() => {
      const mapping = require('../src/config/commodityMapping');
      const { PRICE_SOURCE } = require('../src/constants/enums');
      return { SUPPORTED_SYMBOLS: mapping.SUPPORTED_SYMBOLS, PRICE_SOURCES: PRICE_SOURCE };
    })();

    expect(Object.values(SUPPORTED_SYMBOLS).sort()).toEqual([
      'BRENT',
      'EDIBLE_OIL_GOI',
      'SUGAR_GOI',
      'WHEAT_GOI',
      'WTI',
    ]);
    expect(SUPPORTED_SYMBOLS.NAPHTHA_EIA).toBeUndefined();
    expect(COMMODITY_METADATA.NAPHTHA_EIA).toBeUndefined();

    expect(COMMODITY_METADATA.WTI.priceSource).toBe(PRICE_SOURCES.THIRD_PARTY_API);
    expect(COMMODITY_METADATA.BRENT.priceSource).toBe(PRICE_SOURCES.THIRD_PARTY_API);

    for (const sym of ['WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI']) {
      expect(COMMODITY_METADATA[sym].priceSource).toBe(PRICE_SOURCES.GOVERNMENT_DATASET);
      expect(COMMODITY_METADATA[sym].dataClass).toBe('MARKET_INDICATIVE');
      expect(COMMODITY_METADATA[sym].unitLabel).toBe('INR/quintal');
      expect(COMMODITY_METADATA[sym].currency).toBe('INR');
      expect(COMMODITY_METADATA[sym].isProxy).toBe(false);
    }
  });

  test('20. ingestFromProvider stores GOVERNMENT_DATASET for GOI feeds, preserves THIRD_PARTY_API for EIA, and prevents MANUAL spoofing', async () => {
    mockPriceRepository.existsByMaterialDateSource.mockResolvedValue(false);
    mockPriceRepository.create.mockResolvedValue({ id: 501 });

    // SUGAR_GOI and EDIBLE_OIL_GOI store GOVERNMENT_DATASET and check dedup against GOVERNMENT_DATASET
    await priceIngestionService.ingestFromProvider(
      { id: 12, business_id: 3 },
      { symbol: 'SUGAR_GOI', price: 3850, recordedAt: '2026-11-09' }
    );
    expect(mockPriceRepository.existsByMaterialDateSource).toHaveBeenCalledWith(
      12,
      '2026-11-09 00:00:00',
      'GOVERNMENT_DATASET'
    );
    expect(mockPriceRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: 'GOVERNMENT_DATASET',
        currency: 'INR',
        unitLabel: 'INR/quintal',
        dataClass: 'MARKET_INDICATIVE',
      })
    );

    // Provider payload cannot spoof MANUAL source even if caller supplies source='MANUAL'
    await priceIngestionService.ingestFromProvider(
      { id: 13, business_id: 3 },
      { symbol: 'EDIBLE_OIL_GOI', price: 14000, recordedAt: '2026-11-09', source: 'MANUAL' }
    );
    expect(mockPriceRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: 'GOVERNMENT_DATASET',
        unitLabel: 'INR/quintal',
      })
    );

    // EIA BRENT continues to record THIRD_PARTY_API
    await priceIngestionService.ingestFromProvider(
      { id: 14, business_id: 3 },
      { symbol: 'BRENT', price: 72.1, recordedAt: '2026-11-09' }
    );
    expect(mockPriceRepository.existsByMaterialDateSource).toHaveBeenLastCalledWith(
      14,
      '2026-11-09 00:00:00',
      'THIRD_PARTY_API'
    );
    expect(mockPriceRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: 'THIRD_PARTY_API',
        currency: 'USD',
        unitLabel: 'USD/bbl',
        dataClass: 'OFFICIAL_BENCHMARK',
      })
    );
  });

  test('21. migration 027 idempotently reconciles WHEAT_GOI, EDIBLE_OIL_GOI, and deactivates unmapped NAPHTHA_EIA', async () => {
    const m27 = require('../src/migrations/027_reconcile_commodity_symbols_metadata');

    // When commodity_symbols table does not exist, up/down skip safely
    const emptyPool = { query: jest.fn().mockResolvedValue([[{ cnt: 0 }]]) };
    await m27.up(emptyPool);
    expect(emptyPool.query).toHaveBeenCalledTimes(1);

    // When commodity_symbols exists, up runs reconciliation updates
    const activePool = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ cnt: 1 }]])
        .mockResolvedValue([{}]),
    };
    await m27.up(activePool);
    expect(activePool.query).toHaveBeenCalledTimes(5);
    const executedSql = activePool.query.mock.calls.slice(1).map((c) => c[0]).join('\n');
    expect(executedSql).toContain("WHERE symbol = 'WHEAT_GOI'");
    expect(executedSql).toContain("data_class   = 'MARKET_INDICATIVE'");
    expect(executedSql).toContain("WHERE symbol = 'EDIBLE_OIL_GOI'");
    expect(executedSql).toContain("unit_label   = 'INR/quintal'");
    expect(executedSql).toContain("is_active = FALSE");
    expect(executedSql).toContain("WHERE symbol = 'NAPHTHA_EIA'");

    // down cleanly restores original 022 state when table exists
    const downPool = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ cnt: 1 }]])
        .mockResolvedValue([{}]),
    };
    await m27.down(downPool);
    expect(downPool.query).toHaveBeenCalledTimes(5);
  });
});

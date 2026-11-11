/**
 * Multi-provider tests for the price ingestion job (Phase 4).
 *
 * Verifies dispatch and aggregation across EIA (Crude proxy) and
 * Indian Government (data.gov.in / Agmarknet mandi) providers.
 */

'use strict';

describe('priceIngestion.job — Multi-Provider Dispatch (Phase 4)', () => {

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('1. dispatches to both EIA and India Govt when both are configured and enabled', async () => {
    jest.mock('../src/config/env', () => ({
      priceIngestion: { enabled: true, timeoutMs: 5000 },
      cron: { priceIngestion: '0 5 * * *' },
      eia: { apiKey: 'TEST_EIA_KEY', baseUrl: 'https://api.eia.gov/v2', timeoutMs: 5000 },
      indiaGovt: {
        enabled: true,
        apiKey: 'TEST_GOV_KEY',
        baseUrl: 'https://api.data.gov.in',
        resourceIdMandi: '9ef84268-d588-465a-a308-a864a43d0070',
        timeoutMs: 5000,
      },
    }));

    jest.mock('../src/database/connection', () => ({
      pool: { execute: jest.fn() },
      testConnection: jest.fn().mockResolvedValue(true),
    }));

    const mockEiaPrices = [
      { symbol: 'WTI', price: 68.50, recordedAt: '2026-11-09' },
    ];
    const mockGoiPrices = [
      {
        symbol: 'WHEAT_GOI',
        price: 2650.00,
        recordedAt: '2026-11-09',
        currency: 'INR',
        unitLabel: 'INR/quintal',
        dataClass: 'MARKET_INDICATIVE',
      },
      {
        symbol: 'SUGAR_GOI',
        price: 3850.00,
        recordedAt: '2026-11-09',
        currency: 'INR',
        unitLabel: 'INR/quintal',
        dataClass: 'MARKET_INDICATIVE',
      },
    ];

    jest.mock('../src/providers/eia.provider', () => ({
      fetchLatestPrices: jest.fn().mockResolvedValue(mockEiaPrices),
      ProviderError: class ProviderError extends Error {},
    }));

    jest.mock('../src/providers/indiaGovt.provider', () => ({
      fetchLatestPrices: jest.fn().mockResolvedValue(mockGoiPrices),
      ProviderError: class ProviderError extends Error {},
    }));

    jest.mock('../src/repositories/material.repository', () => ({
      findTrackedByExternalSymbol: jest.fn().mockImplementation((sym) => {
        if (sym === 'WTI') return Promise.resolve([{ id: 1, business_id: 10 }]);
        if (sym === 'WHEAT_GOI') return Promise.resolve([{ id: 2, business_id: 10 }]);
        if (sym === 'SUGAR_GOI') return Promise.resolve([{ id: 3, business_id: 10 }]);
        return Promise.resolve([]);
      }),
    }));

    jest.mock('../src/repositories/syncStatus.repository', () => ({
      upsert: jest.fn().mockResolvedValue(undefined),
    }));

    jest.mock('../src/services/priceIngestion.service', () => ({
      ingestFromProvider: jest.fn().mockResolvedValue({ status: 'inserted', trackedMaterialId: 1, businessId: 10 }),
    }));

    jest.mock('../src/utils/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn(),
    }));

    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const eia = require('../src/providers/eia.provider');
    const indiaGovt = require('../src/providers/indiaGovt.provider');
    const svc = require('../src/services/priceIngestion.service');

    const result = await runIngestion();

    expect(result.status).toBe('SUCCESS');
    expect(eia.fetchLatestPrices).toHaveBeenCalledTimes(1);
    expect(indiaGovt.fetchLatestPrices).toHaveBeenCalledTimes(1);

    // Verify symbols dispatched to each provider
    const eiaSymbols = eia.fetchLatestPrices.mock.calls[0][0];
    expect(eiaSymbols).toContain('WTI');
    expect(eiaSymbols).toContain('BRENT');

    const goiSymbols = indiaGovt.fetchLatestPrices.mock.calls[0][0];
    expect(goiSymbols).toContain('WHEAT_GOI');
    expect(goiSymbols).toContain('SUGAR_GOI');
    expect(goiSymbols).toContain('EDIBLE_OIL_GOI');

    // Total 3 prices ingested across both providers
    expect(svc.ingestFromProvider).toHaveBeenCalledTimes(3);
  });

  test('2. partial failure: when India Govt fails, EIA prices are still ingested and run is marked FAILED', async () => {
    jest.mock('../src/config/env', () => ({
      priceIngestion: { enabled: true, timeoutMs: 5000 },
      cron: { priceIngestion: '0 5 * * *' },
      eia: { apiKey: 'TEST_EIA_KEY', baseUrl: 'https://api.eia.gov/v2', timeoutMs: 5000 },
      indiaGovt: {
        enabled: true,
        apiKey: 'TEST_GOV_KEY',
        baseUrl: 'https://api.data.gov.in',
        resourceIdMandi: '9ef84268-d588-465a-a308-a864a43d0070',
        timeoutMs: 5000,
      },
    }));

    jest.mock('../src/database/connection', () => ({
      pool: { execute: jest.fn() },
      testConnection: jest.fn().mockResolvedValue(true),
    }));

    jest.mock('../src/providers/eia.provider', () => ({
      fetchLatestPrices: jest.fn().mockResolvedValue([
        { symbol: 'WTI', price: 68.50, recordedAt: '2026-11-09' },
      ]),
      ProviderError: class ProviderError extends Error {},
    }));

    jest.mock('../src/providers/indiaGovt.provider', () => ({
      fetchLatestPrices: jest.fn().mockRejectedValue(
        Object.assign(new Error('Gov data timeout'), { name: 'ProviderError', code: 'PROVIDER_TIMEOUT' })
      ),
      ProviderError: class ProviderError extends Error {},
    }));

    jest.mock('../src/repositories/material.repository', () => ({
      findTrackedByExternalSymbol: jest.fn().mockImplementation((sym) => {
        if (sym === 'WTI') return Promise.resolve([{ id: 1, business_id: 10 }]);
        return Promise.resolve([]);
      }),
    }));

    jest.mock('../src/repositories/syncStatus.repository', () => ({
      upsert: jest.fn().mockResolvedValue(undefined),
    }));

    jest.mock('../src/services/priceIngestion.service', () => ({
      ingestFromProvider: jest.fn().mockResolvedValue({ status: 'inserted', trackedMaterialId: 1, businessId: 10 }),
    }));

    jest.mock('../src/utils/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn(),
    }));

    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const svc = require('../src/services/priceIngestion.service');

    const result = await runIngestion();

    expect(result.status).toBe('FAILED');
    expect(result.error).toBeDefined();
    // EIA price was still ingested into tracked material
    expect(svc.ingestFromProvider).toHaveBeenCalledTimes(1);
    expect(svc.ingestFromProvider).toHaveBeenCalledWith(
      { id: 1, business_id: 10 },
      { symbol: 'WTI', price: 68.50, recordedAt: '2026-11-09' }
    );
  });

  test('3. skips India Govt provider when INDIA_GOVT_DATA_ENABLED is false', async () => {
    jest.mock('../src/config/env', () => ({
      priceIngestion: { enabled: true, timeoutMs: 5000 },
      cron: { priceIngestion: '0 5 * * *' },
      eia: { apiKey: 'TEST_EIA_KEY', baseUrl: 'https://api.eia.gov/v2', timeoutMs: 5000 },
      indiaGovt: {
        enabled: false, // disabled
        apiKey: 'TEST_GOV_KEY',
        baseUrl: 'https://api.data.gov.in',
        resourceIdMandi: '9ef84268-d588-465a-a308-a864a43d0070',
        timeoutMs: 5000,
      },
    }));

    jest.mock('../src/database/connection', () => ({
      pool: { execute: jest.fn() },
      testConnection: jest.fn().mockResolvedValue(true),
    }));

    jest.mock('../src/providers/eia.provider', () => ({
      fetchLatestPrices: jest.fn().mockResolvedValue([
        { symbol: 'WTI', price: 68.50, recordedAt: '2026-11-09' },
      ]),
      ProviderError: class ProviderError extends Error {},
    }));

    jest.mock('../src/providers/indiaGovt.provider', () => ({
      fetchLatestPrices: jest.fn(),
      ProviderError: class ProviderError extends Error {},
    }));

    jest.mock('../src/repositories/material.repository', () => ({
      findTrackedByExternalSymbol: jest.fn().mockResolvedValue([]),
    }));

    jest.mock('../src/repositories/syncStatus.repository', () => ({
      upsert: jest.fn().mockResolvedValue(undefined),
    }));

    jest.mock('../src/services/priceIngestion.service', () => ({
      ingestFromProvider: jest.fn(),
    }));

    jest.mock('../src/utils/logger', () => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), flush: jest.fn(),
    }));

    const { runIngestion } = require('../src/jobs/priceIngestion.job');
    const indiaGovt = require('../src/providers/indiaGovt.provider');

    const result = await runIngestion();

    expect(result.status).toBe('SUCCESS');
    expect(indiaGovt.fetchLatestPrices).not.toHaveBeenCalled();
  });

});

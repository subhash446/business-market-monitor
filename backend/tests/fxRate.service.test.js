'use strict';

/**
 * Unit tests for FX Rate Provider, Repository, Service & Ingestion Job (V3-M3).
 */

const fxRateProvider = require('../src/providers/fxRate.provider');
const fxRateService = require('../src/services/fxRate.service');
const fxRateRepository = require('../src/repositories/fxRate.repository');
const fxIngestionJob = require('../src/jobs/fxIngestion.job');
const env = require('../src/config/env');

describe('FX Rate Engine (Provider, Service & Ingestion Job)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. fxRate.provider.js', () => {
    test('fetches and normalizes valid Frankfurter API response', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          amount: 1.0,
          base: 'USD',
          date: '2026-11-20',
          rates: { INR: 86.425 },
        }),
      });

      const originalFetch = global.fetch;
      global.fetch = mockFetch;

      try {
        const result = await fxRateProvider.fetchLatestFxRate('USD', 'INR', { baseUrl: 'https://test.api' });
        expect(result.base).toBe('USD');
        expect(result.quote).toBe('INR');
        expect(result.rate).toBe(86.425);
        expect(result.rateDate).toBe('2026-11-20');
        expect(result.source).toBe('FRANKFURTER_ECB');
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('throws PROVIDER_INVALID_RATE when rate is outside sane boundaries (< 10 or > 500)', async () => {
      const mockFetchLow = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          amount: 1.0,
          base: 'USD',
          date: '2026-11-20',
          rates: { INR: 5.2 }, // physically impossible USD/INR rate
        }),
      });

      const originalFetch = global.fetch;
      global.fetch = mockFetchLow;

      try {
        await expect(fxRateProvider.fetchLatestFxRate('USD', 'INR', { baseUrl: 'https://test.api' }))
          .rejects.toThrow(/out of expected bounds/);
      } finally {
        global.fetch = originalFetch;
      }
    });

    test('throws PROVIDER_TIMEOUT when AbortController signals timeout', async () => {
      const mockFetchTimeout = jest.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      });

      const originalFetch = global.fetch;
      global.fetch = mockFetchTimeout;

      try {
        await expect(fxRateProvider.fetchLatestFxRate('USD', 'INR', { timeoutMs: 50 }))
          .rejects.toThrow(/timed out/);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('2. fxRate.service.js', () => {
    test('calculateAgeDays correctly measures calendar days', () => {
      const now = new Date('2026-11-22T10:00:00.000Z');
      expect(fxRateService.calculateAgeDays('2026-11-22', now)).toBe(0);
      expect(fxRateService.calculateAgeDays('2026-11-20', now)).toBe(2);
      expect(fxRateService.calculateAgeDays('2026-11-10', now)).toBe(12);
    });

    test('flags isStale = true when rate is older than 7 calendar days', async () => {
      jest.spyOn(fxRateRepository, 'getLatestRate').mockResolvedValueOnce({
        id: 1,
        baseCurrency: 'USD',
        quoteCurrency: 'INR',
        rate: 85.50,
        rateDate: '2026-11-10', // 12 days ago
        source: 'FRANKFURTER_ECB',
        fetchedAt: new Date(),
      });

      const rate = await fxRateService.getLatestRate('USD', 'INR');
      expect(rate).toBeDefined();
      expect(rate.rate).toBe(85.50);
      expect(rate.isStale).toBe(true);
      expect(rate.ageDays).toBeGreaterThan(7);
    });

    test('Refinement 1: in test environment with no cached rate, returns null without network calls', async () => {
      jest.spyOn(fxRateRepository, 'getLatestRate').mockResolvedValueOnce(null);

      const rate = await fxRateService.getLatestRate('USD', 'INR');
      expect(rate).toBeNull();
    });

    test('Refinement 1: with custom provider, triggers cold-start fetch, upsert, and returns rate', async () => {
      jest.spyOn(fxRateRepository, 'getLatestRate').mockResolvedValueOnce(null);
      const mockUpsert = jest.spyOn(fxRateRepository, 'upsertFxRate').mockResolvedValueOnce({ affectedRows: 1 });

      const mockProvider = {
        fetchLatestFxRate: jest.fn().mockResolvedValue({
          base: 'USD',
          quote: 'INR',
          rate: 86.40,
          rateDate: '2026-11-22',
          source: 'FRANKFURTER_ECB',
        }),
      };

      const rate = await fxRateService.getLatestRate('USD', 'INR', { provider: mockProvider });
      expect(rate).toBeDefined();
      expect(rate.rate).toBe(86.40);
      expect(rate.isStale).toBe(false);
      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    test('Refinement 1: returns null gracefully if cold-start provider throws', async () => {
      jest.spyOn(fxRateRepository, 'getLatestRate').mockResolvedValueOnce(null);
      const mockProvider = {
        fetchLatestFxRate: jest.fn().mockRejectedValue(new Error('Network offline')),
      };

      const rate = await fxRateService.getLatestRate('USD', 'INR', { provider: mockProvider });
      expect(rate).toBeNull();
    });
  });

  describe('3. fxIngestion.job.js', () => {
    test('skips execution when FX_INGESTION_ENABLED is false', async () => {
      const origEnabled = env.fx.enabled;
      env.fx.enabled = false;

      try {
        const res = await fxIngestionJob.runJob();
        expect(res.status).toBe('SKIPPED');
        expect(res.reason).toBe('disabled');
      } finally {
        env.fx.enabled = origEnabled;
      }
    });
  });
});

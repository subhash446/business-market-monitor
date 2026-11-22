import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(frontendRoot, 'src');

describe('V3-M2 — News-to-Price Impact Scoring & 14/30-Day Directional Price Band Engine', () => {
  let viteServer;
  let TrendsPageModule;

  before(async () => {
    viteServer = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true },
      logLevel: 'silent',
    });
    TrendsPageModule = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');
  });

  after(async () => {
    if (viteServer) {
      await viteServer.close();
    }
  });

  // =========================================================================
  // 1. API Helper Verification (materials.api.js)
  // =========================================================================
  describe('1. materials.api.js getMaterialPriceOutlook helper', () => {
    test('exports getMaterialPriceOutlook targeting GET /materials/:id/price-outlook', () => {
      const matApiPath = path.join(srcRoot, 'api/materials.api.js');
      const content = fs.readFileSync(matApiPath, 'utf-8');

      assert.ok(
        content.includes('export async function getMaterialPriceOutlook(materialId)'),
        'materials.api.js must export getMaterialPriceOutlook'
      );
      assert.ok(
        content.includes('/price-outlook'),
        'getMaterialPriceOutlook must call /materials/:materialId/price-outlook endpoint'
      );
    });
  });

  // =========================================================================
  // 2. formatRelativeDays Deterministic Helper
  // =========================================================================
  describe('2. formatRelativeDays Deterministic Helper', () => {
    test('calculates relative hours deterministically against evaluatedAt', () => {
      const { formatRelativeDays } = TrendsPageModule;
      const evalAt = '2026-11-20T12:00:00.000Z';
      const pubAt = '2026-11-20T10:00:00.000Z'; // 2 hours before
      const formatted = formatRelativeDays(pubAt, evalAt);
      assert.strictEqual(formatted, '2h ago');
    });

    test('calculates relative days deterministically against evaluatedAt', () => {
      const { formatRelativeDays } = TrendsPageModule;
      const evalAt = '2026-11-20T12:00:00.000Z';
      const pubAt = '2026-11-15T12:00:00.000Z'; // 5 days before
      const formatted = formatRelativeDays(pubAt, evalAt);
      assert.strictEqual(formatted, '5d ago');
    });

    test('returns "Recent" when publishedAt or evaluatedAt is missing or invalid', () => {
      const { formatRelativeDays } = TrendsPageModule;
      assert.strictEqual(formatRelativeDays(null, '2026-11-20T12:00:00.000Z'), 'Recent');
      assert.strictEqual(formatRelativeDays('2026-11-20T12:00:00.000Z', null), 'Recent');
      assert.strictEqual(formatRelativeDays('invalid-date', '2026-11-20T12:00:00.000Z'), 'Recent');
    });
  });

  // =========================================================================
  // 3. PriceOutlookCard Component SSR Rendering
  // =========================================================================
  describe('3. PriceOutlookCard SSR Rendering & Polish', () => {
    test('renders upward cost pressure with 14d and 30d bands and HIGH confidence', () => {
      const { PriceOutlookCard } = TrendsPageModule;
      const sampleOutlook = {
        evaluatedAt: '2026-11-20T12:00:00.000Z',
        materialId: 36,
        currentPrice: 105.5,
        currency: 'INR',
        unit: 'kg',
        seriesSource: 'SUPPLIER_QUOTE',
        expectedDirection: 'UPWARD_PRESSURE',
        confidenceTier: 'HIGH',
        confidenceScore: 85,
        confidenceDrivers: [
          'Strong 30d trend alignment (+4.2%)',
          '2 cost-increasing news catalysts detected',
        ],
        band14d: {
          low: 102.3,
          mid: 108.2,
          high: 114.1,
          expectedDeltaPct: 2.56,
          volatility14dPct: 5.6,
        },
        band30d: {
          low: 99.8,
          mid: 112.0,
          high: 124.2,
          expectedDeltaPct: 6.16,
          volatility30dPct: 10.8,
        },
        newsDrivers: [
          {
            id: 1,
            title: 'Polymer Feedstock Supply Tightens',
            url: 'https://example.com/news/1',
            impactDirection: 'COST_UP',
            severityScore: 4,
            publishedAt: '2026-11-19T12:00:00.000Z',
            impactRationale: 'Refinery maintenance limits propylene output.',
          },
        ],
        isDataStale: false,
        daysSinceLatest: 0,
        disclaimer: 'Directional statistical projection based on single-series history.',
      };

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: sampleOutlook,
            loading: false,
            error: null,
            materialName: 'PET Resin',
          })
        )
      );

      assert.ok(html.includes('14d &amp; 30d Directional Price Outlook — PET Resin'));
      assert.ok(html.includes('margin-right:8px') || html.includes('margin-right: 8px') || html.includes('margin-right'));
      assert.ok(html.includes('outlook-dir-pill--up'));
      assert.ok(html.includes('Upward Cost Pressure'));
      assert.ok(html.includes('HIGH (85%)'));
      assert.ok(html.includes('14-Day Price Band'));
      assert.ok(html.includes('30-Day Price Band'));
      assert.ok(html.includes('Domestic Supplier Quotes'));
      assert.ok(html.includes('Strong 30d trend alignment'));
      assert.ok(html.includes('Polymer Feedstock Supply Tightens'));
      assert.ok(html.includes('COST UP'));
      assert.ok(html.includes('SEV 4/5'));
      assert.ok(html.includes('1d ago'));
    });

    test('renders downward softening with COST_DOWN news drivers', () => {
      const { PriceOutlookCard } = TrendsPageModule;
      const sampleOutlook = {
        evaluatedAt: '2026-11-20T12:00:00.000Z',
        materialId: 36,
        currentPrice: 90.0,
        currency: 'USD',
        unit: 'bbl',
        seriesSource: 'BENCHMARK',
        expectedDirection: 'DOWNWARD_PRESSURE',
        confidenceTier: 'MODERATE',
        confidenceScore: 65,
        confidenceDrivers: ['Momentum softening over 7-day period'],
        band14d: {
          low: 84.0,
          mid: 87.5,
          high: 91.0,
          expectedDeltaPct: -2.78,
          volatility14dPct: 4.0,
        },
        band30d: {
          low: 80.0,
          mid: 85.0,
          high: 90.0,
          expectedDeltaPct: -5.56,
          volatility30dPct: 6.2,
        },
        newsDrivers: [
          {
            id: 2,
            title: 'Global Output Expansion Eases Supply Deficit',
            url: null,
            impactDirection: 'COST_DOWN',
            severityScore: 3,
            publishedAt: '2026-11-18T12:00:00.000Z',
            impactRationale: 'OPEC crude production ramp increases supply.',
          },
        ],
        isDataStale: false,
        daysSinceLatest: 1,
        disclaimer: 'Statistical directional band.',
      };

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: sampleOutlook,
            loading: false,
            error: null,
            materialName: 'Brent Crude',
          })
        )
      );

      assert.ok(html.includes('outlook-dir-pill--down'));
      assert.ok(html.includes('Downward Softening'));
      assert.ok(html.includes('MODERATE (65%)'));
      assert.ok(html.includes('Market Benchmark'));
      assert.ok(html.includes('COST DOWN'));
      assert.ok(html.includes('SEV 3/5'));
      assert.ok(html.includes('2d ago'));
    });

    test('renders range-bound neutral outlook gracefully', () => {
      const { PriceOutlookCard } = TrendsPageModule;
      const sampleOutlook = {
        evaluatedAt: '2026-11-20T12:00:00.000Z',
        materialId: 36,
        currentPrice: 100.0,
        currency: 'INR',
        unit: 'kg',
        seriesSource: 'SUPPLIER_QUOTE',
        expectedDirection: 'RANGE_BOUND',
        confidenceTier: 'LOW',
        confidenceScore: 45,
        confidenceDrivers: ['Equilibrium price action observed'],
        band14d: { low: 97.0, mid: 100.0, high: 103.0, expectedDeltaPct: 0.0, volatility14dPct: 3.0 },
        band30d: { low: 94.0, mid: 100.0, high: 106.0, expectedDeltaPct: 0.0, volatility30dPct: 6.0 },
        newsDrivers: [],
        isDataStale: false,
        daysSinceLatest: 2,
        disclaimer: 'Projections are estimates.',
      };

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: sampleOutlook,
            loading: false,
            error: null,
            materialName: 'PET Resin',
          })
        )
      );

      assert.ok(html.includes('outlook-dir-pill--range'));
      assert.ok(html.includes('Range-Bound / Neutral'));
      assert.ok(html.includes('LOW (45%)'));
    });

    test('renders insufficient data state when fewer than 5 price points exist', () => {
      const { PriceOutlookCard } = TrendsPageModule;
      const insufficientOutlook = {
        evaluatedAt: '2026-11-20T12:00:00.000Z',
        materialId: 36,
        insufficientData: true,
        reason: 'At least 5 historical price points are required to compute statistical volatility and directional bands.',
        dataPointCount: 3,
        minimumRequired: 5,
      };

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: insufficientOutlook,
            loading: false,
            error: null,
            materialName: 'PET Resin',
          })
        )
      );

      assert.ok(html.includes('INSUFFICIENT DATA'));
      assert.ok(html.includes('At least 5 historical price points are required'));
      assert.ok(html.includes('3'));
      assert.ok(html.includes('5'));
    });

    test('renders stale data warning callout when isDataStale is true', () => {
      const { PriceOutlookCard } = TrendsPageModule;
      const staleOutlook = {
        evaluatedAt: '2026-11-20T12:00:00.000Z',
        materialId: 36,
        currentPrice: 100.0,
        currency: 'INR',
        unit: 'kg',
        seriesSource: 'SUPPLIER_QUOTE',
        expectedDirection: 'RANGE_BOUND',
        confidenceTier: 'LOW',
        confidenceScore: 35,
        confidenceDrivers: ['Stale historical series (>30 days since latest point)'],
        band14d: { low: 95.0, mid: 100.0, high: 105.0, expectedDeltaPct: 0.0, volatility14dPct: 5.0 },
        band30d: { low: 90.0, mid: 100.0, high: 110.0, expectedDeltaPct: 0.0, volatility30dPct: 10.0 },
        newsDrivers: [],
        isDataStale: true,
        daysSinceLatest: 42,
        disclaimer: 'Projections are estimates.',
      };

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: staleOutlook,
            loading: false,
            error: null,
            materialName: 'PET Resin',
          })
        )
      );

      assert.ok(html.includes('Latest price was recorded 42 days ago'));
      assert.ok(html.includes('Statistical confidence is downgraded until fresh prices are logged'));
    });

    test('renders loading skeleton and error states properly', () => {
      const { PriceOutlookCard } = TrendsPageModule;
      const loadingHtml = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: null,
            loading: true,
            error: null,
            materialName: 'PET Resin',
          })
        )
      );
      assert.ok(loadingHtml.includes('skeleton'));

      const errorHtml = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: null,
            loading: false,
            error: 'Network connectivity timeout',
            materialName: 'PET Resin',
          })
        )
      );
      assert.ok(errorHtml.includes('Network connectivity timeout'));

      const nullHtml = renderToStaticMarkup(
        React.createElement(MemoryRouter, null,
          React.createElement(PriceOutlookCard, {
            outlook: null,
            loading: false,
            error: null,
            materialName: 'PET Resin',
          })
        )
      );
      assert.strictEqual(nullHtml, '');
    });
  });
});

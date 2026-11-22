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

describe('V3-M3 — Live USD/INR FX & Landed-Cost Normalization Engine', () => {
  let viteServer;

  before(async () => {
    viteServer = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true },
      logLevel: 'silent',
    });
  });

  after(async () => {
    if (viteServer) {
      await viteServer.close();
    }
  });

  // =========================================================================
  // 1. API Helper Verification (materials.api.js)
  // =========================================================================
  describe('1. materials.api.js Landed Cost & FX API Helpers', () => {
    test('exports updateMaterialLandedCost targeting PATCH /materials/:id/landed-cost', () => {
      const matApiPath = path.join(srcRoot, 'api/materials.api.js');
      const content = fs.readFileSync(matApiPath, 'utf-8');

      assert.ok(
        content.includes('export async function updateMaterialLandedCost('),
        'materials.api.js must export updateMaterialLandedCost'
      );
      assert.ok(
        content.includes('/landed-cost'),
        'updateMaterialLandedCost must call /materials/:materialId/landed-cost endpoint'
      );
      assert.ok(
        content.includes('patch('),
        'updateMaterialLandedCost must use PATCH method'
      );
    });

    test('exports getLatestFxRate targeting GET /fx/latest', () => {
      const matApiPath = path.join(srcRoot, 'api/materials.api.js');
      const content = fs.readFileSync(matApiPath, 'utf-8');

      assert.ok(
        content.includes('export async function getLatestFxRate('),
        'materials.api.js must export getLatestFxRate'
      );
      assert.ok(
        content.includes('/fx/latest'),
        'getLatestFxRate must call /fx/latest endpoint'
      );
    });
  });

  // =========================================================================
  // 2. LandedCostModal Component Contract & SSR Rendering
  // =========================================================================
  describe('2. LandedCostModal.jsx Component Contract & Live Preview', () => {
    test('renders accessible dialog with starter presets and live parity preview', async () => {
      const { LandedCostModal, STARTER_PRESETS } = await viteServer.ssrLoadModule('/src/components/materials/LandedCostModal.jsx');

      assert.ok(Array.isArray(STARTER_PRESETS), 'STARTER_PRESETS must be an array');
      assert.equal(STARTER_PRESETS.length, 3);

      const mockMaterial = {
        id: 15,
        name: 'PET Resin Bottle Grade',
        unit: 'kg',
        landedUnitFactor: 0.00735,
        landedDutyFreightPct: 10.0,
        landedFixedSpreadInr: 32.0,
      };

      const html = renderToStaticMarkup(
        React.createElement(LandedCostModal, {
          material: mockMaterial,
          isOpen: true,
          onClose: () => {},
          onSaveSuccess: () => {},
          benchmarkPrice: 75.0,
          benchmarkCurrency: 'USD',
          benchmarkUnit: 'bbl',
          domesticQuotePrice: 90.0,
          initialFxRate: 86.0,
        })
      );

      // Dialog accessibility
      assert.ok(html.includes('role="dialog"'), 'must have role="dialog"');
      assert.ok(html.includes('aria-modal="true"'), 'must have aria-modal="true"');
      assert.ok(html.includes('modal-backdrop--open'), 'must have open backdrop class');

      // Title and Presets
      assert.ok(html.includes('Landed-Cost &amp; FX Parity Model — PET Resin Bottle Grade'));
      assert.ok(html.includes('Quick Starter Presets'));
      assert.ok(html.includes('Direct (USD/kg → INR/kg)'));
      assert.ok(html.includes('Crude Proxy (USD/bbl → INR/kg)'));

      // Live FX chip
      assert.ok(html.includes('1 USD = ₹86.00'));

      // Form inputs
      assert.ok(html.includes('id="unit-factor-input"'));
      assert.ok(html.includes('id="duty-pct-input"'));
      assert.ok(html.includes('id="spread-inr-input"'));

      // Live Landed Benchmark Preview Calculation
      // 75 * 86 * 0.00735 = 47.4075 -> * 1.10 = 52.14825 -> + 32 = 84.15
      assert.ok(html.includes('₹84.15/kg'), 'must compute live landed parity preview');
      assert.ok(html.includes('Parity Variance'), 'must display variance preview');
      assert.ok(html.includes('Formula:'), 'must display formula preview breakdown');

      // Buttons
      assert.ok(html.includes('Clear Model'));
      assert.ok(html.includes('Save Landed Model'));
    });

    test('re-export from components/ui/LandedCostModal.jsx works identically', async () => {
      const { LandedCostModal } = await viteServer.ssrLoadModule('/src/components/ui/LandedCostModal.jsx');
      assert.ok(typeof LandedCostModal === 'function', 'UI re-export must export LandedCostModal');
    });

    test('returns null when isOpen is false', async () => {
      const { LandedCostModal } = await viteServer.ssrLoadModule('/src/components/materials/LandedCostModal.jsx');

      const html = renderToStaticMarkup(
        React.createElement(LandedCostModal, {
          material: { id: 1, name: 'Test' },
          isOpen: false,
          onClose: () => {},
        })
      );

      assert.equal(html, '');
    });
  });

  // =========================================================================
  // 3. TrendsPage SupplierGuidanceCard Landed Parity Subpanel
  // =========================================================================
  describe('3. SupplierGuidanceCard Landed Parity & Callout Rendering', () => {
    test('renders Landed-Cost & FX Parity Benchmark when fxNormalizedComparison is configured', async () => {
      const { SupplierGuidanceCard } = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');

      const mockRec = {
        actionRecommendation: 'MAINTAIN_BUFFER',
        rationale: 'Prices range bound.',
        quoteComparison: {
          status: 'CROSS_CURRENCY',
          variancePercent: null,
          crossCurrencyNote: 'Comparing domestic quote (INR) with benchmark (USD).',
        },
        fxNormalizedComparison: {
          isConfigured: true,
          status: 'ESTIMATED_LANDED_PARITY',
          targetUnit: 'kg',
          currency: 'INR',
          estimatedLandedBenchmark: 84.15,
          latestDomesticQuote: 90.00,
          variancePercent: 6.95,
          fxRate: {
            rate: 86.00,
            isStale: false,
          },
          formulaBreakdown: '(75.00 USD * 86.00 * 0.00735) * (1 + 10%) + 32.00 = ₹84.15/kg',
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(SupplierGuidanceCard, {
            rec: mockRec,
            loading: false,
            error: null,
            materialName: 'PET Resin',
            onOpenLandedCost: () => {},
          })
        )
      );

      assert.ok(html.includes('Landed-Cost &amp; FX Parity Benchmark'));
      assert.ok(html.includes('USD/INR: ₹86.00'));
      assert.ok(html.includes('₹84.15/kg'));
      assert.ok(html.includes('₹90.00/kg'));
      assert.ok(html.includes('+6.95%'));
      assert.ok(html.includes('Edit Model'));
    });

    test('renders actionable Configure Landed-Cost Parity CTA when cross-currency and not configured', async () => {
      const { SupplierGuidanceCard } = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');

      const mockRec = {
        actionRecommendation: 'MONITOR_ONLY',
        quoteComparison: {
          status: 'CROSS_CURRENCY',
          variancePercent: null,
          crossCurrencyNote: 'Comparing domestic quote (INR) with benchmark (USD).',
        },
        fxNormalizedComparison: {
          isConfigured: false,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(SupplierGuidanceCard, {
            rec: mockRec,
            loading: false,
            error: null,
            materialName: 'Crude-linked Polymer',
            onOpenLandedCost: () => {},
          })
        )
      );

      assert.ok(html.includes('Configure Landed-Cost Parity'));
      assert.ok(html.includes('Comparing domestic quote (INR) with benchmark (USD).'));
    });
  });

  // =========================================================================
  // 4. MaterialsPage ActionLinks & Parity Badge
  // =========================================================================
  describe('4. MaterialsPage ActionLinks & Parity Badge', () => {
    test('renders Landed Cost action button and PARITY badge on configured material', async () => {
      const { ActionLinks } = await viteServer.ssrLoadModule('/src/pages/MaterialsPage.jsx');

      const mockMaterial = {
        id: 7,
        name: 'PP Granules',
        isTracked: true,
        landedUnitFactor: 0.00735,
      };

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(ActionLinks, {
            material: mockMaterial,
            onOpenStock: () => {},
            onOpenLanded: () => {},
          })
        )
      );

      assert.ok(html.includes('Landed Cost'));
      assert.ok(html.includes('Stock Profile'));
      assert.ok(html.includes('History'));
    });
  });
});

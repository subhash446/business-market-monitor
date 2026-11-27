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

describe('Stage B — Core Intelligence Screens, Trends Fixes, InsightCard & RBAC UI Guards', () => {
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

  describe('1. Shared RollingMetric Deterministic SSR Output', () => {
    test('renders exact static formatted values during SSR including formatFn, decimals, and fallback', async () => {
      const { RollingMetric } = await viteServer.ssrLoadModule('/src/components/ui/RollingMetric.jsx');

      const inrZeroHtml = renderToStaticMarkup(
        React.createElement(RollingMetric, {
          value: 0,
          formatFn: (v) => `₹${Math.round(v).toLocaleString('en-IN')}`,
        })
      );
      assert.ok(inrZeroHtml.includes('bmm-rolling-metric font-mono'));
      assert.ok(inrZeroHtml.includes('₹0'));

      const inrValHtml = renderToStaticMarkup(
        React.createElement(RollingMetric, {
          value: 123456,
          formatFn: (v) => `₹${Math.round(v).toLocaleString('en-IN')}`,
          testId: 'roi-metric',
        })
      );
      assert.ok(inrValHtml.includes('data-testid="roi-metric"'));
      assert.ok(inrValHtml.includes('₹1,23,456'));

      const signedHtml = renderToStaticMarkup(
        React.createElement(RollingMetric, {
          value: 4.5,
          prefix: '$',
          suffix: '%',
          decimals: 1,
          showPlusSign: true,
        })
      );
      assert.ok(signedHtml.includes('$+4.5%'));

      const invalidHtml = renderToStaticMarkup(
        React.createElement(RollingMetric, { value: 'not-a-number', prefix: '#', decimals: 0 })
      );
      assert.ok(invalidHtml.includes('#0'));
    });
  });

  describe('2. DashboardPage & TrendsPage Standalone SSR + Runtime Fixes', () => {
    test('DashboardPage renders safely inside MemoryRouter without AuthProvider and uses RollingMetric on KPIs', async () => {
      const { DashboardPage } = await viteServer.ssrLoadModule('/src/pages/DashboardPage.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(DashboardPage))
      );

      assert.ok(html.length > 0, 'DashboardPage must render markup safely');
      const source = fs.readFileSync(path.join(srcRoot, 'pages/DashboardPage.jsx'), 'utf-8');
      assert.ok(source.includes('useContext(AuthContext)'), 'DashboardPage must read AuthContext optionally via useContext');
      assert.ok(source.includes('RollingMetric'), 'DashboardPage must wire shared RollingMetric');
      assert.ok(source.includes('kpi-savings-roi'), 'DashboardPage must preserve #kpi-savings-roi');
    });

    test('TrendsPage renders safely in MemoryRouter without AuthProvider, fixes _loadHistory call, and fills IDLE chart areas', async () => {
      const { TrendsPage, SupplierGuidanceCard } = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(TrendsPage))
      );
      assert.ok(html.includes('id="ph-chart-area"'));
      assert.ok(html.includes('id="cmp-chart-area"'));
      assert.ok(
        html.includes('Select a material to inspect price history'),
        'TrendsPage IDLE history tab must show guidance EmptyState instead of blank void'
      );
      assert.ok(
        html.includes('Compare multiple tracked materials'),
        'TrendsPage IDLE compare tab must show guidance EmptyState instead of blank void'
      );

      const trendsSource = fs.readFileSync(path.join(srcRoot, 'pages/TrendsPage.jsx'), 'utf-8');
      assert.equal(
        trendsSource.includes('loadPriceHistory('),
        false,
        'TrendsPage must NOT call undefined loadPriceHistory(phMaterialId, phPage)'
      );
      assert.ok(
        trendsSource.includes('_loadHistory(histPage || 1)'),
        'TrendsPage onQuoteLogged must call _loadHistory(histPage || 1)'
      );
      assert.ok(
        trendsSource.includes("import '../styles/pages/materials.css';"),
        'TrendsPage must import materials.css for LandedCostModal and WhatsAppCopilotModal styles'
      );
      assert.ok(
        trendsSource.includes("isViewer ? () => setShowLandedCostModal(true) : undefined") &&
        trendsSource.includes("isViewer ? () => setShowCopilotModal(true) : undefined"),
        'TrendsPage must gate modal write handlers when VIEWER role is active'
      );

      const viewerHtml = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            AuthContext.Provider,
            { value: { user: { businessRole: 'VIEWER' }, business: { businessRole: 'VIEWER' } } },
            React.createElement(TrendsPage)
          )
        )
      );
      assert.ok(viewerHtml.includes('id="ph-chart-area"'));

      const readOnlyGuidanceHtml = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(SupplierGuidanceCard, {
            loading: false,
            error: null,
            materialName: 'PET Resin',
            rec: {
              recommendedAction: 'MONITOR',
              quoteComparison: { variancePercent: null, crossCurrencyNote: 'USD vs INR' },
              fxNormalizedComparison: { isConfigured: true, estimatedLandedBenchmark: 112.5, targetUnit: 'kg', fxRate: { rate: 84.5 } },
            },
          })
        )
      );
      assert.equal(readOnlyGuidanceHtml.includes('whatsapp-copilot-trends-btn'), false);
      assert.equal(readOnlyGuidanceHtml.includes('Edit Model'), false);
    });
  });

  describe('3. InsightCard Deterministic SSR (No Date.now Skew)', () => {
    test('renders bit-for-bit identical HTML across repeated SSR invocations and preserves fallback evidence markup', async () => {
      const { InsightCard } = await viteServer.ssrLoadModule('/src/components/ui/InsightCard.jsx');
      const sampleInsight = {
        id: 7,
        outlook: 'BULLISH',
        confidence: 'HIGH',
        headline: 'Upstream naphtha costs lifted domestic resin quotes.',
        what_happened: 'Benchmark prices rose 3.4% week-over-week.',
        why_it_happened: 'cracker turnarounds tightened regional supply.',
        business_impact: 'Procurement teams face higher near-term polymer costs.',
        evidence_price_points_count: 1,
        evidence_price_range: 'INR 110–118',
        evidence_news_count: 1,
        evidence_prices: [
          {
            id: 1,
            recorded_at: '2026-11-10T09:30:00.000Z',
            price: 115,
            currency: 'INR',
            unit_label: 'kg',
            data_class: 'SUPPLIER_QUOTE',
            provider_name: 'Malicious Price Provider',
            source_url: 'javascript:alert(1)',
          },
        ],
        evidence_news: [
          {
            id: 10,
            title: 'XSS News Headline',
            source_name: 'Market Desk',
            url: 'javascript:void(0)',
            published_at: '2026-11-11T08:00:00.000Z',
          },
        ],
        generated_at: '2026-11-17T12:00:00.000Z',
        model_used: 'gemini-2.5-flash',
      };

      const element = React.createElement(InsightCard, {
        insight: sampleInsight,
        defaultShowEvidence: true,
      });

      const originalNow = Date.now;
      let html1;
      let html2;
      try {
        Date.now = () => Date.parse('2026-11-17T12:01:00.000Z');
        html1 = renderToStaticMarkup(element);
        Date.now = () => Date.parse('2026-11-25T18:45:00.000Z');
        html2 = renderToStaticMarkup(element);
      } finally {
        Date.now = originalNow;
      }

      assert.equal(html1, html2, 'InsightCard SSR output must be deterministic regardless of Date.now()');
      assert.equal(html1.includes('m ago'), false, 'SSR must not bake Date.now()-derived relative minutes');
      assert.ok(html1.includes('<span>Malicious Price Provider</span>'));
      assert.ok(html1.includes('<span class="insight-evidence__article-title">XSS News Headline</span>'));
    });
  });

  describe('4. Stage B Stylesheets & VIEWER RBAC UI Guards', () => {
    test('dashboard.css, materials.css, trends.css, InsightCard.css, and MaterialImpactPanel.css eliminate 3px left border stripes and support reduced motion', () => {
      const files = [
        'styles/pages/dashboard.css',
        'styles/pages/materials.css',
        'styles/pages/trends.css',
        'components/ui/InsightCard.css',
        'components/ui/MaterialImpactPanel.css',
      ];

      for (const rel of files) {
        const css = fs.readFileSync(path.join(srcRoot, rel), 'utf-8');
        assert.equal(
          css.includes('border-left: 3px solid'),
          false,
          `${rel} must not contain banned border-left: 3px solid accent stripes`
        );
        assert.ok(
          css.includes('prefers-reduced-motion: reduce'),
          `${rel} must respect prefers-reduced-motion: reduce`
        );
      }

      const impactCss = fs.readFileSync(path.join(srcRoot, 'components/ui/MaterialImpactPanel.css'), 'utf-8');
      assert.ok(impactCss.includes('white-space: normal'), 'MaterialImpactPanel badges must wrap cleanly on 360px screens');
      assert.ok(impactCss.includes('.impact-chain-card:focus-within'));

      const trendsCss = fs.readFileSync(path.join(srcRoot, 'styles/pages/trends.css'), 'utf-8');
      assert.ok(trendsCss.includes('@media (max-width: 480px)'));
      assert.ok(trendsCss.includes('.outlook-band-values'));
    });

    test('MaterialsPage StockCoverBadge and modals enforce StockCover gauges and VIEWER readOnly UI guards', async () => {
      const { StockCoverBadge, ActionLinks } = await viteServer.ssrLoadModule('/src/pages/MaterialsPage.jsx');

      const criticalHtml = renderToStaticMarkup(
        React.createElement(StockCoverBadge, {
          material: {
            isTracked: true,
            currentStockQty: 50,
            dailyConsumptionRate: 25,
            supplierLeadTimeDays: 7,
          },
        })
      );
      assert.ok(criticalHtml.includes('CRITICAL: 2d'));
      assert.ok(criticalHtml.includes('stock-cover-seg--danger'));

      const readOnlyUnconfiguredHtml = renderToStaticMarkup(
        React.createElement(StockCoverBadge, {
          material: { isTracked: true, currentStockQty: null, dailyConsumptionRate: null },
        })
      );
      assert.ok(readOnlyUnconfiguredHtml.includes('Unconfigured'));

      const linksHtml = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(ActionLinks, { material: { id: 42, isTracked: true } })
        )
      );
      assert.ok(linksHtml.includes('/trends?materialId=42'));
      assert.ok(linksHtml.includes('/prices?materialId=42'));
      assert.ok(linksHtml.includes('/materials/42/impact'));

      const materialsSource = fs.readFileSync(path.join(srcRoot, 'pages/MaterialsPage.jsx'), 'utf-8');
      assert.ok(materialsSource.includes('materials-viewer-banner'));
      assert.ok(materialsSource.includes('ReadOnlyContext'));

      for (const modalRel of [
        'components/materials/StockProfileModal.jsx',
        'components/materials/LandedCostModal.jsx',
        'components/ui/WhatsAppCopilotModal.jsx',
      ]) {
        const modalSrc = fs.readFileSync(path.join(srcRoot, modalRel), 'utf-8');
        assert.ok(modalSrc.includes('readOnly'), `${modalRel} must enforce readOnly guard for VIEWER role`);
      }
    });
  });
});

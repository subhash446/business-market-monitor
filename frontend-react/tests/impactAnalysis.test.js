import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

import {
  DEFAULT_IMPACT_MAX_DEPTH,
  HARD_IMPACT_MAX_DEPTH,
  getMaterialImpactAnalysis,
} from '../src/api/aiInsights.api.js';
import {
  STRUCTURAL_KB_DISCLOSURE,
  OBSERVED_EVIDENCE_DISCLOSURE,
  getCoverageMetadata,
  getEntityTypeMetadata,
  getDependencyTypeMetadata,
  getPriceDirectionMetadata,
  formatPercentChange,
  formatAgeDays,
  formatStaleStatus,
  formatImpactError,
} from '../src/utils/impactAnalysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

function createStorageMock(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function buildSampleImpactResponse(overrides = {}) {
  return {
    material: {
      id: 42,
      raw_material_id: 7,
      name: 'Refined Palm Oil',
      unit_abbreviation: 'kg',
      is_custom: false,
      is_tracked: true,
    },
    industry_id: 3,
    kb_impact: {
      evidence_classification: 'structural_only',
      coverage: 'multi_hop',
      traversal_direction: 'source_to_target',
      max_depth_applied: 3,
      summary: {
        total_chains: 1,
        max_observed_depth: 2,
        direct_count: 1,
        indirect_count: 1,
        cost_drivers_count: 1,
        external_factors_count: 1,
      },
      cost_drivers: ['Cooking & Frying Oil Cost'],
      external_factors: ['Export Levy Adjustment'],
      related_materials: ['Packaging Film'],
      chains: [
        {
          chain_id: '42-chain-1',
          depth: 2,
          path_label: 'Refined Palm Oil -> Cooking & Frying Oil Cost -> Export Levy Adjustment',
          terminal_entity: {
            entity_type: 'EXTERNAL_FACTOR',
            entity_id: 99,
            name: 'Export Levy Adjustment',
          },
          steps: [
            {
              hop: 1,
              dependency_id: 101,
              source_entity_type: 'RAW_MATERIAL',
              source_entity_id: 7,
              source_name: 'Refined Palm Oil',
              target_entity_type: 'COST_DRIVER',
              target_entity_id: 15,
              target_name: 'Cooking & Frying Oil Cost',
              dependency_type: 'DRIVES_COST',
              description: 'Structural input cost share in commercial kitchens.',
              evidence_nature: 'structural_only',
            },
            {
              hop: 2,
              dependency_id: 102,
              source_entity_type: 'COST_DRIVER',
              source_entity_id: 15,
              source_name: 'Cooking & Frying Oil Cost',
              target_entity_type: 'EXTERNAL_FACTOR',
              target_entity_id: 99,
              target_name: 'Export Levy Adjustment',
              dependency_type: 'INFLUENCES',
              description: null,
              evidence_nature: 'structural_only',
            },
          ],
        },
      ],
      warning: null,
    },
    empirical_evidence: {
      evidence_classification: 'observed_data_only',
      signal_assessment: {
        valid_price_count: 4,
        has_minimum_price_evidence: true,
        latest_recorded_at: '2026-11-10T09:30:00Z',
        days_since_latest_price: 2,
        is_price_stale: false,
        price_direction: 'UP',
        percent_change: 4.25,
        news_count: 1,
        has_contradictory_signals: false,
        warnings: ['Observed price series covers 14 days only.'],
      },
      relevant_news: [
        {
          id: 501,
          title: 'Malaysian Palm Oil Board Monthly Stock Report',
          source_name: 'Commodity Desk',
          published_at: '2026-11-09T12:00:00Z',
        },
      ],
    },
    latest_ai_insight: {
      id: 88,
      tracked_material_id: 42,
      headline: 'Palm oil wholesale quotes firmed this week.',
      what_happened: 'Observed quotes moved up 4.25% over 4 readings.',
      why_it_happened: 'Tight regional export availability.',
      business_impact: 'Marginal pressure on frying oil procurement.',
      outlook: 'BULLISH',
      confidence: 'MEDIUM',
      evidence_price_points_count: 4,
      evidence_news_count: 1,
      model_used: 'gemini-2.5-flash',
      generated_at: '2026-11-10T10:00:00Z',
    },
    ...overrides,
  };
}

describe('T-05 Step 4: Impact Analysis API & Helpers', () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;

  after(() => {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalLocalStorage;
    globalThis.sessionStorage = originalSessionStorage;
  });

  test('getMaterialImpactAnalysis validates materialId and maxDepth without silent coercion', async () => {
    let fetchCalls = 0;
    globalThis.localStorage = createStorageMock({ bmm_access_token: 'test-token-123' });
    globalThis.sessionStorage = createStorageMock();
    globalThis.fetch = async (url, options) => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          success: true,
          data: { ok: true, url, auth: options.headers.Authorization },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    assert.equal(DEFAULT_IMPACT_MAX_DEPTH, 3);
    assert.equal(HARD_IMPACT_MAX_DEPTH, 4);

    const resDefault = await getMaterialImpactAnalysis(42);
    assert.match(resDefault.url, /\/materials\/42\/impact-analysis\?maxDepth=3$/);
    assert.equal(resDefault.auth, 'Bearer test-token-123');

    const resDepth4 = await getMaterialImpactAnalysis('42', { maxDepth: 4 });
    assert.match(resDepth4.url, /\/materials\/42\/impact-analysis\?maxDepth=4$/);

    const callsAfterValid = fetchCalls;

    for (const badId of ['', '0', '-1', 'abc', 0, 1.5, null, undefined]) {
      await assert.rejects(
        () => getMaterialImpactAnalysis(badId),
        (err) => err.code === 'VALIDATION_ERROR' && err.status === 400
      );
    }

    for (const badDepth of [0, 5, 2.5, true, false, 'abc', null, '']) {
      await assert.rejects(
        () => getMaterialImpactAnalysis(42, { maxDepth: badDepth }),
        (err) => err.code === 'VALIDATION_ERROR' && err.status === 400
      );
    }

    assert.equal(fetchCalls, callsAfterValid, 'Invalid parameters must not trigger network calls');
  });

  test('impactAnalysis helpers cover all coverage statuses, null staleness, and error formatting', () => {
    assert.equal(
      STRUCTURAL_KB_DISCLOSURE,
      'Structural Knowledge-Base Relationships Only — These relationships describe possible structural pathways and are not proof of real-world causation.'
    );
    assert.match(OBSERVED_EVIDENCE_DISCLOSURE, /Observed Data Only/);

    for (const code of [
      'multi_hop',
      'direct_only',
      'custom_material_no_kb_links',
      'missing_industry_context',
      'no_kb_dependencies',
      'kb_unavailable',
    ]) {
      const meta = getCoverageMetadata(code);
      assert.equal(meta.code, code);
      assert.ok(meta.label.length > 0);
    }
    assert.equal(getCoverageMetadata('unexpected_code').code, 'unexpected_code');

    assert.equal(getEntityTypeMetadata('RAW_MATERIAL').label, 'Raw Material');
    assert.equal(getEntityTypeMetadata('COST_DRIVER').label, 'Cost Driver');
    assert.equal(getEntityTypeMetadata('EXTERNAL_FACTOR').label, 'External Factor');
    assert.equal(getEntityTypeMetadata('UNKNOWN_TYPE').label, 'UNKNOWN_TYPE');

    assert.equal(getDependencyTypeMetadata('DRIVES_COST'), 'Drives cost');
    assert.equal(getDependencyTypeMetadata('INFLUENCES'), 'Influences');
    assert.equal(getDependencyTypeMetadata('CORRELATES_WITH'), 'Correlates with');
    assert.equal(getDependencyTypeMetadata('OTHER_LINK'), 'OTHER LINK');
    assert.equal(getDependencyTypeMetadata(null), 'Structural link');

    assert.equal(getPriceDirectionMetadata('UP').label, 'Upward');
    assert.equal(getPriceDirectionMetadata('UNKNOWN').label, 'Unknown');

    assert.equal(formatPercentChange(3.5), '+3.50%');
    assert.equal(formatPercentChange(null), '—');
    assert.equal(formatAgeDays(null), 'No recorded price');
    assert.equal(formatAgeDays(0), 'Today');

    // Critical accuracy guard: missing latest_recorded_at with is_price_stale=false must NOT report recent
    assert.equal(
      formatStaleStatus({ valid_price_count: 0, latest_recorded_at: null, is_price_stale: false }).label,
      'No price history'
    );
    assert.equal(
      formatStaleStatus({ valid_price_count: 3, latest_recorded_at: '2026-09-01', is_price_stale: true }).label,
      'Stale (>30 days)'
    );

    assert.equal(formatImpactError({ status: 404 }).retryable, false);
    assert.equal(formatImpactError({ status: 400 }).retryable, false);
    assert.equal(formatImpactError({ status: 0 }).retryable, true);
    assert.equal(formatImpactError({ status: 500 }).retryable, true);
  });
});

describe('T-05 Step 4: JSX Component & Route Verification', () => {
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

  test('MaterialImpactPanel renders structural KB chains, observed evidence without fabricated links, and InsightCard', async () => {
    const { MaterialImpactPanel } = await viteServer.ssrLoadModule('/src/components/ui/MaterialImpactPanel.jsx');
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(MaterialImpactPanel, {
          materialId: 42,
          maxDepth: 3,
          data: buildSampleImpactResponse(),
        })
      )
    );

    assert.ok(html.includes(STRUCTURAL_KB_DISCLOSURE), 'must include verbatim structural disclosure');
    assert.ok(html.includes('Observed Data Only'), 'must label observed empirical evidence separately');
    assert.ok(html.includes('Multi-hop structural paths'), 'must show coverage label');
    assert.ok(html.includes('Raw Material'));
    assert.ok(html.includes('Cost Driver'));
    assert.ok(html.includes('External Factor'));
    assert.ok(html.includes('Drives cost'));
    assert.ok(html.includes('Influences'));
    assert.ok(html.includes('Refined Palm Oil -&gt; Cooking &amp; Frying Oil Cost -&gt; Export Levy Adjustment'));
    assert.ok(html.includes('Structural input cost share in commercial kitchens.'));
    assert.ok(html.includes('Malaysian Palm Oil Board Monthly Stock Report'));
    assert.ok(html.includes('Commodity Desk'));
    assert.ok(html.includes('Palm oil wholesale quotes firmed this week.'));
    assert.ok(html.includes('Bullish'), 'must render mapped InsightCard outlook for BULLISH');
    assert.ok(!html.includes('Generate Insight'), 'must never render AI trigger button');

    // News items only have id, title, source_name, published_at — never fabricate external news hrefs
    assert.ok(!html.includes('href="http'), 'must never invent external news URLs');

    // Depth buttons 1..4 with aria-pressed="true" only for active depth 3 inside accessible group
    assert.ok(html.includes('role="group" aria-label="Impact traversal depth"'));
    assert.ok(html.includes('aria-pressed="true">3</button>'));
    assert.ok(html.includes('aria-pressed="false">4</button>'));
  });

  test('MaterialImpactPanel handles custom material, missing price history, null AI insight, error & XSS escaping', async () => {
    const { MaterialImpactPanel } = await viteServer.ssrLoadModule('/src/components/ui/MaterialImpactPanel.jsx');

    const emptyData = buildSampleImpactResponse({
      material: {
        id: 77,
        raw_material_id: null,
        name: '<script>alert(1)</script> Custom Spice',
        unit_abbreviation: 'kg',
        is_custom: true,
        is_tracked: true,
      },
      industry_id: null,
      kb_impact: {
        evidence_classification: 'structural_only',
        coverage: 'custom_material_no_kb_links',
        traversal_direction: 'source_to_target',
        max_depth_applied: 3,
        summary: {
          total_chains: 0,
          max_observed_depth: 0,
          direct_count: 0,
          indirect_count: 0,
          cost_drivers_count: 0,
          external_factors_count: 0,
        },
        cost_drivers: [],
        external_factors: [],
        related_materials: [],
        chains: [],
        warning: 'Custom materials do not have seeded structural knowledge-base mappings.',
      },
      empirical_evidence: {
        evidence_classification: 'observed_data_only',
        signal_assessment: {
          valid_price_count: 0,
          has_minimum_price_evidence: false,
          latest_recorded_at: null,
          days_since_latest_price: null,
          is_price_stale: false,
          price_direction: 'UNKNOWN',
          percent_change: null,
          news_count: 0,
          has_contradictory_signals: false,
          warnings: [],
        },
        relevant_news: [],
      },
      latest_ai_insight: null,
    });

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(MaterialImpactPanel, {
          materialId: 77,
          maxDepth: 3,
          data: emptyData,
        })
      )
    );

    assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag must be escaped');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('Custom material (no KB links)'));
    assert.ok(
      html.includes('Custom materials do not have seeded structural knowledge-base mappings.'),
      'must render kb_impact.warning banner'
    );
    assert.ok(html.includes('No price history'));
    assert.ok(!html.includes('Recent (≤30 days)'), 'missing history must not display as recent');
    assert.ok(html.includes('No insight available yet'));

    const loadingHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(MaterialImpactPanel, {
          materialId: 42,
          loading: true,
        })
      )
    );
    assert.ok(loadingHtml.includes('skeleton'), 'initial load must render skeleton');

    const failedRefreshHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(MaterialImpactPanel, {
          materialId: 42,
          maxDepth: 4,
          data: buildSampleImpactResponse(),
          error: { status: 500, message: 'Server error' },
          onRefresh: () => {},
        })
      )
    );
    assert.ok(failedRefreshHtml.includes('role="alert"'), 'failed refresh should render inline alert');
    assert.ok(failedRefreshHtml.includes('Retry'), 'retryable failed refresh should offer Retry button');
    assert.ok(failedRefreshHtml.includes('Refined Palm Oil'), 'failed refresh should preserve prior loaded data');

    const errHtml = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(MaterialImpactPanel, {
          materialId: 999,
          error: { status: 404, message: 'Not found' },
          onRefresh: () => {},
        })
      )
    );
    assert.ok(errHtml.includes('Material not found'));
    assert.ok(!errHtml.includes('Try again'), '404 should not render Retry button');
  });

  test('MaterialImpactPage uses stale request guard and panel CSS supports mobile + focus-visible', () => {
    const pageSource = fs.readFileSync(path.join(frontendRoot, 'src/pages/MaterialImpactPage.jsx'), 'utf8');
    assert.match(pageSource, /createLatestRequestGuard/);
    assert.match(pageSource, /guard\.isCurrent\(seq\)/);
    assert.match(pageSource, /guard\.invalidate\(\)/);
    assert.ok(!pageSource.includes('generateInsight'), 'must never trigger synchronous AI generation');

    const cssSource = fs.readFileSync(path.join(frontendRoot, 'src/components/ui/MaterialImpactPanel.css'), 'utf8');
    assert.match(cssSource, /@media\s*\(max-width:\s*640px\)/);
    assert.match(cssSource, /\.impact-depth-btn:focus-visible/);
  });

  test('App.jsx mounts protected /materials/:materialId/impact route inside ProtectedRoute requireBusiness', () => {
    const appSource = fs.readFileSync(path.join(frontendRoot, 'src/App.jsx'), 'utf8');
    assert.match(appSource, /import\s+\{\s*MaterialImpactPage\s*\}\s+from\s+'\.\/pages\/MaterialImpactPage\.jsx'/);
    assert.match(
      appSource,
      /<Route element=\{<ProtectedRoute requireBusiness \/>\}>[\s\S]*<Route path="\/materials\/:materialId\/impact" element=\{<MaterialImpactPage \/>\} \/>[\s\S]*<\/Route>/
    );
  });

  test('MaterialsPage shows Impact link only for tracked materials and TrendsPage links cleanly without duplicating InsightCard', () => {
    const materialsSource = fs.readFileSync(path.join(frontendRoot, 'src/pages/MaterialsPage.jsx'), 'utf8');
    assert.match(materialsSource, /material\.isTracked && <ActionLinks material=\{material\} \/>/);
    assert.match(materialsSource, /to=\{`\/materials\/\$\{material\.id\}\/impact`\}/);

    const trendsSource = fs.readFileSync(path.join(frontendRoot, 'src/pages/TrendsPage.jsx'), 'utf8');
    assert.match(trendsSource, /to=\{`\/materials\/\$\{phMaterialId\}\/impact`\}/);
    const insightCardCount = (trendsSource.match(/<InsightCard\b/g) || []).length;
    assert.equal(insightCardCount, 1, 'TrendsPage must keep exactly one InsightCard');
  });
});

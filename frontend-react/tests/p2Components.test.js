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

describe('P2 JSX Component Verification (InsightCard & TrendsPage)', () => {
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

  test('InsightCard renders https evidence links and suppresses javascript:/data: schemes', async () => {
    const { InsightCard } = await viteServer.ssrLoadModule('/src/components/ui/InsightCard.jsx');

    const html = renderToStaticMarkup(
      React.createElement(InsightCard, {
        defaultShowEvidence: true,
        insight: {
          id: 10,
          headline: 'Wheat mandi prices rose modestly.',
          what_happened: 'Modal prices moved from INR 2,600 to INR 2,650.',
          why_it_happened: 'Seasonal arrival variations.',
          business_impact: 'Procurement cost slight increase.',
          outlook: 'NEUTRAL',
          confidence: 'MEDIUM',
          evidence_price_points_count: 2,
          evidence_news_count: 2,
          generated_at: '2026-11-10T10:00:00Z',
          model_used: 'gemini-2.5-flash',
          evidence_prices: [
            {
              id: 1,
              recorded_at: '2026-11-09',
              price: 2650,
              currency: 'INR',
              unit_label: 'INR/quintal',
              data_class: 'MARKET_INDICATIVE',
              provider_name: 'Malicious Price Provider',
              source_url: 'javascript:alert(1)',
            },
            {
              id: 2,
              recorded_at: '2026-11-10',
              price: 2660,
              currency: 'INR',
              unit_label: 'INR/quintal',
              data_class: 'MARKET_INDICATIVE',
              provider_name: 'Data.gov.in (Agmarknet)',
              source_url: 'https://data.gov.in/resource/wheat',
            },
          ],
          evidence_news: [
            {
              id: 3,
              title: 'XSS News Headline',
              url: 'data:text/html,<script>alert(1)</script>',
              source_name: 'Untrusted',
            },
            {
              id: 4,
              title: 'Official Mandi Dispatch',
              url: 'https://agmarknet.gov.in/news/wheat',
              source_name: 'Agmarknet',
            },
          ],
        },
      })
    );

    // Unsafe schemes must NEVER appear in rendered href attributes
    assert.equal(html.includes('javascript:'), false);
    assert.equal(html.includes('data:text/html'), false);

    // Domestic GOI evidence must render domestic disclosure, NOT crude USD/bbl proxy warning
    assert.equal(html.includes('Domestic Mandi Benchmark Disclosure'), true);
    assert.equal(html.includes('global commodity proxy pricing (USD/bbl)'), false);

    // Non-proxy GOI MARKET_INDICATIVE rows must render Mandi Benchmark, NEVER Proxy Benchmark
    assert.equal(html.includes('Mandi Benchmark'), true);
    assert.equal(html.includes('Proxy Benchmark'), false);

    // Genuine proxy MARKET_INDICATIVE records MUST still render Proxy Benchmark alongside Upstream disclosure
    const proxyIndicativeHtml = renderToStaticMarkup(
      React.createElement(InsightCard, {
        defaultShowEvidence: true,
        insight: {
          id: 12,
          headline: 'Crude feedstock proxy climbed.',
          what_happened: 'EIA backfill benchmark moved upward.',
          why_it_happened: 'Supply tightening.',
          business_impact: 'Downstream polymer pressure.',
          outlook: 'BULLISH',
          confidence: 'MEDIUM',
          evidence_price_points_count: 1,
          evidence_news_count: 0,
          generated_at: '2026-11-10T10:00:00Z',
          model_used: 'gemini-3.6-flash',
          evidence_prices: [
            {
              id: 21,
              recorded_at: '2026-11-10',
              price: 68.4,
              currency: 'USD',
              unit_label: 'USD/bbl',
              source: 'THIRD_PARTY_API',
              data_class: 'MARKET_INDICATIVE',
              provider_name: 'U.S. Energy Information Administration (EIA)',
              source_url: 'https://www.eia.gov',
            },
          ],
        },
      })
    );
    assert.equal(proxyIndicativeHtml.includes('Upstream Benchmark Disclosure'), true);
    assert.equal(proxyIndicativeHtml.includes('Proxy Benchmark'), true);
    assert.equal(proxyIndicativeHtml.includes('Domestic Mandi Benchmark Disclosure'), false);

    // Provider name and article title remain rendered safely as non-link spans
    assert.equal(html.includes('<span>Malicious Price Provider</span>'), true);
    assert.equal(html.includes('<span class="insight-evidence__article-title">XSS News Headline</span>'), true);

    // Valid https links remain clickable with rel="noopener noreferrer"
    assert.equal(html.includes('href="https://data.gov.in/resource/wheat"'), true);
    assert.equal(html.includes('href="https://agmarknet.gov.in/news/wheat"'), true);

    // WTI / BRENT crude proxy benchmark evidence MUST still display the USD/bbl proxy disclosure
    const wtiHtml = renderToStaticMarkup(
      React.createElement(InsightCard, {
        defaultShowEvidence: true,
        insight: {
          id: 11,
          headline: 'WTI Crude Oil prices gained this week.',
          what_happened: 'WTI proxy rose to USD 69.50/bbl.',
          why_it_happened: 'Tighter global crude inventories.',
          business_impact: 'Upstream resin feedstock costs may firm up.',
          outlook: 'BULLISH',
          confidence: 'MEDIUM',
          evidence_price_points_count: 1,
          evidence_news_count: 0,
          generated_at: '2026-11-10T10:00:00Z',
          model_used: 'gemini-2.5-flash',
          evidence_prices: [
            {
              id: 10,
              recorded_at: '2026-11-10',
              price: 69.5,
              currency: 'USD',
              unit_label: 'USD/bbl',
              data_class: 'OFFICIAL_BENCHMARK',
              provider_name: 'U.S. Energy Information Administration (EIA)',
              source_url: 'https://www.eia.gov',
            },
          ],
        },
      })
    );
    assert.equal(wtiHtml.includes('Upstream Benchmark Disclosure'), true);
    assert.equal(wtiHtml.includes('(USD/bbl)'), true);
  });

  test('TrendsPage renders proper UTF-8 punctuation without mojibake', async () => {
    const trendsSourcePath = path.join(frontendRoot, 'src/pages/TrendsPage.jsx');
    const source = fs.readFileSync(trendsSourcePath, 'utf8');

    assert.equal(source.includes('Select a material\u2026'), true);
    assert.equal(source.includes(' \u2014 Maximum of 5 materials can be compared.'), true);
    assert.equal(source.includes('\u00e2\u20ac\u00a6'), false);
    assert.equal(source.includes(' \u00e2\u20ac\u201d Maximum of 5 materials can be compared.'), false);

    const { TrendsPage } = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(TrendsPage))
    );

    assert.equal(html.includes('Select a material\u2026'), true);
    assert.equal(html.includes('\u00e2\u20ac\u00a6'), false);
  });

  test('T-01.2 — NewsCard preserves safe http/https links and blocks javascript:/data: schemes', async () => {
    const { NewsCard } = await viteServer.ssrLoadModule('/src/pages/NewsPage.jsx');

    const safeHttpsHtml = renderToStaticMarkup(
      React.createElement(NewsCard, {
        item: {
          id: 1,
          title: 'Global Packaging Resin Outlook',
          url: 'https://example.com/news/resin',
          sourceName: 'Market Wire',
          publishedAt: '2026-11-10T08:00:00Z',
        },
      })
    );
    assert.equal(safeHttpsHtml.includes('<a '), true);
    assert.equal(safeHttpsHtml.includes('href="https://example.com/news/resin"'), true);
    assert.equal(safeHttpsHtml.includes('target="_blank"'), true);
    assert.equal(safeHttpsHtml.includes('rel="noopener noreferrer"'), true);

    const safeHttpHtml = renderToStaticMarkup(
      React.createElement(NewsCard, {
        item: {
          id: 2,
          title: 'Local Freight Update',
          url: 'http://example.org/freight',
          sourceName: 'Freight Daily',
        },
      })
    );
    assert.equal(safeHttpHtml.includes('href="http://example.org/freight"'), true);
    assert.equal(safeHttpHtml.includes('rel="noopener noreferrer"'), true);

    for (const unsafeUrl of [
      'javascript:alert(1)',
      '  JaVaScRiPt:alert(document.cookie)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]) {
      const unsafeHtml = renderToStaticMarkup(
        React.createElement(NewsCard, {
          item: {
            id: 3,
            title: 'Untrusted News Item',
            url: unsafeUrl,
            sourceName: 'Suspicious Feed',
          },
        })
      );
      assert.equal(unsafeHtml.includes('<a '), false);
      assert.equal(unsafeHtml.includes('<a>'), false);
      assert.equal(unsafeHtml.includes('href='), false);
      assert.equal(unsafeHtml.includes('Untrusted News Item'), true);
    }
  });

  test('T-01.3 — OnboardingPage uses defined dark theme tokens from variables.css', () => {
    const onboardingPath = path.join(frontendRoot, 'src/pages/OnboardingPage.jsx');
    const variablesPath = path.join(frontendRoot, 'src/styles/variables.css');
    const onboardingSrc = fs.readFileSync(onboardingPath, 'utf8');
    const variablesSrc = fs.readFileSync(variablesPath, 'utf8');

    assert.equal(onboardingSrc.includes('--color-surface-subtle'), false);
    assert.equal(onboardingSrc.includes('--color-border-subtle'), false);
    assert.equal(onboardingSrc.includes('#f9fafb'), false);
    assert.equal(onboardingSrc.includes('#f3f4f6'), false);
    assert.equal(onboardingSrc.includes('text-muted'), false);

    assert.equal(onboardingSrc.includes('var(--color-bg-elevated)'), true);
    assert.equal(onboardingSrc.includes('var(--color-border)'), true);

    const definedTokens = new Set(
      Array.from(variablesSrc.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1])
    );
    for (const match of onboardingSrc.matchAll(/var\((--[a-z0-9-]+)/g)) {
      assert.equal(definedTokens.has(match[1]), true, `Undefined CSS variable ${match[1]} in OnboardingPage.jsx`);
    }
  });

  test('T-01.4 — Modal compiles safely and wires Escape/backdrop/close through safe dismiss helpers', async () => {
    const { Modal } = await viteServer.ssrLoadModule('/src/components/ui/Modal.jsx');
    const closedMarkup = renderToStaticMarkup(
      React.createElement(Modal, { isOpen: false, onClose: undefined, title: 'Settings' })
    );
    assert.equal(closedMarkup, '');

    const modalSrc = fs.readFileSync(path.join(frontendRoot, 'src/components/ui/Modal.jsx'), 'utf8');
    assert.equal(modalSrc.includes('handleModalEscapeKey(e, onClose)'), true);
    assert.equal(modalSrc.includes('handleModalBackdropClick(e, backdropRef.current, onClose)'), true);
    assert.equal(modalSrc.includes('safeInvokeClose(onClose)'), true);
  });
});

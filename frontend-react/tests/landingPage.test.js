import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

import {
  buildAreaPath,
  buildLinePath,
  nearestIndex,
  scaleLinear,
} from '../src/lib/chartGeometry.js';
import {
  HERO_SERIES,
  IMPACT_FLOW,
  SAMPLE_DATA_TAG,
  SILENT_SLOPE,
  DIGEST_PREVIEW_SAMPLE,
} from '../src/data/landingSample.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

describe('Landing Page — Geometry, Sample Data & SSR Verification', () => {
  // =========================================================================
  // 1. Chart Geometry Unit Tests
  // =========================================================================
  describe('1. Pure Chart Geometry (chartGeometry.js)', () => {
    test('scaleLinear maps domains to ranges accurately and handles zero-span safely', () => {
      const scale = scaleLinear({ domain: [0, 100], range: [0, 500] });
      assert.equal(scale(0), 0);
      assert.equal(scale(50), 250);
      assert.equal(scale(100), 500);

      // Inverted range
      const invScale = scaleLinear({ domain: [10, 20], range: [100, 0] });
      assert.equal(invScale(10), 100);
      assert.equal(invScale(15), 50);
      assert.equal(invScale(20), 0);

      // Zero span domain fallback
      const flatScale = scaleLinear({ domain: [50, 50], range: [0, 100] });
      assert.equal(flatScale(50), 50, 'Zero-span domain should return range midpoint');
    });

    test('buildLinePath constructs valid SVG path string', () => {
      const pts = [10, 20, 15, 25];
      const pathStr = buildLinePath(pts, 400, 200, 10);
      assert.ok(pathStr.startsWith('M '), 'Line path must start with M');
      assert.ok(pathStr.includes('L '), 'Line path must contain L commands');

      // Empty points
      assert.equal(buildLinePath([], 400, 200), '', 'Empty points should return empty string');
    });

    test('buildAreaPath constructs closed SVG area polygon', () => {
      const pts = [10, 20, 15, 25];
      const areaStr = buildAreaPath(pts, 400, 200, 10);
      assert.ok(areaStr.startsWith('M '), 'Area path must start with M');
      assert.ok(areaStr.endsWith('Z'), 'Area path must close with Z');
    });

    test('nearestIndex clamps and maps coordinates correctly', () => {
      const n = 30;
      const w = 560;

      assert.equal(nearestIndex(0, n, w), 0);
      assert.equal(nearestIndex(560, n, w), 29);
      assert.equal(nearestIndex(280, n, w), 15);
      assert.equal(nearestIndex(-50, n, w), 0, 'Negative x should clamp to index 0');
      assert.equal(nearestIndex(1000, n, w), 29, 'Excess x should clamp to max index');

      // Edge cases
      assert.equal(nearestIndex(100, 0, w), 0);
      assert.equal(nearestIndex(100, 1, w), 0);
    });
  });

  // =========================================================================
  // 2. HERO_SERIES Data & Math Invariant Verification
  // =========================================================================
  describe('2. Hand-Authored Sample Series Math Invariants', () => {
    test('each HERO_SERIES computed delta matches deltaPct within 0.1%', () => {
      const allowedSignals = ['ACCELERATE_PURCHASE', 'MONITOR_ONLY', 'DELAY_PURCHASE'];

      for (const [key, s] of Object.entries(HERO_SERIES)) {
        assert.equal(s.points.length, 30, `${key} series must have exactly 30 data points`);

        const first = s.points[0];
        const last = s.points[s.points.length - 1];
        const computed = ((last / first) - 1) * 100;
        const diff = Math.abs(computed - s.deltaPct);

        assert.ok(
          diff <= 0.1,
          `${key} computed delta ${computed.toFixed(3)}% deviates from stated ${s.deltaPct}% by ${diff.toFixed(3)}%`
        );

        assert.ok(
          allowedSignals.includes(s.signal),
          `${key} signal must be one of ${allowedSignals.join(', ')}`
        );
      }
    });

    test('IMPACT_FLOW defines 3 nodes with structural and observed edges', () => {
      assert.equal(IMPACT_FLOW.nodes.length, 3);
      assert.equal(IMPACT_FLOW.edges.length, 2);
      assert.equal(IMPACT_FLOW.edges[0].type, 'STRUCTURAL');
      assert.equal(IMPACT_FLOW.edges[1].type, 'OBSERVED');
    });

    test('SILENT_SLOPE defines 24 weeks and pass-through stats', () => {
      assert.equal(SILENT_SLOPE.weeks.length, 24);
      assert.equal(SILENT_SLOPE.verdictChip, 'SILENT SLOPE DETECTED');
      assert.ok(SILENT_SLOPE.stats.up.includes('92% in 6 days'));
      assert.ok(SILENT_SLOPE.stats.down.includes('23% in 34 days'));
    });

    test('DIGEST_PREVIEW_SAMPLE uses deterministic fixed date string', () => {
      assert.equal(DIGEST_PREVIEW_SAMPLE.fixedDateString, 'Tue 17 Nov · 7:00 AM');
    });
  });

  // =========================================================================
  // 3. SSR Rendering Verification
  // =========================================================================
  describe('3. Component SSR Rendering & Honesty Guarantees', () => {
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

    test('HeroWidget renders accessible tabs, sample tag, and exact backend signal', async () => {
      const { HeroWidget } = await viteServer.ssrLoadModule('/src/components/landing/HeroWidget.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(HeroWidget))
      );

      assert.ok(html.includes('role="tablist"'), 'HeroWidget must include role="tablist"');
      assert.ok(html.includes(SAMPLE_DATA_TAG), 'HeroWidget must display "Sample data · illustrative" tag');
      assert.ok(html.includes('PET Resin'), 'Must render PET Resin tab');
      assert.ok(html.includes('Brent Crude (proxy)'), 'Must render Brent Crude tab');
      assert.ok(html.includes('Wheat (Indore mandi)'), 'Must render Wheat tab');
      assert.ok(html.includes('ACCELERATE PURCHASE'), 'Must render ACCELERATE PURCHASE signal label');
    });

    test('ImpactFlow renders 3 connected nodes and structural/observed edges', async () => {
      const { ImpactFlow } = await viteServer.ssrLoadModule('/src/components/landing/ImpactFlow.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(ImpactFlow))
      );

      assert.ok(html.includes('Brent Crude Oil'));
      assert.ok(html.includes('Naphtha &amp; Freight') || html.includes('Naphtha & Freight'));
      assert.ok(html.includes('PET Resin'));
      assert.ok(html.includes('Refinery Cost Driver'));
      assert.ok(html.includes('Observed · 11-day lag · r 0.71'));
      assert.ok(html.includes(SAMPLE_DATA_TAG));
    });

    test('DigestPreview renders deterministic fixed date string and materials', async () => {
      const { DigestPreview } = await viteServer.ssrLoadModule('/src/components/landing/DigestPreview.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(DigestPreview))
      );

      assert.ok(html.includes('Tue 17 Nov · 7:00 AM'), 'Must include exact fixed date string');
      assert.ok(html.includes('WhatsApp Digest'));
      assert.ok(html.includes('Email Digest'));
      assert.ok(html.includes(SAMPLE_DATA_TAG));
    });

    test('LandingPage renders full page with zero live-demo or Hindi claims', async () => {
      const { LandingPage } = await viteServer.ssrLoadModule('/src/pages/LandingPage.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(LandingPage))
      );

      assert.ok(html.includes('Stop Overpaying for'));
      assert.ok(html.includes('Start Monitoring Free'));
      assert.ok(html.includes('SILENT SLOPE DETECTED'));
      assert.ok(html.includes('92% in 6 days'));
      assert.ok(html.includes('23% in 34 days'));
      assert.ok(html.includes('Self-Serve SME Access'));
      assert.ok(html.includes('Multi-Plant &amp; ERP Sync') || html.includes('Multi-Plant & ERP Sync'));
      assert.ok(
        html.includes('mailto:subhashyadav25177@gmail.com'),
        'Enterprise CTA must point to subhashyadav25177@gmail.com'
      );
      assert.ok(
        html.includes('subhashyadav25177@gmail.com'),
        'Enterprise card must display copyable email address helper'
      );
      assert.ok(html.includes('Business Market Monitor'));
      assert.ok(
        html.includes('© 2026 Business Market Monitor · Automated 7:00 AM Briefings') ||
        html.includes('&copy; 2026 Business Market Monitor · Automated 7:00 AM Briefings')
      );

      // Honesty boundaries
      assert.ok(!html.includes('View Live Demo'), 'Must NOT invent a live demo account button');
      assert.ok(!html.includes('Hindi'), 'Must NOT claim Hindi alerts when alerts are English');
      assert.ok(!html.includes('lp-nav__title-accent'), 'Must NOT use split accent styling on Monitor');
      assert.ok(!html.includes('Deterministic Invariants'), 'Must NOT use developer jargon in footer legal bar');
    });
  });
});

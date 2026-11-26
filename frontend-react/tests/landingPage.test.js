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
const srcRoot = path.join(frontendRoot, 'src');

describe('Landing Page — Geometry, Editorial Polish, Interactive Telemetry & SSR Verification', () => {
  // =========================================================================
  // 1. Chart Geometry Unit Tests
  // =========================================================================
  describe('1. Pure Chart Geometry (chartGeometry.js)', () => {
    test('scaleLinear maps domains to ranges accurately and handles zero-span safely', () => {
      const scale = scaleLinear({ domain: [0, 100], range: [0, 500] });
      assert.equal(scale(0), 0);
      assert.equal(scale(50), 250);
      assert.equal(scale(100), 500);

      const invScale = scaleLinear({ domain: [10, 20], range: [100, 0] });
      assert.equal(invScale(10), 100);
      assert.equal(invScale(15), 50);
      assert.equal(invScale(20), 0);

      const flatScale = scaleLinear({ domain: [50, 50], range: [0, 100] });
      assert.equal(flatScale(50), 50, 'Zero-span domain should return range midpoint');
    });

    test('buildLinePath constructs valid SVG path string', () => {
      const pts = [10, 20, 15, 25];
      const pathStr = buildLinePath(pts, 400, 200, 10);
      assert.ok(pathStr.startsWith('M '), 'Line path must start with M');
      assert.ok(pathStr.includes('L '), 'Line path must contain L commands');
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
  // 3. CSS Anti-Slop, WCAG Contrast & Deterministic SSR Safety Checks
  // =========================================================================
  describe('3. CSS Architecture, WCAG Craft & Deterministic SSR Contracts', () => {
    test('landing.css enforces WCAG AA contrast, #111113 cards, zero AI-slop stripes/gradients, and prefers-reduced-motion', () => {
      const css = fs.readFileSync(path.join(srcRoot, 'styles/landing.css'), 'utf-8');

      // WCAG AA muted ink & #111113 surface parity
      assert.ok(css.includes('--lp-text-muted: #9494a0'), 'Must raise muted ink to #9494a0 for WCAG AA contrast');
      assert.ok(css.includes('--lp-bg-card: #111113'), 'Must align primary card surface to #111113');

      // Removed AI-slop patterns & dead legacy code
      assert.ok(!css.includes('.lp-text-gradient'), 'Must remove repetitive .lp-text-gradient');
      assert.ok(!css.includes('font-weight: 800'), 'Must avoid faux-bold font-weight: 800');
      assert.ok(!css.includes('.lp-phone-bubble--whatsapp'), 'Must remove decorative 3px WhatsApp left stripe');
      assert.ok(!css.includes('.lp-phone-bubble--email'), 'Must remove decorative 3px Email left stripe');
      assert.ok(!css.includes('.lp-tiers-grid'), 'Must remove unused legacy .lp-tiers-grid dead CSS');
      assert.ok(!css.includes('box-shadow: 0 0 8px'), 'Must remove neon glowing hero dot box-shadow');

      // Accessibility, anchor clearing & motion hygiene
      assert.ok(css.includes('scroll-margin-top: 76px'), 'Anchored sections must clear 56px sticky navbar');
      assert.ok(css.includes('prefers-reduced-motion: reduce'), 'Must enforce prefers-reduced-motion safety');
      assert.ok(css.includes('@media (max-width: 479px)'), 'Must include 360px mobile nav overflow prevention');
      assert.ok(css.includes('@media (max-width: 440px)'), 'Must stack stats grid cleanly on narrow mobile viewports');

      // Living telemetry animations, marquee isolation, and symmetric 3-column grid
      assert.ok(css.includes('@keyframes lp-marquee'), 'Must define marquee keyframe animation');
      assert.ok(css.includes('@keyframes lp-line-pulse'), 'Must define travelling SVG pulse keyframe');
      assert.ok(css.includes('@keyframes lp-radar-pulse'), 'Must define live endpoint radar keyframe');
      assert.ok(css.includes('@keyframes lp-tab-progress'), 'Must define active tab cycle underline animation');
      assert.ok(css.includes('@keyframes lp-edge-pulse'), 'Must define ImpactFlow connector pulse keyframe');
      assert.ok(css.includes('@keyframes lp-dash-flow'), 'Must define ImpactFlow dashed flow keyframe');
      assert.ok(css.includes('@keyframes lp-wedge-breathe'), 'Must define SlopeChart margin wedge breathing keyframe');
      assert.ok(
        css.includes('grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)'),
        'ImpactFlow desktop chain must guarantee symmetric equal widths across all 3 cards'
      );
    });

    test('landing components contain zero unguarded dynamic time/random calls or phantom Tailwind classes', () => {
      const landingDir = path.join(srcRoot, 'components/landing');
      const filePaths = fs
        .readdirSync(landingDir)
        .filter((f) => f.endsWith('.jsx'))
        .map((f) => path.join(landingDir, f));
      filePaths.push(path.join(srcRoot, 'pages/LandingPage.jsx'));

      for (const filePath of filePaths) {
        const label = path.basename(filePath);
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        const codeOnly = rawContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        assert.ok(!codeOnly.includes('new Date('), `${label} must not call new Date() for deterministic SSR`);
        assert.ok(!codeOnly.includes('Date.now('), `${label} must not call Date.now() for deterministic SSR`);
        assert.ok(!codeOnly.includes('Math.random('), `${label} must not call Math.random() for deterministic SSR`);
        assert.ok(!codeOnly.includes('mr-1.5'), `${label} must not use unavailable Tailwind mr-1.5 class`);
        assert.ok(!codeOnly.includes('text-emerald-400'), `${label} must not use unavailable Tailwind text-emerald-400 class`);
      }
    });
  });

  // =========================================================================
  // 4. SSR Rendering Verification
  // =========================================================================
  describe('4. Component SSR Rendering & Honesty Guarantees', () => {
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

    test('LandingTicker renders procurement market tape with duplicated accessible track', async () => {
      const { LandingTicker } = await viteServer.ssrLoadModule('/src/components/landing/LandingTicker.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(LandingTicker))
      );

      assert.ok(html.includes('id="market-ticker"'), 'LandingTicker must render #market-ticker region');
      assert.ok(html.includes('PET RESIN'), 'Must include PET RESIN feed');
      assert.ok(html.includes('₹114.50/kg (+6.4%)'), 'Must display PET RESIN delta telemetry');
      assert.ok(html.includes('BRENT CRUDE'), 'Must include BRENT CRUDE feed');
      assert.ok(html.includes('WHEAT INDORE'), 'Must include WHEAT INDORE feed');
      assert.ok(html.includes('NAPHTHA &amp; FREIGHT') || html.includes('NAPHTHA & FREIGHT'));
      assert.ok(html.includes('SUPPLIER QUOTE GAP'));
      assert.ok(html.includes('ILLUSTRATIVE MARKET FEED'), 'Must anchor honesty feed badge');
      assert.ok(html.includes('aria-hidden="true"'), 'Duplicate marquee group must be aria-hidden for screen readers');
    });

    test('Hero renders complete deterministic Sentence #1 live telemetry readout in SSR', async () => {
      const { Hero } = await viteServer.ssrLoadModule('/src/components/landing/Hero.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(Hero))
      );

      assert.ok(html.includes('hero-live-terminal'), 'Hero must render live-typing terminal bar');
      assert.ok(html.includes('LIVE SIGNAL'), 'Hero live readout must include LIVE SIGNAL prefix');
      assert.ok(
        html.includes('PET Resin supplier quote ₹123.90 sits +8.2% above benchmark — accelerate purchase.'),
        'SSR must render full Sentence #1 immediately (never blank)'
      );
    });

    test('HeroWidget renders accessible tabs, progress underline, pulse line, radar dot, and 30d range bar', async () => {
      const { HeroWidget } = await viteServer.ssrLoadModule('/src/components/landing/HeroWidget.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(HeroWidget))
      );

      assert.ok(html.includes('role="tablist"'), 'HeroWidget must include role="tablist"');
      assert.ok(html.includes('lp-tab-progress'), 'Active tab must include auto-cycle progress underline');
      assert.ok(html.includes('lp-chart-pulse-line'), 'PriceChart must include travelling SVG signal pulse');
      assert.ok(html.includes('lp-endpoint-radar'), 'PriceChart must include Day-30 live radar ring');
      assert.ok(html.includes(SAMPLE_DATA_TAG), 'HeroWidget must display "Sample data · illustrative" tag');
      assert.ok(html.includes('PET Resin'), 'Must render PET Resin tab');
      assert.ok(html.includes('Brent Crude (proxy)'), 'Must render Brent Crude tab');
      assert.ok(html.includes('Wheat (Indore mandi)'), 'Must render Wheat tab');
      assert.ok(html.includes('ACCELERATE PURCHASE'), 'Must render ACCELERATE PURCHASE signal label');
      assert.ok(html.includes('30d Range:'), 'PriceChart must render 30d min/max telemetry range bar');
      assert.ok(html.includes('₹107.40') && html.includes('₹114.50'), 'Must display exact 30d min and max values');
    });

    test('SourcesStrip renders buyer-focused architectural hairline ledger', async () => {
      const { SourcesStrip } = await viteServer.ssrLoadModule('/src/components/landing/SourcesStrip.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(SourcesStrip))
      );

      assert.ok(html.includes('lp-sources-ledger'), 'SourcesStrip must render open hairline ledger');
      assert.ok(html.includes('EIA Global Energy'));
      assert.ok(html.includes('Agmarknet Mandis'));
      assert.ok(html.includes('Supply Chain Graph'));
      assert.ok(html.includes('Live FX Parity'));
      assert.ok(html.includes('WhatsApp &amp; Email Rails') || html.includes('WhatsApp & Email Rails'));
      assert.ok(!html.includes('775+'), 'SourcesStrip must remove outdated test-count filler');
    });

    test('ImpactFlow renders numbered chapter 01, connected edges, and causal edge description', async () => {
      const { ImpactFlow } = await viteServer.ssrLoadModule('/src/components/landing/ImpactFlow.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(ImpactFlow))
      );

      assert.ok(html.includes('01'), 'ImpactFlow must display editorial chapter index 01');
      assert.ok(html.includes('Brent Crude Oil'));
      assert.ok(html.includes('Naphtha &amp; Freight') || html.includes('Naphtha & Freight'));
      assert.ok(html.includes('PET Resin'));
      assert.ok(html.includes('Refinery Cost Driver'));
      assert.ok(html.includes('Observed · 11-day lag · r 0.71'));
      assert.ok(html.includes('lp-flow-edge__track'), 'ImpactFlow must render directional connector tracks');
      assert.ok(html.includes('lp-flow-edge__svg'), 'ImpactFlow must render inline flowing SVG connectors');
      assert.ok(html.includes('lp-flow-edge__pulse'), 'ImpactFlow OBSERVED edge must render travelling pulse');
      assert.ok(html.includes('lp-flow-edge__dash-flow'), 'ImpactFlow STRUCTURAL edge must render flowing dashes');
      assert.ok(html.includes('11-day transmission lag'), 'ImpactFlow must display causal edge mechanism description');
      assert.ok(html.includes(SAMPLE_DATA_TAG));
    });

    test('SilentSlope and SlopeChart render chapter 02, breathing spread wedge, peak pulse ring, and scrub readout', async () => {
      const { SilentSlope } = await viteServer.ssrLoadModule('/src/components/landing/SilentSlope.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(SilentSlope))
      );

      assert.ok(html.includes('02'), 'SilentSlope must display editorial chapter index 02');
      assert.ok(html.includes('SILENT SLOPE DETECTED'));
      assert.ok(html.includes('slope-spread-wedge'), 'SlopeChart must render shaded trapped-margin wedge polygon');
      assert.ok(html.includes('lp-slope-wedge--breathing'), 'SlopeChart idle wedge must animate softly');
      assert.ok(html.includes('lp-slope-peak-ring'), 'SlopeChart must render idle Week-12 spread pulse ring');
      assert.ok(html.includes('Hover chart to inspect week spread'), 'SlopeChart must render week scrub readout');
      assert.ok(html.includes('Trapped Margin Spread'), 'SlopeChart legend must include Trapped Margin Spread');
    });

    test('DigestPreview renders authentic WhatsApp ticks by default and Email header without fake domain', async () => {
      const { DigestPreview } = await viteServer.ssrLoadModule('/src/components/landing/DigestPreview.jsx');

      const waHtml = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(DigestPreview))
      );
      assert.ok(waHtml.includes('Tue 17 Nov · 7:00 AM'), 'Must include exact fixed date string');
      assert.ok(waHtml.includes('WhatsApp Digest'));
      assert.ok(waHtml.includes('Email Digest'));
      assert.ok(waHtml.includes('digest-whatsapp-view'), 'Default view must render WhatsApp bubble');
      assert.ok(waHtml.includes('✓✓'), 'WhatsApp view must render authentic double-tick receipt');
      assert.ok(waHtml.includes(SAMPLE_DATA_TAG));

      const emailHtml = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(DigestPreview, { initialChannel: 'email' }))
      );
      assert.ok(emailHtml.includes('digest-email-view'), 'Email mode must render inbox envelope card');
      assert.ok(emailHtml.includes('From:') && emailHtml.includes('Business Market Monitor'), 'Must show Business Market Monitor sender');
      assert.ok(
        emailHtml.includes('Subject: Morning Procurement Digest · Tue 17 Nov'),
        'Email view must show exact Subject header without unowned domain'
      );
      assert.ok(!emailHtml.includes('@businessmarketmonitor'), 'Must not invent unowned custom email domain');
    });

    test('LandingPage renders full page cleanly, preserves SSR reveal visibility, PricingPlansSection, and honesty boundaries', async () => {
      const { LandingPage } = await viteServer.ssrLoadModule('/src/pages/LandingPage.jsx');
      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(LandingPage))
      );

      // Zero-flash SSR guarantee: never render pending hidden state in SSR
      assert.ok(html.includes('lp-skip-link'), 'Must render skip-to-content accessibility link');
      assert.ok(html.includes('id="market-ticker"'), 'LandingPage must render continuous market ticker');
      assert.ok(!html.includes('lp-reveal--pending'), 'SSR HTML must NEVER start with hidden pending class');

      assert.ok(html.includes('Stop Overpaying for'));
      assert.ok(html.includes('Start Monitoring Free'));
      assert.ok(html.includes('SILENT SLOPE DETECTED'));
      assert.ok(html.includes('92% in 6 days'));
      assert.ok(html.includes('23% in 34 days'));
      assert.ok(html.includes('03'), 'AccessTiers must display editorial chapter index 03');
      assert.ok(html.includes('pricing-plans-section'), 'Must preserve PricingPlansSection compatibility');
      assert.ok(html.includes('Self-Serve SME Access'));
      assert.ok(html.includes('Multi-Plant &amp; ERP Sync') || html.includes('Multi-Plant & ERP Sync'));
      assert.ok(
        html.includes('https://mail.google.com/mail/?view=cm') &&
          (html.includes('to=subhashyadav25177%40gmail.com') || html.includes('to=subhashyadav25177@gmail.com')),
        'Enterprise CTA must point to pre-filled Gmail compose URL targeting subhashyadav25177@gmail.com'
      );
      assert.ok(
        html.includes('target="_blank"') && html.includes('rel="noopener noreferrer"'),
        'Enterprise CTA must open in a new tab safely'
      );
      assert.ok(!html.includes('lp-copy-email-row'));
      assert.ok(!html.includes('mailto:'));
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

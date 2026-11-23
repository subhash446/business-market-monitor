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

describe('V3-M5 SaaS Layer — 3-Column Pricing & Early Access Experience', () => {
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
  // 1. Component File Structure & Deterministic Invariant Checks
  // =========================================================================
  describe('1. Component File Structure & Deterministic Invariants', () => {
    test('PricingPlansSection.jsx and EarlyAccessPlanModal.jsx exist and enforce deterministic rendering', () => {
      const sectionPath = path.join(srcRoot, 'components/billing/PricingPlansSection.jsx');
      const modalPath = path.join(srcRoot, 'components/billing/EarlyAccessPlanModal.jsx');
      const cssPath = path.join(srcRoot, 'styles/components/pricing-plans.css');

      assert.ok(fs.existsSync(sectionPath), 'PricingPlansSection.jsx must exist');
      assert.ok(fs.existsSync(modalPath), 'EarlyAccessPlanModal.jsx must exist');
      assert.ok(fs.existsSync(cssPath), 'pricing-plans.css must exist');

      const sectionContent = fs.readFileSync(sectionPath, 'utf-8');
      const modalContent = fs.readFileSync(modalPath, 'utf-8');

      // Deterministic SSR guarantees: no random or time-dependent state
      assert.ok(!sectionContent.includes('Math.random()'), 'PricingPlansSection must not use Math.random()');
      assert.ok(!sectionContent.includes('Date.now()'), 'PricingPlansSection must not use Date.now()');
      assert.ok(!modalContent.includes('Math.random()'), 'EarlyAccessPlanModal must not use Math.random()');
      assert.ok(!modalContent.includes('Date.now()'), 'EarlyAccessPlanModal must not use Date.now()');
    });

    test('pricing-plans.css defines dark Zinc surfaces and responsive 3-column layout', () => {
      const cssPath = path.join(srcRoot, 'styles/components/pricing-plans.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.pricing-plans-section'), 'CSS must define .pricing-plans-section');
      assert.ok(content.includes('.pricing-grid'), 'CSS must define .pricing-grid');
      assert.ok(content.includes('grid-template-columns: repeat(3, 1fr)'), 'CSS must define 3 equal columns for desktop');
      assert.ok(content.includes('@media (max-width: 960px)'), 'CSS must include responsive breakpoint for <= 960px');
      assert.ok(content.includes('.pricing-card--recommended'), 'CSS must define recommended elevated card styling');
      assert.ok(content.includes('.early-access-modal'), 'CSS must define .early-access-modal');
    });
  });

  // =========================================================================
  // 2. PricingPlansSection SSR Rendering (Landing & Settings Modes)
  // =========================================================================
  describe('2. PricingPlansSection SSR Rendering', () => {
    test('renders 3-column grid in mode="landing" with free registration link and modal triggers', async () => {
      const { PricingPlansSection } = await viteServer.ssrLoadModule('/src/components/billing/PricingPlansSection.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(PricingPlansSection, { mode: 'landing' })
        )
      );

      // Segmented control
      assert.ok(html.includes('Monthly'), 'Must include Monthly billing option');
      assert.ok(html.includes('Annual'), 'Must include Annual billing option');
      assert.ok(html.includes('Save 20%'), 'Must include Save 20% discount badge');

      // Tiers
      assert.ok(html.includes('Starter'), 'Must render Starter tier title');
      assert.ok(html.includes('Growth'), 'Must render Growth tier title');
      assert.ok(html.includes('Enterprise'), 'Must render Enterprise tier title');

      // Prices
      assert.ok(html.includes('₹0'), 'Must render ₹0 for Starter tier');
      assert.ok(html.includes('₹2,499'), 'Must render ₹2,499 default monthly price for Growth');
      assert.ok(html.includes('₹6,999'), 'Must render ₹6,999 default monthly price for Enterprise');

      // Badges
      assert.ok(html.includes('Self-Serve SME Access'), 'Must render Self-Serve SME Access badge');
      assert.ok(html.includes('Recommended'), 'Must render Recommended badge on Growth');
      assert.ok(
        html.includes('Multi-Plant &amp; ERP Sync') || html.includes('Multi-Plant & ERP Sync'),
        'Must render Multi-Plant & ERP Sync badge on Enterprise'
      );

      // CTAs in landing mode
      assert.ok(
        html.includes('Start Monitoring Free') && html.includes('href="/register"'),
        'Starter card must link to /register with "Start Monitoring Free" CTA'
      );
      assert.ok(html.includes('Request Growth Access'), 'Growth card must render "Request Growth Access" button');
      assert.ok(html.includes('Contact for Enterprise'), 'Enterprise card must render "Contact for Enterprise" button');

      // Features
      assert.ok(html.includes('Official EIA &amp; Agmarknet benchmarks') || html.includes('Official EIA & Agmarknet benchmarks'));
      assert.ok(html.includes('Two-Way WhatsApp Quote Copilot'));
      assert.ok(html.includes('Dedicated WhatsApp Business API'));
    });

    test('renders 3-column grid in mode="settings" with disabled current plan pill and upgrade CTAs', async () => {
      const { PricingPlansSection } = await viteServer.ssrLoadModule('/src/components/billing/PricingPlansSection.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(PricingPlansSection, {
            mode: 'settings',
            currentWorkspaceName: 'Apex Polychem',
            userEmail: 'apex@example.com',
          })
        )
      );

      // Current plan status CTA in settings mode
      assert.ok(
        html.includes('Current Plan · Early Access Active'),
        'Starter card must display "Current Plan · Early Access Active" in settings mode'
      );
      assert.ok(
        html.includes('disabled=""') || html.includes('disabled'),
        'Current Plan button must be disabled'
      );

      // Paid tier upgrade CTAs in settings mode
      assert.ok(html.includes('Upgrade to Growth'), 'Growth card must render "Upgrade to Growth" CTA');
      assert.ok(html.includes('Contact for Enterprise'), 'Enterprise card must render "Contact for Enterprise" CTA');
    });
  });

  // =========================================================================
  // 3. EarlyAccessPlanModal SSR & Copy Verification
  // =========================================================================
  describe('3. EarlyAccessPlanModal SSR Rendering & Executive Copy', () => {
    test('returns null when isOpen is false', async () => {
      const { EarlyAccessPlanModal } = await viteServer.ssrLoadModule('/src/components/billing/EarlyAccessPlanModal.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(EarlyAccessPlanModal, {
            isOpen: false,
            plan: { id: 'growth', name: 'Growth', price: '₹2,499 / mo', billingCycle: 'monthly' },
          })
        )
      );

      assert.equal(html, '', 'EarlyAccessPlanModal must return empty markup when closed');
    });

    test('renders accessible dialog with executive copy, unlocked chip, and priority access CTA when open', async () => {
      const { EarlyAccessPlanModal } = await viteServer.ssrLoadModule('/src/components/billing/EarlyAccessPlanModal.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(EarlyAccessPlanModal, {
            isOpen: true,
            plan: { id: 'growth', name: 'Growth', price: '₹2,499 / mo', billingCycle: 'monthly' },
            mode: 'landing',
            currentWorkspaceName: 'Apex Polychem',
            userEmail: 'apex@example.com',
          })
        )
      );

      // Accessibility semantics
      assert.ok(html.includes('role="dialog"'), 'Must have role="dialog"');
      assert.ok(html.includes('aria-modal="true"'), 'Must have aria-modal="true"');

      // Title & Chips
      assert.ok(html.includes('Early Access — Paid Plans Launching Soon'), 'Must render title');
      assert.ok(html.includes('BMM Growth · ₹2,499 / mo'), 'Must render plan price chip');
      assert.ok(html.includes('All Features Unlocked'), 'Must render All Features Unlocked chip');

      // Executive copy
      assert.ok(
        html.includes('Automated subscription billing is rolling out shortly'),
        'Must explain automated subscription billing is launching shortly'
      );
      assert.ok(
        html.includes('all core procurement intelligence features are currently unlocked for your team at no cost'),
        'Must explain that all features are currently unlocked at no cost'
      );
      assert.ok(
        html.includes('Lock Early-Adopter Pricing'),
        'Must render "Lock Early-Adopter Pricing" primary button'
      );

      // Landing mode link
      assert.ok(
        html.includes('Start Free Account Now &rarr;') || html.includes('Start Free Account Now →'),
        'Landing mode must render "Start Free Account Now →" link'
      );
      assert.ok(html.includes('href="/register"'), 'Start Free link must point to /register');
    });
  });

  // =========================================================================
  // 4. Page Integration Verification (SettingsPage & AccessTiers)
  // =========================================================================
  describe('4. Page Integration Verification', () => {
    test('SettingsPage.jsx includes Plans & Billing tab, button ID, and early-access status card', () => {
      const pagePath = path.join(srcRoot, 'pages/SettingsPage.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');

      assert.ok(content.includes('id="tab-billing-btn"'), 'SettingsPage must contain #tab-billing-btn');
      assert.ok(content.includes('Plans &amp; Billing') || content.includes('Plans & Billing'));
      assert.ok(
        content.includes('Current Plan: Early Access — All Pro Features Unlocked at ₹0'),
        'SettingsPage must render Early Access unlocked status card'
      );
      assert.ok(
        content.includes('<PricingPlansSection'),
        'SettingsPage must mount PricingPlansSection'
      );
    });

    test('AccessTiers.jsx mounts PricingPlansSection in mode="landing" with transparency link', () => {
      const accessPath = path.join(srcRoot, 'components/landing/AccessTiers.jsx');
      const content = fs.readFileSync(accessPath, 'utf-8');

      assert.ok(content.includes('id="access"'), 'AccessTiers must keep #access section id');
      assert.ok(
        content.includes('<PricingPlansSection mode="landing" />') || content.includes('mode="landing"'),
        'AccessTiers must mount PricingPlansSection with mode="landing"'
      );
      assert.ok(
        content.includes('subhashyadav25177@gmail.com'),
        'AccessTiers must retain enterprise inquiry mailto/web link'
      );
    });
  });
});

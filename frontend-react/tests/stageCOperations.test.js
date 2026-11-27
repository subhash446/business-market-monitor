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

describe('Stage C — Operations, Feeds, Workspace Admin, Onboarding & Invites', () => {
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

  describe('1. PricesPage Bulk Preview Fix, Dark Banners & VIEWER Guards', () => {
    test('uses object-arg formatPriceDisplay(...).text in Bulk Preview, dark alert banners, and VIEWER guards', async () => {
      const { formatPriceDisplay } = await viteServer.ssrLoadModule('/src/utils/format.js');
      const formatted = formatPriceDisplay({ price: 112.5, currency: 'INR' });
      assert.equal(typeof formatted.text, 'string');
      assert.ok(formatted.text.includes('112.50'));

      const src = fs.readFileSync(path.join(srcRoot, 'pages/PricesPage.jsx'), 'utf-8');
      assert.equal(
        src.includes('formatPriceDisplay(row.price, row.currency)'),
        false,
        'PricesPage must not invoke positional formatPriceDisplay(row.price, row.currency) returning object in JSX'
      );
      assert.ok(
        src.includes('formatPriceDisplay({ price: row.price, currency: row.currency }).text'),
        'PricesPage Bulk Preview must render formatPriceDisplay({ price: row.price, currency: row.currency }).text'
      );

      for (const bannedHex of ['#fffbeb', '#eff6ff', '#92400e', '#1e40af', '#161b22']) {
        assert.equal(src.includes(bannedHex), false, `PricesPage.jsx must not hardcode ${bannedHex}`);
      }

      assert.ok(src.includes('id="pe-open-bulk-btn"'));
      assert.ok(src.includes('id="bulk-price-upload-modal"'));
      assert.ok(src.includes('Bulk Upload Prices'));
      assert.ok(src.includes('disabled={submitting || isViewer}'));
      assert.ok(src.includes('disabled={isViewer}'));
      assert.ok(src.includes('table-wrapper bulk-table-scroll'));
    });
  });

  describe('2. EarlyAccessPlanModal Z-Index & WCAG AA Pricing Contrast', () => {
    test('renders below --z-toast (1100) without phantom Tailwind classes and uses AA primary button contrast', async () => {
      const { EarlyAccessPlanModal } = await viteServer.ssrLoadModule(
        '/src/components/billing/EarlyAccessPlanModal.jsx'
      );

      const modalSrc = fs.readFileSync(
        path.join(srcRoot, 'components/billing/EarlyAccessPlanModal.jsx'),
        'utf-8'
      );
      assert.equal(modalSrc.includes('zIndex: 1050'), false, 'Modal backdrop must not sit near --z-toast');
      assert.equal(modalSrc.includes('text-emerald-400'), false, 'Modal must not use phantom Tailwind classes');
      assert.ok(modalSrc.includes('early-access-modal-backdrop'));

      const pricingCss = fs.readFileSync(
        path.join(srcRoot, 'styles/components/pricing-plans.css'),
        'utf-8'
      );
      const varsCss = fs.readFileSync(path.join(srcRoot, 'styles/variables.css'), 'utf-8');
      assert.ok(varsCss.includes('--z-toast:    1100') || varsCss.includes('--z-toast: 1100'));
      assert.ok(pricingCss.includes('.early-access-modal-backdrop'));
      assert.ok(pricingCss.includes('var(--z-modal, 400)'));
      assert.ok(
        pricingCss.includes('var(--color-primary-button, #2563eb)'),
        'Pricing primary CTA must use WCAG AA #2563eb token'
      );

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(EarlyAccessPlanModal, {
            isOpen: true,
            plan: { id: 'growth', name: 'Growth', price: '₹2,499 / mo', billingCycle: 'monthly' },
            mode: 'settings',
          })
        )
      );
      assert.ok(html.includes('data-testid="early-access-modal-backdrop"'));
      assert.equal(html.includes('z-index:1050'), false);
    });
  });

  describe('3. AlertsPage, NewsPage, SettingsPage & BusinessSettingsModal RBAC & Obsidian-Zinc', () => {
    test('AlertsPage decouples tabs, eliminates phantom table__cell & inline filter-group, and enforces VIEWER readOnly in RulesTable', async () => {
      const { RulesTable } = await viteServer.ssrLoadModule('/src/pages/AlertsPage.jsx');

      const emptyViewerHtml = renderToStaticMarkup(
        React.createElement(RulesTable, { rules: [], materials: [], readOnly: true })
      );
      assert.equal(
        emptyViewerHtml.includes('Create Alert Rule'),
        false,
        'RulesTable empty state must omit Create Alert Rule CTA for VIEWER'
      );

      const viewerRowHtml = renderToStaticMarkup(
        React.createElement(RulesTable, {
          rules: [
            {
              id: 1,
              trackedMaterialId: 10,
              conditionType: 'PRICE_ABOVE',
              thresholdPrice: 120,
              thresholdType: 'ABSOLUTE',
              notificationChannel: 'EMAIL',
              isActive: true,
            },
          ],
          materials: [{ id: 10, name: 'HDPE' }],
          readOnly: true,
        })
      );
      assert.ok(viewerRowHtml.includes('disabled'));

      const alertsSrc = fs.readFileSync(path.join(srcRoot, 'pages/AlertsPage.jsx'), 'utf-8');
      assert.equal(alertsSrc.includes('table__cell'), false);
      assert.equal(alertsSrc.includes('filter-group'), false);
      assert.equal(alertsSrc.includes('page-toolbar'), false);
      assert.ok(alertsSrc.includes('id="tab-rules"'));
      assert.ok(alertsSrc.includes('.alerts-tabs') || alertsSrc.includes('className="alerts-tabs"'));

      const alertsCss = fs.readFileSync(path.join(srcRoot, 'styles/pages/alerts.css'), 'utf-8');
      assert.ok(alertsCss.includes('.alerts-tabs'));
      assert.ok(alertsCss.includes('#93c5fd'));
    });

    test('NewsPage removes GitHub inline styles, 3px stripes, emojis & stale copy, and gates #btn-send-digest-now for isOwner', () => {
      const newsSrc = fs.readFileSync(path.join(srcRoot, 'pages/NewsPage.jsx'), 'utf-8');
      const newsCss = fs.readFileSync(path.join(srcRoot, 'styles/pages/news.css'), 'utf-8');

      for (const banned of ['#0d1117', '#161b22', '#21262d', '#30363d', '#005c4b', 'pending activation in the current version', '📊', '🎯', '🗞️']) {
        assert.equal(newsSrc.includes(banned), false, `NewsPage.jsx must not contain ${banned}`);
      }
      assert.equal(newsSrc.includes('borderLeft'), false);
      assert.equal(newsCss.includes('border-left: 3px solid'), false);
      assert.ok(newsSrc.includes('getSafeExternalUrl(n.url)'));
      assert.ok(newsSrc.includes('isOwner && (') && newsSrc.includes('id="btn-send-digest-now"'));
      assert.ok(newsCss.includes('prefers-reduced-motion: reduce'));
    });

    test('SettingsPage & BusinessSettingsModal eliminate low-contrast hexes, render Team EmptyState, and enforce VIEWER read-only mode', () => {
      const settingsSrc = fs.readFileSync(path.join(srcRoot, 'pages/SettingsPage.jsx'), 'utf-8');
      const modalSrc = fs.readFileSync(path.join(srcRoot, 'components/ui/BusinessSettingsModal.jsx'), 'utf-8');

      assert.ok(settingsSrc.includes('id="tab-billing-btn"'));
      assert.ok(settingsSrc.includes('settings-role-banner--viewer'));
      assert.ok(settingsSrc.includes('No team members yet'));
      assert.ok(settingsSrc.includes('role="tabpanel"'));
      assert.equal(settingsSrc.includes('#ef4444'), false);

      assert.equal(modalSrc.includes('#6b7280'), false, 'BusinessSettingsModal must replace failing #6b7280 contrast');
      assert.equal(modalSrc.includes('#d97706'), false, 'BusinessSettingsModal must replace #d97706 contrast');
      assert.ok(modalSrc.includes('isViewer'));
      assert.ok(modalSrc.includes('disabled={saving || loading || isViewer}'));
    });
  });

  describe('4. OnboardingPage Token Strictness & AcceptInvitePage Auth Alignment', () => {
    test('OnboardingPage strictly complies with variables.css tokens and AcceptInvitePage uses .auth-layout + visible info alert', async () => {
      const onboardingSrc = fs.readFileSync(path.join(srcRoot, 'pages/OnboardingPage.jsx'), 'utf-8');
      const onboardingCss = fs.readFileSync(path.join(srcRoot, 'styles/pages/onboarding.css'), 'utf-8');
      const variablesSrc = fs.readFileSync(path.join(srcRoot, 'styles/variables.css'), 'utf-8');

      for (const forbidden of ['--color-surface-subtle', '--color-border-subtle', '#f9fafb', '#f3f4f6', 'text-muted']) {
        assert.equal(onboardingSrc.includes(forbidden), false, `OnboardingPage.jsx must never include ${forbidden}`);
      }
      assert.ok(onboardingCss.includes('grid-column: 1 / -1'));

      const definedTokens = new Set(
        Array.from(variablesSrc.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1])
      );
      for (const match of onboardingSrc.matchAll(/var\((--[a-z0-9-]+)/g)) {
        assert.equal(definedTokens.has(match[1]), true, `Undefined variable ${match[1]} in OnboardingPage.jsx`);
      }

      const acceptSrc = fs.readFileSync(path.join(srcRoot, 'pages/AcceptInvitePage.jsx'), 'utf-8');
      assert.equal(acceptSrc.includes('auth-page'), false, 'AcceptInvitePage must migrate off unstyled .auth-page');
      assert.ok(acceptSrc.includes('auth-layout'));
      assert.ok(acceptSrc.includes('auth-card__header'));
      assert.ok(acceptSrc.includes('form-alert form-alert--info form-alert--visible'));
      assert.ok(acceptSrc.includes('id="accept-token-input"'));
    });
  });
});

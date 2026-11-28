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

describe('Stage A — App Shell, Obsidian-Zinc Tokens & Shared UI Primitives', () => {
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

  describe('1. Design Tokens, Fonts, Utilities & Orphaned Stylesheets', () => {
    test('variables.css aligns obsidian-zinc palette, contrast tokens, and elevated toast z-index', () => {
      const css = fs.readFileSync(path.join(srcRoot, 'styles/variables.css'), 'utf-8');

      assert.ok(css.includes('--color-bg-base:      #09090b') || css.includes('--color-bg-base: #09090b'));
      assert.ok(css.includes('--color-bg-surface:   #111113') || css.includes('--color-bg-surface: #111113'));
      assert.ok(css.includes('--color-bg-elevated:  #18181b') || css.includes('--color-bg-elevated: #18181b'));
      assert.ok(css.includes('--color-bg-hover:     #27272a') || css.includes('--color-bg-hover: #27272a'));
      assert.ok(css.includes('--color-bg-subtle:    #0e0e11') || css.includes('--color-bg-subtle: #0e0e11'));
      assert.ok(css.includes('--color-text-muted:     #9494a0') || css.includes('--color-text-muted: #9494a0'));
      assert.ok(css.includes('--color-bg-card:      #111113'));
      assert.ok(css.includes('--color-surface:      #111113'));
      assert.ok(css.includes('--color-bg-secondary: #141417'));
      assert.ok(css.includes('--color-accent:               #38bdf8') || css.includes('--color-accent: #38bdf8'));
      assert.ok(css.includes('--color-primary-button:       #2563eb'));
      assert.ok(css.includes('--color-info:           #60a5fa'));
      assert.ok(css.includes('--color-success:        #4ade80'));
      assert.ok(css.includes('--color-warning:        #fbbf24'));
      assert.ok(css.includes('--color-danger:              #f87171'));
      assert.ok(css.includes('--z-toast:    1100'));
    });

    test('utilities.css defines .mr-1, .mr-2, .mt-1, and .text-muted', () => {
      const css = fs.readFileSync(path.join(srcRoot, 'styles/utilities.css'), 'utf-8');
      assert.ok(css.includes('.mr-1'));
      assert.ok(css.includes('.mr-2'));
      assert.ok(css.includes('.mt-1'));
      assert.ok(css.includes('.text-muted'));
    });

    test('layout.css and components.css enforce zero 3px stripes and define modal sizes + chart skeleton', () => {
      const layoutCss = fs.readFileSync(path.join(srcRoot, 'styles/layout.css'), 'utf-8');
      const compCss = fs.readFileSync(path.join(srcRoot, 'styles/components.css'), 'utf-8');

      assert.ok(!layoutCss.includes('inset 3px 0 0'), 'Active nav pill must not use 3px left border stripe');
      assert.ok(layoutCss.includes('.sidebar__role-pill--owner'));
      assert.ok(layoutCss.includes('.header__role-pill--manager'));
      assert.ok(!compCss.includes('.toast--success { border-left: 3px'), 'Toasts must not use 3px left stripes');
      assert.ok(!compCss.includes('.toast--error { border-left: 3px'));
      assert.ok(compCss.includes('.modal--sm'));
      assert.ok(compCss.includes('.modal--lg'));
      assert.ok(compCss.includes('.form-alert--info'));
      assert.ok(compCss.includes('.btn--xs'));
      assert.ok(compCss.includes('.form-check'));
      assert.ok(compCss.includes('.form-label__optional'));
      assert.ok(compCss.includes('.chart-skeleton'));
    });

    test('index.html and index.css load Inter + JetBrains Mono and orphaned stylesheets are removed', () => {
      const html = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf-8');
      const entryCss = fs.readFileSync(path.join(srcRoot, 'styles/index.css'), 'utf-8');

      assert.ok(html.includes('Inter') && html.includes('JetBrains+Mono'));
      assert.ok(entryCss.includes('Inter') && entryCss.includes('JetBrains+Mono'));
      assert.equal(fs.existsSync(path.join(srcRoot, 'App.css')), false, 'Orphaned src/App.css must be deleted');
      assert.equal(
        fs.existsSync(path.join(srcRoot, 'styles/pages/landing.css')),
        false,
        'Orphaned legacy src/styles/pages/landing.css must be deleted'
      );
    });
  });

  describe('2. Shell & Shared UI Primitives SSR Contracts', () => {
    test('Sidebar renders full AI Market Intelligence Agent wordmark and safe role fallback without AuthProvider', async () => {
      const { Sidebar } = await viteServer.ssrLoadModule('/src/components/layout/Sidebar.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const fallbackHtml = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(Sidebar))
      );
      assert.ok(fallbackHtml.includes('AI Market Intelligence Agent'));
      assert.ok(fallbackHtml.includes('nav-settings-btn'));
      assert.equal(fallbackHtml.includes('nav-workspace-role'), false);

      const managerHtml = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(
            AuthContext.Provider,
            {
              value: {
                user: { email: 'buyer@acme.in', businessRole: 'PURCHASE_MANAGER' },
                business: { name: 'Acme Polymers', businessRole: 'PURCHASE_MANAGER', industry: { name: 'Plastics' } },
                logout: () => {},
              },
            },
            React.createElement(Sidebar)
          )
        )
      );
      assert.ok(managerHtml.includes('Acme Polymers'));
      assert.ok(managerHtml.includes('PURCHASE MANAGER'));
      assert.ok(managerHtml.includes('nav-workspace-role'));
    });

    test('AppLayout renders contextual route breadcrumb and safe header role fallback', async () => {
      const { AppLayout } = await viteServer.ssrLoadModule('/src/components/layout/AppLayout.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const fallbackHtml = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/materials'] },
          React.createElement(AppLayout)
        )
      );
      assert.ok(fallbackHtml.includes('Workspace'));
      assert.ok(fallbackHtml.includes('Materials'));

      const ownerHtml = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/trends'] },
          React.createElement(
            AuthContext.Provider,
            {
              value: {
                user: { email: 'founder@acme.in', businessRole: 'OWNER' },
                business: { name: 'Acme Polymers', businessRole: 'OWNER' },
              },
            },
            React.createElement(AppLayout)
          )
        )
      );
      assert.ok(ownerHtml.includes('Acme Polymers'));
      assert.ok(ownerHtml.includes('Trends &amp; Guidance') || ownerHtml.includes('Trends & Guidance'));
      assert.ok(ownerHtml.includes('header-role-pill'));
      assert.ok(ownerHtml.includes('OWNER'));
    });

    test('Skeleton renders semantic CSS classes across all variants without inline styles', async () => {
      const { Skeleton } = await viteServer.ssrLoadModule('/src/components/ui/Skeleton.jsx');

      for (const type of ['list', 'table', 'card', 'chart', 'panel']) {
        const html = renderToStaticMarkup(React.createElement(Skeleton, { type, rows: 2 }));
        assert.equal(html.includes('style='), false, `Skeleton type="${type}" must avoid inline styles`);
      }

      const chartHtml = renderToStaticMarkup(React.createElement(Skeleton, { type: 'chart' }));
      assert.ok(chartHtml.includes('chart-skeleton'), 'Chart skeleton must use .chart-skeleton class');
    });

    test('ToastProvider, Modal, and ConfirmDialog render safely during Node SSR', async () => {
      const { ToastProvider, ToastContext, useToast } = await viteServer.ssrLoadModule('/src/components/ui/Toast.jsx');
      const { ConfirmDialog } = await viteServer.ssrLoadModule('/src/components/ui/ConfirmDialog.jsx');

      assert.ok(ToastContext);
      assert.equal(typeof useToast, 'function');

      const toastHtml = renderToStaticMarkup(
        React.createElement(ToastProvider, null, React.createElement('div', null, 'ChildContent'))
      );
      assert.ok(toastHtml.includes('ChildContent'));

      const closedDialog = renderToStaticMarkup(
        React.createElement(ConfirmDialog, {
          isOpen: false,
          onClose: () => {},
          onConfirm: () => {},
          title: 'Delete',
          message: 'Confirm action?',
        })
      );
      assert.equal(closedDialog, '');
    });
  });
});

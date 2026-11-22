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

describe('V3-M1 — Inventory-Aware Buy Quantity & Timing Engine', () => {
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
  describe('1. materials.api.js updateMaterialInventory helper', () => {
    test('exports updateMaterialInventory targeting PATCH /materials/:id/inventory', () => {
      const matApiPath = path.join(srcRoot, 'api/materials.api.js');
      const content = fs.readFileSync(matApiPath, 'utf-8');

      assert.ok(
        content.includes('export async function updateMaterialInventory(materialId, inventoryData)'),
        'materials.api.js must export updateMaterialInventory'
      );
      assert.ok(
        content.includes('/inventory'),
        'updateMaterialInventory must call /materials/:materialId/inventory endpoint'
      );
      assert.ok(
        content.includes('patch('),
        'updateMaterialInventory must use PATCH method'
      );
    });
  });

  // =========================================================================
  // 2. StockProfileModal Component Contract & SSR Rendering
  // =========================================================================
  describe('2. StockProfileModal.jsx Component Contract & Live Preview', () => {
    test('renders accessible dialog with inputs and live coverage preview', async () => {
      const { StockProfileModal } = await viteServer.ssrLoadModule('/src/components/materials/StockProfileModal.jsx');

      const mockMaterial = {
        id: 42,
        name: 'Cold Rolled Steel Coil',
        unit: 'MT',
        currentStockQty: 100,
        dailyConsumptionRate: 10,
        supplierLeadTimeDays: 7,
        maxStorageDays: 30,
      };

      const html = renderToStaticMarkup(
        React.createElement(StockProfileModal, {
          material: mockMaterial,
          isOpen: true,
          onClose: () => {},
          onSaveSuccess: () => {},
        })
      );

      // Dialog accessibility
      assert.ok(html.includes('role="dialog"'), 'Must have role="dialog"');
      assert.ok(html.includes('aria-modal="true"'), 'Must have aria-modal="true"');
      assert.ok(html.includes('Stock Profile —') || html.includes('Stock Profile'), 'Must display title');
      assert.ok(html.includes('Cold Rolled Steel Coil'), 'Must display material name');

      // Visual overlay & visibility classes matching components.css & materials.css
      assert.ok(html.includes('modal-backdrop--open'), 'Must have modal-backdrop--open for visibility and pointer events');
      assert.ok(html.includes('modal-backdrop--visible'), 'Must retain modal-backdrop--visible alias');
      assert.ok(html.includes('modal'), 'Must have standard modal class for dialog container');
      assert.ok(html.includes('modal__header') || html.includes('modal-header'), 'Must have modal header');
      assert.ok(html.includes('modal__close') || html.includes('modal-close-btn'), 'Must have modal close button');
      assert.ok(html.includes('modal__body') || html.includes('modal-body'), 'Must have modal body');
      assert.ok(html.includes('modal__footer') || html.includes('modal-footer'), 'Must have modal footer');

      // Input IDs
      assert.ok(html.includes('id="stock-qty-input"'), 'Must render #stock-qty-input input');
      assert.ok(html.includes('id="burn-rate-input"'), 'Must render #burn-rate-input input');
      assert.ok(html.includes('id="lead-time-input"'), 'Must render #lead-time-input input');
      assert.ok(html.includes('id="max-storage-input"'), 'Must render #max-storage-input input');

      // Live preview calculations: 100 MT / 10 MT/day = 10 days cover
      assert.ok(html.includes('days of operational cover'), 'Must calculate days of operational cover');
      assert.ok(html.includes('LOW COVERAGE'), 'Cover of 10d vs lead of 7d is LOW risk');
      assert.ok(html.includes('Clear Profile'), 'Must provide Clear Profile button');
    });

    test('renders visible modal when material has null or undefined inventory profile', async () => {
      const { StockProfileModal } = await viteServer.ssrLoadModule('/src/components/materials/StockProfileModal.jsx');

      const mockMaterialNullInventory = {
        id: 99,
        name: 'Virgin HDPE Granules',
        unit: 'kg',
        currentStockQty: null,
        dailyConsumptionRate: null,
        supplierLeadTimeDays: null,
        maxStorageDays: null,
        inventory: null,
      };

      const html = renderToStaticMarkup(
        React.createElement(StockProfileModal, {
          material: mockMaterialNullInventory,
          isOpen: true,
          onClose: () => {},
          onSaveSuccess: () => {},
        })
      );

      assert.ok(html.includes('modal-backdrop--open'), 'Must render visible backdrop with modal-backdrop--open');
      assert.ok(html.includes('Stock Profile — Virgin HDPE Granules'), 'Must render title for unconfigured material');
      assert.ok(html.includes('id="stock-qty-input"'), 'Must render stock input');
    });

    test('handles zero stock (0 MT) strictly as valid critical stock', async () => {
      const { StockProfileModal } = await viteServer.ssrLoadModule('/src/components/materials/StockProfileModal.jsx');

      const mockMaterialZero = {
        id: 43,
        name: 'PP Granules Injection Grade',
        unit: 'kg',
        currentStockQty: 0,
        dailyConsumptionRate: 50,
        supplierLeadTimeDays: 10,
        maxStorageDays: null,
      };

      const html = renderToStaticMarkup(
        React.createElement(StockProfileModal, {
          material: mockMaterialZero,
          isOpen: true,
          onClose: () => {},
          onSaveSuccess: () => {},
        })
      );

      // Zero stock must show 0 days cover and CRITICAL risk
      assert.ok(html.includes('days of operational cover'), 'Zero stock must compute days cover');
      assert.ok(html.includes('CRITICAL STOCKOUT RISK'), 'Zero stock must show CRITICAL STOCKOUT RISK');
      assert.ok(html.includes('value="0"'), 'Input must retain value="0" rather than empty string');
    });

    test('returns null when isOpen is false', async () => {
      const { StockProfileModal } = await viteServer.ssrLoadModule('/src/components/materials/StockProfileModal.jsx');

      const html = renderToStaticMarkup(
        React.createElement(StockProfileModal, {
          material: { id: 1, name: 'Test' },
          isOpen: false,
          onClose: () => {},
          onSaveSuccess: () => {},
        })
      );

      assert.equal(html, '', 'StockProfileModal must render empty string when closed');
    });
  });

  // =========================================================================
  // 3. MaterialsPage Integration & Visual Affordances
  // =========================================================================
  describe('3. MaterialsPage.jsx Stock Profile Integration', () => {
    test('table and cards include Stock Cover column and ActionLinks Stock Profile trigger', () => {
      const pagePath = path.join(srcRoot, 'pages/MaterialsPage.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');

      // Table header includes Stock Cover
      assert.ok(content.includes("'Stock Cover'"), 'Table headers must include Stock Cover column');

      // Component wiring
      assert.ok(content.includes('<StockCoverBadge'), 'Must render StockCoverBadge');
      assert.ok(content.includes('Stock Profile'), 'Must include Stock Profile action trigger');
      assert.ok(content.includes('<StockProfileModal'), 'Must mount StockProfileModal');
      assert.ok(content.includes('updateMaterialInventory') || content.includes('handleStockSaved'), 'Must handle stock save');

      // Context wiring for StockModalContext
      assert.ok(
        content.includes('<StockModalContext.Provider value={setStockModalMaterial}>'),
        'MaterialsPage must wrap list in StockModalContext.Provider'
      );
      assert.ok(
        content.includes('const contextOpenStock = useContext(StockModalContext);'),
        'ActionLinks must consume StockModalContext'
      );
    });

    test('materials.css contains visible modal backdrop and dialog rules', () => {
      const cssPath = path.join(srcRoot, 'styles/pages/materials.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(css.includes('.modal-backdrop--open'), 'materials.css must support .modal-backdrop--open');
      assert.ok(css.includes('.modal-backdrop--visible'), 'materials.css must support .modal-backdrop--visible');
      assert.ok(css.includes('.stock-modal'), 'materials.css must define .stock-modal');
    });

    test('ActionLinks and StockCoverBadge render clickable Stock Profile buttons when tracked', async () => {
      const { ActionLinks, StockCoverBadge } = await viteServer.ssrLoadModule('/src/pages/MaterialsPage.jsx');

      const mockTracked = {
        id: 77,
        name: 'PP Homopolymer',
        unit: 'kg',
        isTracked: true,
        currentStockQty: null,
        dailyConsumptionRate: null,
      };

      // 1. Unconfigured material in StockCoverBadge -> "+ Stock Profile"
      const badgeHtml = renderToStaticMarkup(
        React.createElement(StockCoverBadge, {
          material: mockTracked,
          onOpenStock: () => {},
        })
      );
      assert.ok(badgeHtml.includes('+ Stock Profile'), 'Unconfigured material must display + Stock Profile button');

      // 2. ActionLinks for tracked material -> "Stock Profile"
      const actionHtml = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(ActionLinks, {
            material: mockTracked,
            onOpenStock: () => {},
          })
        )
      );
      assert.ok(actionHtml.includes('Stock Profile'), 'ActionLinks must render Stock Profile button');
    });
  });

  // =========================================================================
  // 4. TrendsPage SupplierGuidanceCard & Reorder Decision Subpanel
  // =========================================================================
  describe('4. TrendsPage.jsx Smart Reorder Decision & Buy Minimum Bridge', () => {
    test('renders BUY_MINIMUM_BRIDGE override, stock stale warning, and unit-safe valuation note', async () => {
      const { SupplierGuidanceCard } = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');

      const mockRecWithBridge = {
        actionRecommendation: 'BUY_MINIMUM_BRIDGE',
        rationale: 'Market trend is falling, but stock is at 2.5d vs 7d lead time.',
        bufferStrategy: {
          targetBufferDays: 15,
          priority: 'CRITICAL',
          detailedGuidance: 'Place minimum bridge order immediately.',
        },
        inventoryDecision: {
          hasInventoryProfile: true,
          stockoutRisk: 'CRITICAL',
          isBridgeOverride: true,
          isStockStale: true,
          daysSinceUpdate: 18,
          daysOfCover: 2.5,
          recommendedOrderQty: 450,
          isStorageCapped: false,
          estimatedOrderValue: null,
          currency: null,
          valuationNote: 'Domestic quote required for MT valuation; current proxy is USD/bbl.',
          decisionSummary: 'Place immediate minimum bridge order of 450 MT to maintain factory continuity.',
        },
        unit: 'MT',
      };

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(SupplierGuidanceCard, {
            rec: mockRecWithBridge,
            loading: false,
            error: null,
            materialName: 'Cold Rolled Steel',
          })
        )
      );

      // Reorder decision panel
      assert.ok(html.includes('id="reorder-decision-panel"'), 'Must render #reorder-decision-panel');
      assert.ok(html.includes('Smart Reorder &amp; Inventory Decision') || html.includes('Smart Reorder & Inventory Decision'), 'Must render reorder title');

      // Pill and override callout
      assert.ok(html.includes('supplier-action-pill--bridge'), 'Must render supplier-action-pill--bridge');
      assert.ok(html.includes('BUY MINIMUM BRIDGE'), 'Must display BUY MINIMUM BRIDGE badge label');
      assert.ok(html.includes('bridge-override-callout'), 'Must render .bridge-override-callout');
      assert.ok(html.includes('Critical Stockout Override:'), 'Must explain critical stockout override reason');

      // Staleness warning
      assert.ok(html.includes('stock-stale-warning'), 'Must render .stock-stale-warning');
      assert.ok(html.includes('Stock updated 18 days ago'), 'Must report 18 days staleness');

      // Metrics & unit-safe valuation note
      assert.ok(html.includes('2.5d'), 'Must render 2.5d days of cover');
      assert.ok(html.includes('450 MT'), 'Must render 450 MT recommended order qty');
      assert.ok(html.includes('Domestic quote required for MT valuation; current proxy is USD/bbl.'), 'Must display unit-safe valuation note when value is null');
      assert.ok(html.includes('Place immediate minimum bridge order of 450 MT'), 'Must display decision summary');
    });

    test('renders unconfigured stock profile notice with link to /materials when profile is absent', async () => {
      const { SupplierGuidanceCard } = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');

      const mockRecUnconfigured = {
        actionRecommendation: 'MAINTAIN_BUFFER',
        rationale: 'Prices stable.',
        bufferStrategy: { targetBufferDays: 15, priority: 'MEDIUM' },
        inventoryDecision: {
          hasInventoryProfile: false,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(SupplierGuidanceCard, {
            rec: mockRecUnconfigured,
            loading: false,
            error: null,
            materialName: 'Polypropylene',
          })
        )
      );

      assert.ok(html.includes('id="reorder-decision-panel"'), 'Must render #reorder-decision-panel');
      assert.ok(html.includes('Inventory parameters (current stock, consumption rate, lead time) are not configured'), 'Must explain unconfigured state');
      assert.ok(html.includes('href="/materials"'), 'Must link to /materials');
      assert.ok(html.includes('Configure Stock Profile in Materials'), 'Must show action button');
    });
  });

  // =========================================================================
  // 5. DashboardPage Days of Cover & Stockout Badges
  // =========================================================================
  describe('5. DashboardPage.jsx Days of Cover Badges', () => {
    test('renders critical and low days of cover badges in tracked materials panel', async () => {
      const pagePath = path.join(srcRoot, 'pages/DashboardPage.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');

      // Checks for daysOfCover handling
      assert.ok(content.includes('material.daysOfCover != null'), 'DashboardPage must check material.daysOfCover != null');
      assert.ok(content.includes('badge--danger') && content.includes('CRITICAL:'), 'Must support CRITICAL risk badge');
      assert.ok(content.includes('badge--warning') && content.includes('LOW:'), 'Must support LOW risk badge');
      assert.ok(content.includes('cover'), 'Must display days cover');
    });
  });
});

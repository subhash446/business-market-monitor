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

describe('V3-M4 — Two-Way WhatsApp Quote Capture & Negotiation Copilot', () => {
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
  // 1. API Helper Verification (copilot.api.js)
  // =========================================================================
  describe('1. copilot.api.js API Helpers', () => {
    test('exports parseWhatsAppQuote targeting POST /copilot/whatsapp/parse-quote', () => {
      const apiPath = path.join(srcRoot, 'api/copilot.api.js');
      const content = fs.readFileSync(apiPath, 'utf-8');

      assert.ok(
        content.includes('export async function parseWhatsAppQuote('),
        'copilot.api.js must export parseWhatsAppQuote'
      );
      assert.ok(
        content.includes('/copilot/whatsapp/parse-quote'),
        'parseWhatsAppQuote must call /copilot/whatsapp/parse-quote endpoint'
      );
      assert.ok(
        content.includes('post('),
        'parseWhatsAppQuote must use POST method'
      );
    });

    test('exports getCopilotHistory targeting GET /copilot/whatsapp/history', () => {
      const apiPath = path.join(srcRoot, 'api/copilot.api.js');
      const content = fs.readFileSync(apiPath, 'utf-8');

      assert.ok(
        content.includes('export async function getCopilotHistory('),
        'copilot.api.js must export getCopilotHistory'
      );
      assert.ok(
        content.includes('/copilot/whatsapp/history'),
        'getCopilotHistory must call /copilot/whatsapp/history endpoint'
      );
      assert.ok(
        content.includes('get('),
        'getCopilotHistory must use GET method'
      );
    });
  });

  // =========================================================================
  // 2. WhatsAppCopilotModal Component Contract & SSR Rendering
  // =========================================================================
  describe('2. WhatsAppCopilotModal Component Contract & SSR Rendering', () => {
    test('renders accessible dialog with dark form inputs, sample chips, and heading icon', async () => {
      const { WhatsAppCopilotModal } = await viteServer.ssrLoadModule('/src/components/ui/WhatsAppCopilotModal.jsx');

      const mockMaterials = [
        { id: 1, name: 'PET Resin', unit: 'kg', isTracked: true },
        { id: 2, name: 'Virgin HDPE', unit: 'kg', isTracked: true },
      ];

      const html = renderToStaticMarkup(
        React.createElement(WhatsAppCopilotModal, {
          isOpen: true,
          onClose: () => {},
          materials: mockMaterials,
          initialMaterialId: 1,
        })
      );

      assert.ok(html.includes('modal-backdrop--open'), 'Must render visible backdrop with modal-backdrop--open');
      assert.ok(html.includes('WhatsApp Quote Copilot &amp; Negotiation Advisor'), 'Must render header title');
      assert.ok(html.includes('fa-brands fa-whatsapp text-success'), 'Must render WhatsApp brand icon');
      assert.ok(html.includes('id="copilot-input-text"'), 'Must render paste textarea');
      assert.ok(html.includes('PET Resin Rs 123.50/kg Sharma Polymers'), 'Must render dynamic sample chip for tracked material');
      assert.ok(html.includes('id="material-override-select"'), 'Must render material match select');
      assert.ok(html.includes('Analyze Quote'), 'Must render parse trigger button');
    });

    test('re-export from components/materials/WhatsAppCopilotModal.jsx works identically', async () => {
      const { WhatsAppCopilotModal } = await viteServer.ssrLoadModule('/src/components/materials/WhatsAppCopilotModal.jsx');
      assert.ok(typeof WhatsAppCopilotModal === 'function', 'Materials re-export must export WhatsAppCopilotModal');
    });

    test('returns null when isOpen is false', async () => {
      const { WhatsAppCopilotModal } = await viteServer.ssrLoadModule('/src/components/ui/WhatsAppCopilotModal.jsx');

      const html = renderToStaticMarkup(
        React.createElement(WhatsAppCopilotModal, {
          isOpen: false,
          onClose: () => {},
          materials: [],
        })
      );

      assert.equal(html, '');
    });
  });

  // =========================================================================
  // 3. MaterialsPage & TrendsPage Integration
  // =========================================================================
  describe('3. MaterialsPage & TrendsPage Mount Verification', () => {
    test('MaterialsPage source includes WhatsApp Copilot toolbar button and modal mount', () => {
      const pagePath = path.join(srcRoot, 'pages/MaterialsPage.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');

      assert.ok(
        content.includes('id="whatsapp-copilot-btn"'),
        'MaterialsPage toolbar must include #whatsapp-copilot-btn'
      );
      assert.ok(
        content.includes('<WhatsAppCopilotModal'),
        'MaterialsPage must mount <WhatsAppCopilotModal />'
      );
      assert.ok(
        content.includes('WhatsApp Copilot'),
        'MaterialsPage toolbar must label the copilot button'
      );
    });

    test('TrendsPage SupplierGuidanceCard renders WhatsApp Copilot trigger button when onOpenCopilot provided', async () => {
      const { SupplierGuidanceCard } = await viteServer.ssrLoadModule('/src/pages/TrendsPage.jsx');

      const mockRec = {
        actionRecommendation: 'MAINTAIN_BUFFER',
        rationale: 'Prices range bound.',
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
            onOpenCopilot: () => {},
          })
        )
      );

      assert.ok(
        html.includes('id="whatsapp-copilot-trends-btn"'),
        'SupplierGuidanceCard must render #whatsapp-copilot-trends-btn when onOpenCopilot is provided'
      );
      assert.ok(
        html.includes('WhatsApp Copilot'),
        'SupplierGuidanceCard must display WhatsApp Copilot button label'
      );
    });

    test('materials.css defines styles for .copilot-modal', () => {
      const cssPath = path.join(srcRoot, 'styles/pages/materials.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(
        content.includes('.copilot-modal'),
        'materials.css must define .copilot-modal'
      );
    });
  });
});

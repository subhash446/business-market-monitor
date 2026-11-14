import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

describe('V2 T-08 — Frontend News Digest & Supplier Recommendations (FR-ALERT-06)', () => {

  // =========================================================================
  // 1. API Helper Verification (business.api.js & materials.api.js)
  // =========================================================================
  describe('1. API Clients for News Digest & Supplier Recommendations', () => {
    test('business.api.js exports getDigestPreview, sendDigestNow, and getBusinessSupplierRecommendations', () => {
      const bizApiPath = path.join(srcRoot, 'api/business.api.js');
      const content = fs.readFileSync(bizApiPath, 'utf-8');

      assert.ok(
        content.includes('export async function getDigestPreview()'),
        'business.api.js must export getDigestPreview()'
      );
      assert.ok(
        content.includes("get('/business/news-digest/preview')"),
        'getDigestPreview must GET /business/news-digest/preview'
      );

      assert.ok(
        content.includes('export async function sendDigestNow('),
        'business.api.js must export sendDigestNow()'
      );
      assert.ok(
        content.includes("post('/business/news-digest/send-now'"),
        'sendDigestNow must POST to /business/news-digest/send-now'
      );

      assert.ok(
        content.includes('export async function getBusinessSupplierRecommendations()'),
        'business.api.js must export getBusinessSupplierRecommendations()'
      );
      assert.ok(
        content.includes("get('/business/supplier-recommendations')"),
        'getBusinessSupplierRecommendations must GET /business/supplier-recommendations'
      );
    });

    test('materials.api.js exports getMaterialSupplierRecommendations', () => {
      const matApiPath = path.join(srcRoot, 'api/materials.api.js');
      const content = fs.readFileSync(matApiPath, 'utf-8');

      assert.ok(
        content.includes('export async function getMaterialSupplierRecommendations(materialId)'),
        'materials.api.js must export getMaterialSupplierRecommendations(materialId)'
      );
      assert.ok(
        content.includes('/supplier-recommendations'),
        'getMaterialSupplierRecommendations must call /materials/:materialId/supplier-recommendations'
      );
    });
  });

  // =========================================================================
  // 2. BusinessSettingsModal.jsx News Digest Channel & Dispatch Controls
  // =========================================================================
  describe('2. BusinessSettingsModal.jsx Multi-Channel Digest Settings', () => {
    test('includes delivery channel selector, phone warning, and last sent display', () => {
      const modalPath = path.join(srcRoot, 'components/ui/BusinessSettingsModal.jsx');
      const content = fs.readFileSync(modalPath, 'utf-8');

      // Channel selector
      assert.ok(
        content.includes('id="bs-digest-channel"') && content.includes('name="newsDigestChannel"'),
        'BusinessSettingsModal must contain #bs-digest-channel selector'
      );
      assert.ok(
        content.includes('value="EMAIL"') && content.includes('value="WHATSAPP"') && content.includes('value="BOTH"'),
        'BusinessSettingsModal must support EMAIL, WHATSAPP, and BOTH options'
      );

      // Warning when phone is missing for WhatsApp or Both
      assert.ok(
        content.includes("form.newsDigestChannel === 'WHATSAPP'") && content.includes("form.newsDigestChannel === 'BOTH'"),
        'BusinessSettingsModal must conditionally warn when contactPhone is required for WhatsApp channels'
      );

      // Last digest sent display
      assert.ok(
        content.includes('lastDigestSentAt') && content.includes('Last digest dispatched:'),
        'BusinessSettingsModal must render last digest sent timestamp'
      );
    });
  });

  // =========================================================================
  // 3. NewsPage.jsx Periodic Digest Modal & Dispatch Trigger
  // =========================================================================
  describe('3. NewsPage.jsx Periodic Digest Preview & Send Trigger', () => {
    test('includes digest trigger button, preview modal, tabs, and Send Digest Now action', () => {
      const newsPagePath = path.join(srcRoot, 'pages/NewsPage.jsx');
      const content = fs.readFileSync(newsPagePath, 'utf-8');

      // Header button
      assert.ok(
        content.includes('id="btn-open-digest-preview"'),
        'NewsPage must contain #btn-open-digest-preview button'
      );

      // Modal container
      assert.ok(
        content.includes('id="digest-preview-modal"'),
        'NewsPage must render #digest-preview-modal'
      );

      // Tab selector
      assert.ok(
        content.includes('Email Preview') && content.includes('WhatsApp Preview') && content.includes('Sourcing Guidance'),
        'NewsPage modal must include Email, WhatsApp, and Sourcing Guidance tabs'
      );

      // Send action button
      assert.ok(
        content.includes('id="btn-send-digest-now"') && content.includes('Send Digest Now'),
        'NewsPage modal must render #btn-send-digest-now'
      );
    });
  });

  // =========================================================================
  // 4. TrendsPage.jsx Supplier Guidance Card
  // =========================================================================
  describe('4. TrendsPage.jsx Supplier Sourcing Guidance Card', () => {
    test('renders SupplierGuidanceCard with buffer strategy, quote vs benchmark variance, and resilience checklist', () => {
      const trendsPagePath = path.join(srcRoot, 'pages/TrendsPage.jsx');
      const content = fs.readFileSync(trendsPagePath, 'utf-8');

      // Hooked into TrendsPage
      assert.ok(
        content.includes('getMaterialSupplierRecommendations'),
        'TrendsPage must import and call getMaterialSupplierRecommendations'
      );
      assert.ok(
        content.includes('<SupplierGuidanceCard'),
        'TrendsPage must render <SupplierGuidanceCard />'
      );

      // Component card definition
      assert.ok(
        content.includes('id="supplier-guidance-card"'),
        'SupplierGuidanceCard must render #supplier-guidance-card'
      );
      assert.ok(
        content.includes('Supplier Sourcing & Inventory Guidance') || content.includes('Supplier Sourcing &amp; Inventory Guidance'),
        'SupplierGuidanceCard must render section title'
      );
      assert.ok(
        content.includes('Target Inventory Buffer:'),
        'SupplierGuidanceCard must display Target Inventory Buffer in days'
      );
      assert.ok(
        content.includes('Supplier Quote vs Market Benchmark'),
        'SupplierGuidanceCard must display quote vs benchmark comparison'
      );
      assert.ok(
        content.includes('crossCurrencyNote'),
        'SupplierGuidanceCard must handle crossCurrencyNote when quote and benchmark currencies differ'
      );
      assert.ok(
        content.includes('Supply Chain Resilience'),
        'SupplierGuidanceCard must display supply chain resilience & diversification guidance'
      );
    });
  });
});

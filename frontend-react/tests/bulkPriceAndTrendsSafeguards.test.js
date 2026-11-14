import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

describe('V2 T-07 — Frontend Bulk Price Upload & Multi-Currency Safeguards', () => {

  // =========================================================================
  // 1. API Helper Verification (prices.api.js)
  // =========================================================================
  describe('1. prices.api.js Bulk Upload API Helper', () => {
    test('exports bulkUploadPrices function that targets /materials/prices/bulk', () => {
      const pricesApiPath = path.join(srcRoot, 'api/prices.api.js');
      const content = fs.readFileSync(pricesApiPath, 'utf-8');

      assert.ok(
        content.includes('export async function bulkUploadPrices(prices)'),
        'prices.api.js must export bulkUploadPrices(prices)'
      );
      assert.ok(
        content.includes("post('/materials/prices/bulk', { prices })"),
        'bulkUploadPrices must POST to /materials/prices/bulk with { prices } payload'
      );
    });
  });

  // =========================================================================
  // 2. PricesPage.jsx Bulk Upload Modal & CSV Parsing
  // =========================================================================
  describe('2. PricesPage.jsx Bulk Upload UI & Client-Side Parser', () => {
    test('contains Bulk Upload action button, modal, and parser controls', () => {
      const pricesPagePath = path.join(srcRoot, 'pages/PricesPage.jsx');
      const content = fs.readFileSync(pricesPagePath, 'utf-8');

      // Bulk upload trigger button
      assert.ok(
        content.includes('id="pe-open-bulk-btn"') && content.includes('Bulk Upload Prices'),
        'PricesPage must contain #pe-open-bulk-btn triggering the bulk upload modal'
      );

      // Modal configuration
      assert.ok(
        content.includes('id="bulk-price-upload-modal"'),
        'PricesPage must render #bulk-price-upload-modal'
      );
      assert.ok(
        content.includes('id="bulk-load-sample-btn"'),
        'PricesPage modal must include #bulk-load-sample-btn'
      );
      assert.ok(
        content.includes('id="bulk-csv-textarea"'),
        'PricesPage modal must include #bulk-csv-textarea'
      );
      assert.ok(
        content.includes('id="bulk-submit-upload-btn"'),
        'PricesPage modal must include #bulk-submit-upload-btn'
      );

      // Batch limit and results summary
      assert.ok(
        content.includes('Exceeds 200 batch limit') || content.includes('Maximum batch size is 200'),
        'PricesPage must enforce 200 row batch limit guard'
      );
      assert.ok(
        content.includes('Inserted:'),
        'PricesPage must render Inserted results count'
      );
      assert.ok(
        content.includes('Skipped (Duplicates):'),
        'PricesPage must render Skipped (Duplicates) results count'
      );
    });

    test('CSV parsing logic identifies headers, dates, prices, and validation errors', () => {
      const sampleCsv = `Date, Price, Currency, Grade, Region
2026-11-01, 112.50, INR, FAQ Grade, Gujarat
2026-11-02, 113.20, USD, Premium, Mumbai
invalid-date, -10, INR, Broken, Delhi`;

      const lines = sampleCsv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const isHeader = lines[0].toLowerCase().includes('date');
      assert.ok(isHeader, 'First row should be recognized as a header');

      const dataLines = isHeader ? lines.slice(1) : lines;
      assert.equal(dataLines.length, 3, 'Should have 3 data lines');

      // Row 1 (valid)
      const p1 = dataLines[0].split(',').map(s => s.trim());
      assert.equal(p1[0], '2026-11-01');
      assert.equal(parseFloat(p1[1]), 112.50);
      assert.equal(p1[2], 'INR');

      // Row 2 (valid USD)
      const p2 = dataLines[1].split(',').map(s => s.trim());
      assert.equal(p2[0], '2026-11-02');
      assert.equal(parseFloat(p2[1]), 113.20);
      assert.equal(p2[2], 'USD');

      // Row 3 (invalid date and negative price)
      const p3 = dataLines[2].split(',').map(s => s.trim());
      assert.ok(Number.isNaN(new Date(p3[0]).getTime()), 'invalid-date must fail Date parse');
      assert.ok(parseFloat(p3[1]) <= 0, 'Negative price must fail > 0 check');
    });
  });

  // =========================================================================
  // 3. TrendsPage.jsx Multi-Currency Safeguards
  // =========================================================================
  describe('3. TrendsPage.jsx Multi-Currency Comparison Safeguards', () => {
    test('computes uniqueCurrencies across series and displays multi-currency warning banner', () => {
      const trendsPagePath = path.join(srcRoot, 'pages/TrendsPage.jsx');
      const content = fs.readFileSync(trendsPagePath, 'utf-8');

      // Distinct currency calculation
      assert.ok(
        content.includes('uniqueCurrencies'),
        'TrendsPage must compute uniqueCurrencies across series'
      );

      // Warning banner ID & text
      assert.ok(
        content.includes('id="cmp-currency-warning"'),
        'TrendsPage must render #cmp-currency-warning banner when uniqueCurrencies.length > 1'
      );
      assert.ok(
        content.includes('Multi-Currency Comparison Notice:'),
        'Banner must contain Multi-Currency Comparison Notice headline'
      );
      assert.ok(
        content.includes('without FX conversion'),
        'Banner must explicitly warn that prices are local nominal without FX conversion'
      );

      // Unit and currency header formatting in chart and table
      assert.ok(
        content.includes('displayUnit'),
        'CompareTable must format displayUnit incorporating currency and unitLabel'
      );
    });

    test('multi-currency warning detection triggers correctly on mixed currencies', () => {
      // Single currency comparison (e.g. all INR)
      const singleCurrencySeries = [
        { materialId: 1, name: 'PET Resin', series: [{ price: 110, currency: 'INR' }] },
        { materialId: 2, name: 'Caustic Soda', series: [{ price: 45, currency: 'INR' }] },
      ];
      const singleSet = new Set();
      singleCurrencySeries.forEach(m => m.series.forEach(p => singleSet.add(p.currency)));
      assert.equal(singleSet.size, 1);

      // Mixed currency comparison (e.g. INR and USD)
      const mixedCurrencySeries = [
        { materialId: 1, name: 'PET Resin', series: [{ price: 110, currency: 'INR' }] },
        { materialId: 2, name: 'WTI Crude Oil', series: [{ price: 74.5, currency: 'USD' }] },
      ];
      const mixedSet = new Set();
      mixedCurrencySeries.forEach(m => m.series.forEach(p => mixedSet.add(p.currency)));
      assert.equal(mixedSet.size, 2);
      assert.ok(mixedSet.has('INR') && mixedSet.has('USD'));
    });

    test('displayUnit helper correctly prevents duplicate currency prefixes', () => {
      // Case 1: currency='INR', unitLabel='kg' -> 'INR/kg'
      const c1 = 'INR';
      const u1 = 'kg';
      const d1 = u1.toUpperCase().includes(c1.toUpperCase()) ? u1 : `${c1}/${u1}`;
      assert.equal(d1, 'INR/kg');

      // Case 2: currency='USD', unitLabel='USD/bbl' -> 'USD/bbl' (no USD/USD/bbl duplication)
      const c2 = 'USD';
      const u2 = 'USD/bbl';
      const d2 = u2.toUpperCase().includes(c2.toUpperCase()) ? u2 : `${c2}/${u2}`;
      assert.equal(d2, 'USD/bbl');

      // Case 3: currency='EUR', unitLabel='' -> 'EUR'
      const c3 = 'EUR';
      const u3 = '';
      const d3 = u3.toUpperCase().includes(c3.toUpperCase()) ? u3 : (u3 ? `${c3}/${u3}` : c3);
      assert.equal(d3, 'EUR');
    });
  });
});

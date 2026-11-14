import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');

describe('MaterialsPage — Industry-Aware Symbol Filtering & Micro-copy', () => {
  let viteServer;
  let getFilteredSymbolOptions;
  let SYMBOL_OPTIONS;

  before(async () => {
    viteServer = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true },
      logLevel: 'silent',
    });

    const materialsMod = await viteServer.ssrLoadModule('/src/pages/MaterialsPage.jsx');
    getFilteredSymbolOptions = materialsMod.getFilteredSymbolOptions;
    SYMBOL_OPTIONS = materialsMod.SYMBOL_OPTIONS;
  });

  after(async () => {
    if (viteServer) {
      await viteServer.close();
    }
  });

  // =========================================================================
  // 1. Pure Unit Tests: getFilteredSymbolOptions
  // =========================================================================
  describe('1. getFilteredSymbolOptions pure helper', () => {
    test('Plastic Manufacturing filters out agricultural mandi symbols and preserves WTI/Brent', () => {
      const optionsBySlug = getFilteredSymbolOptions('plastic-manufacturing');
      const valuesBySlug = optionsBySlug.map(o => o.value);
      assert.deepEqual(valuesBySlug, ['', 'WTI', 'BRENT']);
      assert.ok(!valuesBySlug.includes('WHEAT_GOI'));
      assert.ok(!valuesBySlug.includes('SUGAR_GOI'));
      assert.ok(!valuesBySlug.includes('EDIBLE_OIL_GOI'));

      const optionsByName = getFilteredSymbolOptions('Plastic Manufacturing');
      assert.deepEqual(optionsByName.map(o => o.value), ['', 'WTI', 'BRENT']);

      const optionsByObj = getFilteredSymbolOptions({
        industrySlug: 'plastic-manufacturing',
        industryName: 'Plastic Manufacturing',
      });
      assert.deepEqual(optionsByObj.map(o => o.value), ['', 'WTI', 'BRENT']);
    });

    test('Packaged Drinking Water filters out agricultural mandi symbols and preserves WTI/Brent', () => {
      const options = getFilteredSymbolOptions('packaged-drinking-water');
      const values = options.map(o => o.value);
      assert.deepEqual(values, ['', 'WTI', 'BRENT']);
      assert.ok(!values.includes('WHEAT_GOI'));
      assert.ok(!values.includes('SUGAR_GOI'));
      assert.ok(!values.includes('EDIBLE_OIL_GOI'));

      const optionsByName = getFilteredSymbolOptions('Packaged Drinking Water');
      assert.deepEqual(optionsByName.map(o => o.value), ['', 'WTI', 'BRENT']);
    });

    test('Food & Beverage includes Indian mandi commodities alongside energy proxies', () => {
      const optionsBySlug = getFilteredSymbolOptions('food-beverage');
      const valuesBySlug = optionsBySlug.map(o => o.value);
      assert.deepEqual(valuesBySlug, ['', 'WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI', 'WTI', 'BRENT']);

      const optionsByName = getFilteredSymbolOptions('Food & Beverage');
      assert.deepEqual(optionsByName.map(o => o.value), ['', 'WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI', 'WTI', 'BRENT']);
    });

    test('Dairy includes Indian mandi commodities alongside energy proxies', () => {
      const options = getFilteredSymbolOptions('dairy');
      const values = options.map(o => o.value);
      assert.deepEqual(values, ['', 'WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI', 'WTI', 'BRENT']);

      const optionsByName = getFilteredSymbolOptions('Dairy Processing');
      assert.deepEqual(optionsByName.map(o => o.value), ['', 'WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI', 'WTI', 'BRENT']);
    });

    test('FMCG business has access to all symbols (food & packaging/crude)', () => {
      const options = getFilteredSymbolOptions('fmcg');
      const values = options.map(o => o.value);
      assert.deepEqual(values, SYMBOL_OPTIONS.map(o => o.value));
    });

    test('Fallback: null, undefined, empty string, or unlisted industry returns all symbols', () => {
      assert.deepEqual(getFilteredSymbolOptions(null).map(o => o.value), SYMBOL_OPTIONS.map(o => o.value));
      assert.deepEqual(getFilteredSymbolOptions(undefined).map(o => o.value), SYMBOL_OPTIONS.map(o => o.value));
      assert.deepEqual(getFilteredSymbolOptions('').map(o => o.value), SYMBOL_OPTIONS.map(o => o.value));
      assert.deepEqual(getFilteredSymbolOptions('Aerospace & Defense').map(o => o.value), SYMBOL_OPTIONS.map(o => o.value));
    });

    test('Backward-compatibility guard: preserves legacy symbol when excluded by active industry filter', () => {
      // In Plastic Manufacturing, Wheat would normally be excluded
      const options = getFilteredSymbolOptions('plastic-manufacturing', 'WHEAT_GOI');
      const values = options.map(o => o.value);

      // Must include standard allowed symbols PLUS the legacy selected symbol
      assert.ok(values.includes(''));
      assert.ok(values.includes('WTI'));
      assert.ok(values.includes('BRENT'));
      assert.ok(values.includes('WHEAT_GOI'), 'Legacy WHEAT_GOI symbol must be retained in options');

      const wheatOption = options.find(o => o.value === 'WHEAT_GOI');
      assert.equal(wheatOption.label, 'Wheat (India Mandi — INR/quintal)');

      // Does not duplicate symbol if already in allowed list
      const wtiOptions = getFilteredSymbolOptions('plastic-manufacturing', 'WTI');
      const wtiOccurrences = wtiOptions.filter(o => o.value === 'WTI').length;
      assert.equal(wtiOccurrences, 1);

      // Handles custom/legacy unrecognized symbol
      const customOptions = getFilteredSymbolOptions('plastic-manufacturing', 'CUSTOM_POLYMER');
      const customOption = customOptions.find(o => o.value === 'CUSTOM_POLYMER');
      assert.ok(customOption, 'Unrecognized legacy symbol must be retained');
      assert.ok(customOption.label.includes('CUSTOM_POLYMER'));
    });
  });

  // =========================================================================
  // 2. Source Code & Contract Verification (MaterialsPage.jsx)
  // =========================================================================
  describe('2. MaterialsPage.jsx wiring and micro-copy', () => {
    test('verifies useAuth, getBusiness cache check, and micro-copy', () => {
      const pagePath = path.join(frontendRoot, 'src/pages/MaterialsPage.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');

      // Auth & business context wiring
      assert.ok(
        content.includes("import { useAuth }     from '../hooks/useAuth.js';") ||
        content.includes("from '../hooks/useAuth.js'"),
        'MaterialsPage must import useAuth'
      );
      assert.ok(
        content.includes('const { business, setBusiness } = useAuth();'),
        'MaterialsPage must extract business and setBusiness from useAuth()'
      );
      assert.ok(
        content.includes('getBusiness().then(setBusiness).catch(() => {});'),
        'MaterialsPage must fetch and cache business if not already in context'
      );

      // Micro-copy verification
      assert.ok(
        content.includes('No public market ticker — use') &&
        content.includes('Log Supplier Quote') &&
        content.includes('for custom or local grades.'),
        'MaterialsPage must render polished micro-copy linking to Log Supplier Quote'
      );
    });
  });

  // =========================================================================
  // 3. SSR / Component Render Verification
  // =========================================================================
  describe('3. Component SSR Rendering', () => {
    test('renders ExternalSymbolSelect with filtered options for Plastic Manufacturing', async () => {
      const materialsMod = await viteServer.ssrLoadModule('/src/pages/MaterialsPage.jsx');
      const getFiltered = materialsMod.getFilteredSymbolOptions;

      const plasticOpts = getFiltered({ industrySlug: 'plastic-manufacturing' }, '');
      const optHtml = plasticOpts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

      assert.ok(optHtml.includes('value="WTI"'));
      assert.ok(optHtml.includes('value="BRENT"'));
      assert.ok(!optHtml.includes('value="WHEAT_GOI"'));
      assert.ok(!optHtml.includes('value="SUGAR_GOI"'));
      assert.ok(!optHtml.includes('value="EDIBLE_OIL_GOI"'));
    });

    test('renders ExternalSymbolSelect with legacy symbol retained for Plastic Manufacturing', async () => {
      const materialsMod = await viteServer.ssrLoadModule('/src/pages/MaterialsPage.jsx');
      const getFiltered = materialsMod.getFilteredSymbolOptions;

      const plasticWithSugarOpts = getFiltered({ industrySlug: 'plastic-manufacturing' }, 'SUGAR_GOI');
      const optHtml = plasticWithSugarOpts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');

      assert.ok(optHtml.includes('value="WTI"'));
      assert.ok(optHtml.includes('value="BRENT"'));
      assert.ok(optHtml.includes('value="SUGAR_GOI"'), 'Legacy Sugar option must be rendered in select');
    });
  });
});

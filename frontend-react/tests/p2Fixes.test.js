import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { ApiError } from '../src/api/client.js';
import { mapAlertCreateError } from '../src/utils/alertErrors.js';
import {
  resolveMaterialCurrency,
  stripCurrencyFromUnit,
  formatUnitLabel,
  formatPriceDisplay,
  getSafeExternalUrl,
} from '../src/utils/format.js';
import {
  resolveIsProxyPrice,
  buildManualSourceInfoFallback,
  refreshSourceInfoAfterManualQuote,
} from '../src/utils/priceSource.js';
import {
  createLatestRequestGuard,
  runLatestIndustryPreview,
} from '../src/utils/requestGuard.js';
import {
  classifyEvidencePriceBadge,
  classifyInsightBenchmarkDisclosure,
} from '../src/utils/insightDisclosure.js';
import {
  handleModalBackdropClick,
  handleModalEscapeKey,
  safeInvokeClose,
} from '../src/utils/modalHelpers.js';

describe('P2 Fix #1 — AlertsPage validation error mapping (err.details)', () => {
  test('maps backend ApiError err.details to field-level alert rule errors', () => {
    const err = new ApiError('Request validation failed', 'VALIDATION_ERROR', 400, [
      { field: 'trackedMaterialId', issue: 'must be a positive integer' },
      { field: 'conditionType', issue: 'must be PRICE_ABOVE or PRICE_BELOW' },
      { field: 'thresholdPrice', issue: 'must be a positive number (up to 1000 for PERCENTAGE)' },
      { field: 'cooldownHours', issue: 'must be an integer between 1 and 720' },
    ]);

    const mapped = mapAlertCreateError(err);

    assert.equal(mapped.matErr, 'must be a positive integer');
    assert.equal(mapped.condErr, 'must be PRICE_ABOVE or PRICE_BELOW');
    assert.equal(mapped.threshErr, 'must be a positive number (up to 1000 for PERCENTAGE)');
    assert.equal(mapped.cooldownErr, 'must be an integer between 1 and 720');
    assert.equal(mapped.formErr, '');
  });

  test('falls back to formErr for unmapped 400 validation fields or missing details', () => {
    const unknownFieldErr = new ApiError('Request validation failed', 'VALIDATION_ERROR', 400, [
      { field: 'thresholdType', issue: 'must be ABSOLUTE or PERCENTAGE' },
    ]);
    assert.deepEqual(mapAlertCreateError(unknownFieldErr), {
      matErr: '',
      condErr: '',
      threshErr: '',
      cooldownErr: '',
      formErr: 'must be ABSOLUTE or PERCENTAGE',
    });

    const emptyDetailsErr = new ApiError('Invalid payload', 'VALIDATION_ERROR', 400, null);
    assert.equal(mapAlertCreateError(emptyDetailsErr).formErr, 'Invalid payload');
  });

  test('handles 409, 404, network failures, and unexpected 5xx errors gracefully', () => {
    assert.equal(
      mapAlertCreateError(new ApiError('Duplicate', 'CONFLICT', 409)).formErr,
      'An alert rule already exists for this material and condition.'
    );
    assert.equal(
      mapAlertCreateError(new ApiError('Not found', 'NOT_FOUND', 404)).matErr,
      'Material not found. Please reload and try again.'
    );
    assert.equal(
      mapAlertCreateError(new ApiError('Timeout', 'NETWORK_ERROR', 0)).formErr,
      'Could not create alert rule. Check your connection.'
    );
    assert.equal(
      mapAlertCreateError(new ApiError('Something went wrong. Please try again.', 'INTERNAL_ERROR', 500)).formErr,
      'Something went wrong. Please try again.'
    );
    assert.equal(
      mapAlertCreateError(new Error('Unexpected runtime failure')).formErr,
      'Could not create alert rule. Check your connection.'
    );
  });
});

describe('P2 Fix #2 — PricesPage manual quote source refresh & proxy classification', () => {
  test('refreshes sourceInfo after manual supplier quote so proxy notice disappears', async () => {
    const staleProxySourceInfo = {
      materialId: 1,
      materialName: 'PET Resin',
      externalSymbol: 'WTI',
      isProxy: true,
      dataClass: 'OFFICIAL_BENCHMARK',
      disclaimer: 'Price reflects a global commodity benchmark (WTI in USD/bbl).',
    };
    const createdManual = {
      id: 99,
      price: 118.5,
      recordedAt: '2026-11-10',
      source: 'MANUAL',
      currency: 'INR',
      unitLabel: 'kg',
      dataClass: 'SUPPLIER_QUOTE',
      providerName: 'Supplier Manual Entry',
    };
    const backendRefreshedInfo = {
      materialId: 1,
      materialName: 'PET Resin',
      externalSymbol: 'WTI',
      source: 'MANUAL',
      currency: 'INR',
      unitLabel: 'kg',
      dataClass: 'SUPPLIER_QUOTE',
      providerName: 'Supplier Manual Entry',
      isProxy: false,
      disclaimer: 'Direct supplier quote recorded in INR/kg.',
    };

    const nextSourceInfo = await refreshSourceInfoAfterManualQuote({
      materialId: 1,
      fetchSourceInfo: async () => backendRefreshedInfo,
      createdPrice: createdManual,
      prevSourceInfo: staleProxySourceInfo,
      material: { id: 1, name: 'PET Resin', unit: 'kg', externalSymbol: 'WTI' },
    });

    assert.equal(nextSourceInfo.isProxy, false);
    assert.equal(nextSourceInfo.dataClass, 'SUPPLIER_QUOTE');
    assert.equal(
      resolveIsProxyPrice({
        latestPrice: createdManual,
        sourceInfo: nextSourceInfo,
        material: { id: 1, externalSymbol: 'WTI' },
      }),
      false
    );
  });

  test('clears stale proxy flag gracefully if follow-up source-info request fails', async () => {
    const staleProxySourceInfo = {
      materialId: 1,
      materialName: 'PET Resin',
      isProxy: true,
      disclaimer: 'Price reflects a global commodity benchmark (WTI in USD/bbl).',
    };
    const createdManual = {
      id: 100,
      price: 92,
      recordedAt: '2026-11-10',
      source: 'MANUAL',
      currency: 'INR',
      unitLabel: 'kg',
      dataClass: 'SUPPLIER_QUOTE',
    };

    const fallbackInfo = await refreshSourceInfoAfterManualQuote({
      materialId: 1,
      fetchSourceInfo: async () => {
        throw new Error('Network hiccup');
      },
      createdPrice: createdManual,
      prevSourceInfo: staleProxySourceInfo,
      material: { id: 1, unit: 'kg', externalSymbol: 'WTI' },
    });

    assert.equal(fallbackInfo.isProxy, false);
    assert.equal(fallbackInfo.source, 'MANUAL');
    assert.equal(fallbackInfo.dataClass, 'SUPPLIER_QUOTE');
    assert.equal(fallbackInfo.disclaimer, null);
    assert.equal(
      resolveIsProxyPrice({
        latestPrice: createdManual,
        sourceInfo: fallbackInfo,
        material: { id: 1, externalSymbol: 'WTI' },
      }),
      false
    );
  });

  test('distinguishes manual/GOI non-proxy prices from actual external crude proxy benchmarks', () => {
    assert.equal(
      resolveIsProxyPrice({
        latestPrice: { source: 'MANUAL', currency: 'USD', dataClass: 'SUPPLIER_QUOTE' },
        sourceInfo: { isProxy: true },
        material: { externalSymbol: 'WTI' },
      }),
      false
    );

    assert.equal(
      resolveIsProxyPrice({
        latestPrice: { source: 'THIRD_PARTY_API', currency: 'INR', dataClass: 'MARKET_INDICATIVE' },
        sourceInfo: { isProxy: false },
        material: { externalSymbol: 'WHEAT_GOI' },
      }),
      false
    );

    assert.equal(
      resolveIsProxyPrice({
        latestPrice: { source: 'THIRD_PARTY_API', currency: 'USD', dataClass: 'OFFICIAL_BENCHMARK' },
        sourceInfo: { isProxy: true },
        material: { externalSymbol: 'WTI' },
      }),
      true
    );

    const manualFallback = buildManualSourceInfoFallback(null, null, { unit: 'kg' });
    assert.equal(manualFallback.isProxy, false);
    assert.equal(manualFallback.currency, 'INR');
  });
});

describe('P2 Fix #3 — GOI currency fallback & de-duplicated unit formatting', () => {
  test('never defaults GOI symbols to USD when backend currency is omitted', () => {
    for (const sym of ['WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI']) {
      assert.equal(
        resolveMaterialCurrency({ currency: null, sourceCurrency: null, externalSymbol: sym }),
        'INR'
      );
    }
    assert.equal(
      resolveMaterialCurrency({ currency: null, sourceCurrency: null, externalSymbol: 'WTI' }),
      'USD'
    );
    assert.equal(
      resolveMaterialCurrency({ currency: null, sourceCurrency: null, externalSymbol: 'BRENT' }),
      'USD'
    );
    assert.equal(
      resolveMaterialCurrency({ currency: null, sourceCurrency: 'INR', externalSymbol: 'WHEAT_GOI' }),
      'INR'
    );
  });

  test('avoids duplicated currency prefixes in price and disclaimer labels', () => {
    const wti = formatPriceDisplay({
      price: 67.31,
      currency: 'USD',
      unitLabel: 'USD/bbl',
      externalSymbol: 'WTI',
    });
    assert.equal(wti.currencyCode, 'USD');
    assert.equal(wti.unitSuffix, 'bbl');
    assert.equal(wti.text.includes('USD/bbl'), false);
    assert.match(wti.text, /^USD .*67\.31 \/ bbl$/);

    const wheat = formatPriceDisplay({
      price: 2650,
      currency: 'INR',
      unitLabel: 'INR/quintal',
      externalSymbol: 'WHEAT_GOI',
    });
    assert.equal(wheat.currencyCode, 'INR');
    assert.equal(wheat.unitSuffix, 'quintal');
    assert.equal(wheat.text.includes('INR/quintal'), false);
    assert.match(wheat.text, /^INR .* \/ quintal$/);

    const legacyGoiWithSourceMeta = formatPriceDisplay({
      price: 3850,
      currency: null,
      unitLabel: null,
      fallbackUnit: 'kg',
      sourceCurrency: 'INR',
      sourceUnitLabel: 'INR/quintal',
      externalSymbol: 'SUGAR_GOI',
    });
    assert.equal(legacyGoiWithSourceMeta.currencyCode, 'INR');
    assert.equal(legacyGoiWithSourceMeta.unitSuffix, 'quintal');

    const manualKg = formatPriceDisplay({
      price: 95.5,
      currency: 'INR',
      unitLabel: 'kg',
      externalSymbol: null,
    });
    assert.equal(manualKg.currencyCode, 'INR');
    assert.equal(manualKg.unitSuffix, 'kg');

    assert.equal(stripCurrencyFromUnit('INR/L', 'INR'), 'L');
    assert.equal(stripCurrencyFromUnit('INR', 'INR'), '');
    assert.equal(formatUnitLabel('USD', 'USD/bbl'), 'USD/bbl');
    assert.equal(formatUnitLabel('INR', 'kg'), 'INR/kg');
  });
});

describe('P2 Fix #5 — Safe URL filtering helper', () => {
  test('accepts http and https URLs and blocks unsafe URI schemes', () => {
    assert.equal(getSafeExternalUrl('https://data.gov.in/resource/wheat'), 'https://data.gov.in/resource/wheat');
    assert.equal(getSafeExternalUrl('  http://agmarknet.gov.in  '), 'http://agmarknet.gov.in');

    assert.equal(getSafeExternalUrl('javascript:alert(1)'), null);
    assert.equal(getSafeExternalUrl('  JAVASCRIPT:alert(document.cookie)'), null);
    assert.equal(getSafeExternalUrl('java\nscript:alert(1)'), null);
    assert.equal(getSafeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(getSafeExternalUrl('vbscript:msgbox(1)'), null);
    assert.equal(getSafeExternalUrl('file:///etc/passwd'), null);
    assert.equal(getSafeExternalUrl('/relative/path'), null);
    assert.equal(getSafeExternalUrl(''), null);
    assert.equal(getSafeExternalUrl(null), null);
    assert.equal(getSafeExternalUrl(undefined), null);
  });
});

describe('P2 Fix #6 — Onboarding industry-preview race protection', () => {
  function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  test('ignores out-of-order response from earlier selected industry', async () => {
    const guard = createLatestRequestGuard();
    const deferredByIndustry = {
      1: createDeferred(),
      2: createDeferred(),
    };

    const state = { materials: [], loading: false, error: false };

    const p1 = runLatestIndustryPreview({
      industryId: 1,
      fetchMaterials: (id) => deferredByIndustry[id].promise,
      guard,
      onStart: () => { state.loading = true; state.error = false; state.materials = []; },
      onSuccess: (mats) => { state.materials = mats; },
      onError: () => { state.error = true; state.materials = []; },
      onSettled: () => { state.loading = false; },
    });

    const p2 = runLatestIndustryPreview({
      industryId: 2,
      fetchMaterials: (id) => deferredByIndustry[id].promise,
      guard,
      onStart: () => { state.loading = true; state.error = false; state.materials = []; },
      onSuccess: (mats) => { state.materials = mats; },
      onError: () => { state.error = true; state.materials = []; },
      onSettled: () => { state.loading = false; },
    });

    assert.equal(state.loading, true);

    // Faster second industry resolves first
    deferredByIndustry[2].resolve({ materials: [{ name: 'Wheat' }, { name: 'Sugar' }] });
    const applied2 = await p2;
    assert.equal(applied2, true);
    assert.deepEqual(state.materials, [{ name: 'Wheat' }, { name: 'Sugar' }]);
    assert.equal(state.loading, false);
    assert.equal(state.error, false);

    // Slower first industry resolves afterwards — MUST be ignored
    deferredByIndustry[1].resolve({ materials: [{ name: 'PET Resin' }] });
    const applied1 = await p1;
    assert.equal(applied1, false);
    assert.deepEqual(state.materials, [{ name: 'Wheat' }, { name: 'Sugar' }]);
    assert.equal(state.loading, false);
    assert.equal(state.error, false);
  });

  test('ignores stale rejection from earlier industry while latest is loading or succeeded', async () => {
    const guard = createLatestRequestGuard();
    const d1 = createDeferred();
    const d2 = createDeferred();
    const state = { materials: [], loading: false, error: false };

    const handlers = {
      guard,
      onStart: () => { state.loading = true; state.error = false; state.materials = []; },
      onSuccess: (mats) => { state.materials = mats; },
      onError: () => { state.error = true; state.materials = []; },
      onSettled: () => { state.loading = false; },
    };

    const p1 = runLatestIndustryPreview({ ...handlers, industryId: 1, fetchMaterials: () => d1.promise });
    const p2 = runLatestIndustryPreview({ ...handlers, industryId: 2, fetchMaterials: () => d2.promise });

    // Earlier request rejects while request 2 is still in flight
    d1.reject(new Error('Slow failure on industry 1'));
    assert.equal(await p1, false);
    assert.equal(state.loading, true);
    assert.equal(state.error, false);

    // Latest request completes cleanly
    d2.resolve({ materials: [{ name: 'Cotton Yarn' }] });
    assert.equal(await p2, true);
    assert.equal(state.loading, false);
    assert.equal(state.error, false);
    assert.deepEqual(state.materials, [{ name: 'Cotton Yarn' }]);
  });

  test('sets error state cleanly when the latest active industry request fails, and ignores post-unmount settlement', async () => {
    const guard = createLatestRequestGuard();
    const dErr = createDeferred();
    const dUnmount = createDeferred();
    const state = { materials: [{ name: 'Stale' }], loading: false, error: false };

    const pErr = runLatestIndustryPreview({
      industryId: 3,
      fetchMaterials: () => dErr.promise,
      guard,
      onStart: () => { state.loading = true; state.error = false; state.materials = []; },
      onSuccess: (mats) => { state.materials = mats; },
      onError: () => { state.error = true; state.materials = []; },
      onSettled: () => { state.loading = false; },
    });

    dErr.reject(new Error('500 Server Error'));
    await pErr;
    assert.equal(state.loading, false);
    assert.equal(state.error, true);
    assert.deepEqual(state.materials, []);

    const pUnmount = runLatestIndustryPreview({
      industryId: 4,
      fetchMaterials: () => dUnmount.promise,
      guard,
      onStart: () => { state.loading = true; state.error = false; state.materials = []; },
      onSuccess: (mats) => { state.materials = mats; },
      onError: () => { state.error = true; },
      onSettled: () => { state.loading = false; },
    });

    guard.invalidate();
    dUnmount.resolve({ materials: [{ name: 'After unmount' }] });
    assert.equal(await pUnmount, false);
    assert.deepEqual(state.materials, []);
  });
});

describe('Task 2 — InsightCard GOI vs Crude Proxy Disclosure Classifier', () => {
  test('classifies domestic INR GOI evidence as DOMESTIC_MANDI rather than CRUDE_PROXY', () => {
    const wheatInsight = {
      headline: 'Wheat prices stayed firm across reporting mandis.',
      what_happened: 'Wholesale benchmark prices in INR/quintal averaged 2650.',
      evidence_prices: [
        {
          id: 1,
          currency: 'INR',
          unit_label: 'INR/quintal',
          data_class: 'MARKET_INDICATIVE',
          provider_name: 'Data.gov.in (Agmarknet / MoAFW)',
          source_url: 'https://data.gov.in/resource/wheat',
        },
      ],
    };

    assert.equal(classifyInsightBenchmarkDisclosure(wheatInsight), 'DOMESTIC_MANDI');
  });

  test('preserves CRUDE_PROXY classification for legitimate WTI/BRENT USD evidence and compact text', () => {
    const wtiWithEvidence = {
      headline: 'WTI Crude Oil rose 3.2% this week.',
      what_happened: 'Prices climbed from 67.31 to 69.50 USD/bbl.',
      evidence_prices: [
        {
          id: 10,
          currency: 'USD',
          unit_label: 'USD/bbl',
          data_class: 'OFFICIAL_BENCHMARK',
          provider_name: 'U.S. Energy Information Administration (EIA)',
        },
      ],
    };
    assert.equal(classifyInsightBenchmarkDisclosure(wtiWithEvidence), 'CRUDE_PROXY');

    const wtiCompactSummary = {
      headline: 'Brent crude benchmark moved higher.',
      what_happened: 'Upstream global commodity proxy moved up.',
    };
    assert.equal(classifyInsightBenchmarkDisclosure(wtiCompactSummary), 'CRUDE_PROXY');

    const goiCompactSummary = {
      headline: 'Agmarknet mandi wheat modal prices edged upward.',
      what_happened: 'Mandi prices rose in INR/quintal across reporting centers.',
    };
    assert.equal(classifyInsightBenchmarkDisclosure(goiCompactSummary), 'DOMESTIC_MANDI');

    const manualOnly = {
      headline: 'Packaging quote increased slightly.',
      what_happened: 'Direct supplier quote rose from INR 90 to INR 95.',
      evidence_prices: [
        { id: 20, currency: 'INR', unit_label: 'kg', data_class: 'SUPPLIER_QUOTE' },
      ],
    };
    assert.equal(classifyInsightBenchmarkDisclosure(manualOnly), 'NONE');
  });
});

describe('T-01.4 — Modal safe dismiss handlers', () => {
  test('Escape and backdrop interactions with undefined or non-function onClose do not crash', () => {
    const backdrop = { id: 'backdrop' };
    const dialogChild = { id: 'dialog' };

    assert.doesNotThrow(() => safeInvokeClose(undefined));
    assert.doesNotThrow(() => safeInvokeClose('not-a-function'));
    assert.equal(safeInvokeClose(undefined), false);

    assert.doesNotThrow(() => handleModalEscapeKey({ key: 'Escape' }, undefined));
    assert.doesNotThrow(() => handleModalEscapeKey({ key: 'Escape' }, null));
    assert.equal(handleModalEscapeKey({ key: 'Escape' }, undefined), true);
    assert.equal(handleModalEscapeKey({ key: 'Enter' }, () => { throw new Error('Should not run'); }), false);

    assert.doesNotThrow(() => handleModalBackdropClick({ target: backdrop }, backdrop, undefined));
    assert.equal(handleModalBackdropClick({ target: dialogChild }, backdrop, undefined), false);
  });

  test('valid onClose callback is invoked normally on Escape and direct backdrop click', () => {
    const backdrop = { id: 'backdrop' };
    const dialogChild = { id: 'dialog' };
    let closeCalls = 0;
    const onClose = () => { closeCalls += 1; };

    assert.equal(handleModalEscapeKey({ key: 'Escape' }, onClose), true);
    assert.equal(closeCalls, 1);

    // Clicking inside child element does NOT close
    assert.equal(handleModalBackdropClick({ target: dialogChild }, backdrop, onClose), false);
    assert.equal(closeCalls, 1);

    // Clicking backdrop directly closes
    assert.equal(handleModalBackdropClick({ target: backdrop }, backdrop, onClose), true);
    assert.equal(closeCalls, 2);

    assert.equal(safeInvokeClose(onClose), true);
    assert.equal(closeCalls, 3);
  });
});

describe('T-01.5 — Evidence price badge & disclosure consistency', () => {
  test('never labels non-proxy GOI MARKET_INDICATIVE records as Proxy Benchmark', () => {
    const goiWheat = {
      id: 1,
      currency: 'INR',
      unit_label: 'INR/quintal',
      source: 'GOVERNMENT_DATASET',
      data_class: 'MARKET_INDICATIVE',
      provider_name: 'Data.gov.in (Agmarknet / MoAFW)',
      source_url: 'https://data.gov.in',
      isProxy: false,
    };
    assert.equal(classifyEvidencePriceBadge(goiWheat), 'Mandi Benchmark');

    // Also when source is omitted or THIRD_PARTY_API and no explicit isProxy boolean (current DB row shape)
    const goiDbRow = {
      id: 2,
      currency: 'INR',
      unit_label: 'INR/quintal',
      source: 'THIRD_PARTY_API',
      data_class: 'MARKET_INDICATIVE',
      provider_name: 'Data.gov.in (Agmarknet / MoAFW)',
    };
    assert.equal(classifyEvidencePriceBadge(goiDbRow), 'Mandi Benchmark');

    const genericNonProxyIndicative = {
      id: 3,
      currency: 'INR',
      data_class: 'MARKET_INDICATIVE',
      is_proxy: false,
      provider_name: 'Regional Spot Index',
    };
    assert.equal(classifyEvidencePriceBadge(genericNonProxyIndicative), 'Market Indicative');
  });

  test('preserves Proxy Benchmark for genuine proxy MARKET_INDICATIVE records and respects isProxy/source flags', () => {
    const eiaProxyIndicative = {
      id: 10,
      currency: 'USD',
      unit_label: 'USD/bbl',
      source: 'THIRD_PARTY_API',
      data_class: 'MARKET_INDICATIVE',
      provider_name: 'U.S. Energy Information Administration (EIA)',
    };
    assert.equal(classifyEvidencePriceBadge(eiaProxyIndicative), 'Proxy Benchmark');

    const explicitProxyTrue = {
      id: 11,
      currency: 'INR',
      data_class: 'MARKET_INDICATIVE',
      is_proxy: true,
    };
    assert.equal(classifyEvidencePriceBadge(explicitProxyTrue), 'Proxy Benchmark');
    assert.equal(
      classifyInsightBenchmarkDisclosure({ headline: 'Test', what_happened: 'Test' }, [explicitProxyTrue]),
      'CRUDE_PROXY'
    );

    const manualIndicative = {
      id: 12,
      currency: 'INR',
      source: 'MANUAL',
      data_class: 'MARKET_INDICATIVE',
    };
    assert.equal(classifyEvidencePriceBadge(manualIndicative), 'Market Indicative');

    const manualInrQuintalQuote = {
      id: 13,
      currency: 'INR',
      unit_label: 'INR/quintal',
      source: 'MANUAL',
      data_class: 'SUPPLIER_QUOTE',
    };
    assert.equal(classifyEvidencePriceBadge(manualInrQuintalQuote), 'Supplier Quote');
    assert.equal(
      classifyInsightBenchmarkDisclosure({ headline: 'Wheat quote', what_happened: 'Local quote' }, [manualInrQuintalQuote]),
      'NONE'
    );
  });
});

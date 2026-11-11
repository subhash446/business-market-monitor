/**
 * Price Source & Proxy Classification Utilities
 * Business Market Monitor — React frontend
 */

import { resolveMaterialCurrency } from './format.js';

const CRUDE_PROXY_SYMBOLS = new Set(['WTI', 'BRENT']);

/**
 * Determine whether the currently displayed price reflects an upstream proxy benchmark.
 * Manual supplier quotes and domestic Indian government mandi benchmarks are never treated as crude proxies.
 *
 * @param {{
 *   latestPrice?: object | null,
 *   sourceInfo?: object | null,
 *   material?: object | null,
 * }} params
 * @returns {boolean}
 */
export function resolveIsProxyPrice({ latestPrice, sourceInfo, material }) {
  if (latestPrice?.source === 'MANUAL' || latestPrice?.dataClass === 'SUPPLIER_QUOTE') {
    return false;
  }

  if (typeof sourceInfo?.isProxy === 'boolean') {
    return sourceInfo.isProxy;
  }

  if (latestPrice?.dataClass === 'OFFICIAL_BENCHMARK') {
    return true;
  }

  if (latestPrice?.dataClass === 'MARKET_INDICATIVE') {
    if (latestPrice.currency === 'INR' || material?.externalSymbol?.endsWith('_GOI')) {
      return false;
    }
    return true;
  }

  return CRUDE_PROXY_SYMBOLS.has(material?.externalSymbol);
}

/**
 * Build an accurate non-proxy fallback sourceInfo snapshot if refreshing source-info fails
 * right after saving a manual supplier quote.
 *
 * @param {object|null} prevSourceInfo
 * @param {object|null} createdPrice
 * @param {object|null} material
 * @returns {object}
 */
export function buildManualSourceInfoFallback(prevSourceInfo, createdPrice, material) {
  const currency = resolveMaterialCurrency({
    currency: createdPrice?.currency,
    sourceCurrency: prevSourceInfo?.currency,
    externalSymbol: null,
  });

  return {
    ...(prevSourceInfo || {}),
    latestPrice: createdPrice?.price ?? prevSourceInfo?.latestPrice ?? null,
    recordedAt: createdPrice?.recordedAt ?? prevSourceInfo?.recordedAt ?? null,
    source: 'MANUAL',
    currency,
    unitLabel: createdPrice?.unitLabel || material?.unit || prevSourceInfo?.unitLabel || null,
    dataClass: 'SUPPLIER_QUOTE',
    providerName: createdPrice?.providerName || 'Supplier Manual Entry',
    sourceUrl: createdPrice?.sourceUrl || null,
    region: createdPrice?.region || 'Domestic (India)',
    grade: createdPrice?.grade || null,
    isProxy: false,
    disclaimer: null,
  };
}

/**
 * Refresh source-info after logging a manual supplier quote, falling back gracefully
 * so a transient source-info refresh failure never leaves stale proxy metadata in the UI.
 *
 * @param {{
 *   materialId: string | number,
 *   fetchSourceInfo: (id: string | number) => Promise<object | null>,
 *   createdPrice: object | null,
 *   prevSourceInfo: object | null,
 *   material: object | null,
 * }} params
 * @returns {Promise<object>}
 */
export async function refreshSourceInfoAfterManualQuote({
  materialId,
  fetchSourceInfo,
  createdPrice,
  prevSourceInfo,
  material,
}) {
  try {
    const refreshed = await fetchSourceInfo(materialId);
    if (refreshed) {
      return refreshed;
    }
  } catch {
    // Non-fatal: manual price already saved; return consistent non-proxy metadata below.
  }

  return buildManualSourceInfoFallback(prevSourceInfo, createdPrice, material);
}

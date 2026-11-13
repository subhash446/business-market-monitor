/**
 * InsightCard Benchmark Disclosure Classifier
 * Business Market Monitor — React frontend
 *
 * Separates domestic Indian government mandi benchmarks (INR/quintal via data.gov.in)
 * from global upstream crude proxy benchmarks (WTI/Brent USD/bbl) so domestic GOI
 * insights never display misleading USD/bbl proxy notices.
 */

const GOI_PROVIDER_HINT = 'data.gov.in';
const GOI_SOURCE_HINTS = ['data.gov.in', 'agmarknet', 'moafw'];
const GOI_TEXT_HINTS = ['mandi', 'agmarknet', 'inr/quintal', 'data.gov.in'];
const CRUDE_TEXT_HINTS = ['wti', 'brent', 'crude', 'usd/bbl', 'global commodity proxy', 'upstream benchmark'];

function getExplicitProxyFlag(point) {
  if (typeof point?.is_proxy === 'boolean') return point.is_proxy;
  if (typeof point?.isProxy === 'boolean') return point.isProxy;
  return null;
}

function hasGoiSourceMarkers(point) {
  if (!point) return false;
  if (point.source === 'GOVERNMENT_DATASET') return true;
  if (point.unit_label === 'INR/quintal') return true;
  if (typeof point.provider_name === 'string') {
    const providerLower = point.provider_name.toLowerCase();
    if (GOI_SOURCE_HINTS.some((hint) => providerLower.includes(hint))) {
      return true;
    }
  }
  if (typeof point.source_url === 'string' && point.source_url.toLowerCase().includes(GOI_PROVIDER_HINT)) {
    return true;
  }
  return false;
}

function isGoiPriceEvidence(point) {
  if (!point) return false;
  if (point.source === 'MANUAL' || point.data_class === 'SUPPLIER_QUOTE') return false;
  if (getExplicitProxyFlag(point) === true) return false;
  if (hasGoiSourceMarkers(point) && point.currency !== 'USD') {
    return true;
  }
  if (point.currency !== 'INR') return false;
  return point.data_class === 'MARKET_INDICATIVE' || point.data_class === 'OFFICIAL_BENCHMARK';
}

function isCrudeProxyPriceEvidence(point) {
  if (!point) return false;
  const explicitProxy = getExplicitProxyFlag(point);
  if (explicitProxy !== null) return explicitProxy;
  if (point.source === 'MANUAL' || point.data_class === 'SUPPLIER_QUOTE') return false;
  if (point.currency === 'USD' || point.unit_label === 'USD/bbl') return true;
  if (hasGoiSourceMarkers(point) || point.currency === 'INR') return false;
  return point.data_class === 'OFFICIAL_BENCHMARK' || point.data_class === 'MARKET_INDICATIVE';
}

/**
 * Classify the evidence table badge label for a single price point consistently
 * with InsightCard benchmark disclosures and source/isProxy provenance.
 *
 * @param {object|null|undefined} point
 * @returns {'Official Benchmark' | 'Proxy Benchmark' | 'Mandi Benchmark' | 'Market Indicative' | 'Supplier Quote'}
 */
export function classifyEvidencePriceBadge(point) {
  if (!point) return 'Supplier Quote';

  if (point.data_class === 'OFFICIAL_BENCHMARK') {
    return 'Official Benchmark';
  }

  if (point.data_class === 'MARKET_INDICATIVE') {
    const explicitProxy = getExplicitProxyFlag(point);
    if (explicitProxy === true) {
      return 'Proxy Benchmark';
    }
    if (explicitProxy === false) {
      return hasGoiSourceMarkers(point)
        ? 'Mandi Benchmark'
        : 'Market Indicative';
    }
    if (point.source === 'MANUAL') {
      return 'Market Indicative';
    }
    if (isCrudeProxyPriceEvidence(point)) {
      return 'Proxy Benchmark';
    }
    if (isGoiPriceEvidence(point)) {
      return hasGoiSourceMarkers(point) ? 'Mandi Benchmark' : 'Market Indicative';
    }
    return 'Market Indicative';
  }

  return 'Supplier Quote';
}

/**
 * Classify disclosure type for an AI insight:
 *   - 'CRUDE_PROXY'    — upstream USD/crude proxy benchmark notice
 *   - 'DOMESTIC_MANDI' — Indian INR wholesale mandi benchmark notice
 *   - 'NONE'           — direct manual supplier quotes / no benchmark disclosure
 *
 * @param {object|null} insight
 * @param {Array<object>} [pricesList]
 * @returns {'CRUDE_PROXY' | 'DOMESTIC_MANDI' | 'NONE'}
 */
export function classifyInsightBenchmarkDisclosure(insight, pricesList = []) {
  if (!insight) return 'NONE';

  const prices = Array.isArray(pricesList) && pricesList.length > 0
    ? pricesList
    : (Array.isArray(insight.evidence_prices) ? insight.evidence_prices : []);

  if (prices.length > 0) {
    if (prices.some(isCrudeProxyPriceEvidence)) {
      return 'CRUDE_PROXY';
    }
    if (prices.some(isGoiPriceEvidence)) {
      return 'DOMESTIC_MANDI';
    }
    return 'NONE';
  }

  // Fallback for compact cards (e.g. Dashboard) where evidence_prices may not be embedded
  const headline = (insight.headline || '').toLowerCase();
  const whatHappened = (insight.what_happened || '').toLowerCase();
  const combinedText = `${headline} ${whatHappened}`;

  if (CRUDE_TEXT_HINTS.some((hint) => combinedText.includes(hint))) {
    return 'CRUDE_PROXY';
  }
  if (GOI_TEXT_HINTS.some((hint) => combinedText.includes(hint))) {
    return 'DOMESTIC_MANDI';
  }
  if (whatHappened.includes('proxy') || whatHappened.includes('upstream')) {
    return 'CRUDE_PROXY';
  }

  return 'NONE';
}

/**
 * Dashboard business logic (Document 2 §5.9 FR-DASH-01, 03, 04,
 * Document 3 §5 DashboardAggregationService). Framework-agnostic — no
 * req/res, no SQL (Document 3 §3). Composes reads across five other
 * modules' repositories — no table of its own (Document 4 §11).
 *
 * FR-DASH-02 (significantChange) is deliberately NOT implemented here.
 * Per explicit instruction: no numeric percentage threshold exists
 * anywhere in the frozen documents, config, or codebase (confirmed by
 * exhaustive search before this file was written) — inventing one was
 * refused. The field is omitted from the response entirely rather than
 * guessed at. See the final report's "Remaining Work" for what closing
 * this gap requires.
 */
const businessRepository = require('../repositories/business.repository');
const materialRepository = require('../repositories/material.repository');
const priceRepository = require('../repositories/price.repository');
const newsRepository = require('../repositories/news.repository');
const alertRuleRepository = require('../repositories/alertRule.repository');
const alertEventRepository = require('../repositories/alertEvent.repository');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const AppError = require('../utils/AppError');

// "Recent" news/events list size — a plain implementation constant (like
// this project's existing default pagination limit), not a hidden business
// rule. Unlike the significant-change threshold, Document 5's dashboard
// example doesn't imply this needs to be user- or admin-configurable.
const RECENT_ITEMS_LIMIT = 5;

async function getDashboard(businessId) {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new AppError(404, 'NOT_FOUND', 'Business not found');
  }

  // FR-DASH-01: "all Tracked Materials" — interpreted as currently-tracked
  // (is_tracked = true), consistent with FR-MAT-03's "stop tracking"
  // semantics: a business that paused a material no longer wants it on
  // its dashboard, even though its price history is preserved elsewhere.
  const allMaterials = await materialRepository.listByBusinessId(businessId);
  const trackedMaterials = allMaterials.filter((m) => !!m.is_tracked);

  const materialIds = trackedMaterials.map((m) => m.id);
  const latestPrices = await priceRepository.findLatestPricesByMaterialIds(materialIds);
  const priceByMaterialId = new Map(latestPrices.map((p) => [p.tracked_material_id, p]));

  const trackedMaterialsResponse = trackedMaterials.map((m) => {
    const latest = priceByMaterialId.get(m.id);
    return {
      id: m.id,
      name: m.name,
      latestPrice: latest ? latest.price : null,
      // significantChange intentionally omitted — see file header.
    };
  });

  const recentNewsRows = await newsRepository.listByIndustry(business.industry_id, {
    limit: RECENT_ITEMS_LIMIT,
    offset: 0,
  });
  const recentNews = recentNewsRows.map((n) => ({ id: n.id, title: n.title }));

  // Document 5 §4.9 wants "active" rules specifically — filtering the
  // existing listActiveByBusinessId() result (which already excludes
  // soft-deleted rules) rather than adding a new repository query.
  const allRules = await alertRuleRepository.listActiveByBusinessId(businessId);
  const activeAlertRules = allRules
    .filter((r) => !!r.is_active)
    .map((r) => ({ id: r.id, conditionType: r.condition_type, thresholdPrice: r.threshold_price }));

  const recentEventRows = await alertEventRepository.listByBusinessId(businessId, {
    limit: RECENT_ITEMS_LIMIT,
    offset: 0,
  });
  const recentAlertEvents = recentEventRows.map((e) => ({ id: e.id, triggeredAt: e.triggered_at }));

  const syncRows = await syncStatusRepository.findAll();
  const priceSync = syncRows.find((s) => s.job_type === 'PRICE_INGESTION');
  const newsSync = syncRows.find((s) => s.job_type === 'NEWS_INGESTION');
  const sync = {
    lastPriceSyncAt: priceSync ? priceSync.last_success_at : null,
    lastNewsSyncAt: newsSync ? newsSync.last_success_at : null,
  };

  return {
    trackedMaterials: trackedMaterialsResponse,
    recentNews,
    activeAlertRules,
    recentAlertEvents,
    sync,
  };
}

module.exports = { getDashboard };

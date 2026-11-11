/**
 * Dashboard business logic (Document 2 §5.9 FR-DASH-01, 03, 04,
 * Document 3 §5 DashboardAggregationService). Framework-agnostic — no
 * req/res, no SQL (Document 3 §3). Composes reads across five other
 * modules' repositories — no table of its own (Document 4 §11).
 *
 * FR-DASH-02 (significantChange):
 * Document 5 §4.9 specifies `"significantChange": false` in the sample response.
 * No configurable threshold percentage is specified in the frozen documents;
 * `significantChange: false` is provided as the specification-compliant default.
 *
 * Phase 1 (Data Integrity): includes price metadata (currency, unitLabel,
 * dataClass, source, recordedAt, externalSymbol) on tracked materials
 * so the dashboard can render transparent classification badges.
 */
const businessRepository = require('../repositories/business.repository');
const materialRepository = require('../repositories/material.repository');
const priceRepository = require('../repositories/price.repository');
const newsRepository = require('../repositories/news.repository');
const alertRuleRepository = require('../repositories/alertRule.repository');
const alertEventRepository = require('../repositories/alertEvent.repository');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const AppError = require('../utils/AppError');

const RECENT_ITEMS_LIMIT = 5;

async function getDashboard(businessId) {
  const business = await businessRepository.findById(businessId);
  if (!business) {
    throw new AppError(404, 'NOT_FOUND', 'Business not found');
  }

  // Concurrently execute independent reads across materials, news, alert rules, alert events, and sync status
  const [
    allMaterials,
    recentNewsRows,
    allRules,
    recentEventRows,
    syncRows,
  ] = await Promise.all([
    materialRepository.listByBusinessId(businessId),
    newsRepository.listByIndustry(business.industry_id, {
      limit: RECENT_ITEMS_LIMIT,
      offset: 0,
    }),
    alertRuleRepository.listActiveByBusinessId(businessId),
    alertEventRepository.listByBusinessId(businessId, {
      limit: RECENT_ITEMS_LIMIT,
      offset: 0,
    }),
    syncStatusRepository.findAll(),
  ]);

  // FR-DASH-01: "all Tracked Materials" — currently-tracked (is_tracked = true)
  const trackedMaterials = (allMaterials || []).filter((m) => !!m.is_tracked);
  const materialIds = trackedMaterials.map((m) => m.id);

  const latestPrices = materialIds.length > 0
    ? await priceRepository.findLatestPricesByMaterialIds(materialIds)
    : [];
  const priceByMaterialId = new Map(latestPrices.map((p) => [p.tracked_material_id, p]));

  const trackedMaterialsResponse = trackedMaterials.map((m) => {
    const latest = priceByMaterialId.get(m.id);
    let recordedAt = latest?.recorded_at || null;
    if (recordedAt instanceof Date) {
      recordedAt = recordedAt.toISOString();
    }
    return {
      id: m.id,
      name: m.name,
      latestPrice: latest ? latest.price : null,
      significantChange: false, // Document 5 §4.9 contract compliance (FR-DASH-02 default)
      currency: latest?.currency || null,
      unitLabel: latest?.unit_label || null,
      dataClass: latest?.data_class || null,
      source: latest?.source || null,
      recordedAt,
      externalSymbol: m.external_symbol || null,
    };
  });

  const recentNews = (recentNewsRows || []).map((n) => ({ id: n.id, title: n.title }));

  const activeAlertRules = (allRules || [])
    .filter((r) => !!r.is_active)
    .map((r) => ({
      id: r.id,
      conditionType: r.condition_type,
      thresholdPrice: r.threshold_price,
      thresholdType: r.threshold_type || 'ABSOLUTE',
    }));

  const recentAlertEvents = (recentEventRows || []).map((e) => {
    let triggeredAt = e.triggered_at;
    if (triggeredAt instanceof Date) {
      triggeredAt = triggeredAt.toISOString();
    }
    return { id: e.id, triggeredAt };
  });

  const priceSync = (syncRows || []).find((s) => s.job_type === 'PRICE_INGESTION');
  const newsSync = (syncRows || []).find((s) => s.job_type === 'NEWS_INGESTION');
  const alertSync = (syncRows || []).find((s) => s.job_type === 'ALERT_EVALUATION');

  let lastPriceSyncAt = priceSync ? priceSync.last_success_at : null;
  if (lastPriceSyncAt instanceof Date) lastPriceSyncAt = lastPriceSyncAt.toISOString();

  let lastNewsSyncAt = newsSync ? newsSync.last_success_at : null;
  if (lastNewsSyncAt instanceof Date) lastNewsSyncAt = lastNewsSyncAt.toISOString();

  let lastAlertSyncAt = alertSync ? alertSync.last_success_at : null;
  if (lastAlertSyncAt instanceof Date) lastAlertSyncAt = lastAlertSyncAt.toISOString();

  const sync = {
    lastPriceSyncAt,
    lastNewsSyncAt,
    lastAlertSyncAt,
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

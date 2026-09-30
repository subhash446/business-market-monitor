/**
 * verify_single_insight.js — Controlled single-material AI insight runner.
 *
 * PURPOSE
 *   Generates and stores exactly one AI insight for a single, explicitly
 *   specified tracked material using genuine existing price and news data
 *   already in the database. Intended for production verification only;
 *   must be authorised by the operator before execution.
 *
 * HARD-CODED TARGETS
 *   businessId  = 1   (the only safe, tested business for Phase 3 verification)
 *   materialId  = 1   (Bottle Caps, business_id=1 — confirmed ≥3 price points)
 *
 * GUARANTEES
 *   • Calls findByIdForBusiness(materialId, businessId) — aborts on null (ownership
 *     failure or wrong tenant).
 *   • Evidence floor: generateAndStore() skips if fewer than 3 price points exist.
 *   • Duplicate guard: aborts if an insight already exists for today (UTC) for
 *     this material, without calling Gemini or writing anything.
 *   • Calls generateAndStore() directly — does NOT call runInsights() or the
 *     batch job; does NOT write to sync_statuses.
 *   • At most ONE Gemini call and at most ONE ai_insights INSERT per run.
 *   • Closes the database pool on every exit path via a finally block.
 *
 * DATABASE EFFECTS (if authorised and run)
 *   • Reads:  tracked_materials, price_points, news_items, news_item_tags,
 *             knowledge_base_dependencies, ai_insights
 *   • Writes: at most one row INSERT into ai_insights
 *   • No writes to: sync_statuses, or any other table
 *
 * ROLLBACK
 *   DELETE FROM ai_insights
 *   WHERE id = <logged_insight_id>
 *     AND tracked_material_id = 1
 *     AND business_id = 1
 *   LIMIT 1;
 *
 * SECURITY NOTES
 *   • GEMINI_API_KEY is never logged, printed, or referenced here.
 *   • No prompt text is logged. No raw evidence data is logged.
 *   • Only sanitized status fields (outlook, confidence, insight id) are output.
 */

'use strict';

require('dotenv').config();

const { pool }                = require('../src/database/connection');
const materialRepository      = require('../src/repositories/material.repository');
const priceRepository         = require('../src/repositories/price.repository');
const newsRepository          = require('../src/repositories/news.repository');
const aiInsightRepository     = require('../src/repositories/aiInsight.repository');
const knowledgeBaseRepository = require('../src/repositories/knowledgeBase.repository');
const { filterRelevantNews }  = require('../src/utils/newsRelevance');
const { generateAndStore }    = require('../src/services/aiInsight.service');

// ── Constants ────────────────────────────────────────────────────────────────

const BUSINESS_ID  = 1;
const MATERIAL_ID  = 1;

// Match the batch job's 30-day evidence window (aiInsights.job.js line 46).
const PRICE_HISTORY_DAYS = 30;

// Max candidate news headlines fetched before relevance filtering.
const NEWS_CANDIDATES_LIMIT = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the current date as a UTC YYYY-MM-DD string (no time component).
 * Used for the same-day duplicate guard.
 */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns an ISO-format datetime string for `days` days before `fromDate`,
 * formatted as 'YYYY-MM-DD HH:MM:SS' (matches the batch job's evidenceFromStr
 * format, aiInsights.job.js lines 131–134).
 */
function evidenceWindowStart(fromDate, days) {
  const windowMs = days * 24 * 60 * 60 * 1000;
  return new Date(fromDate - windowMs)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[verify-single-insight] Starting — businessId=%d materialId=%d', BUSINESS_ID, MATERIAL_ID);

  // ── Step 1: Ownership verification ──────────────────────────────────────
  // findByIdForBusiness enforces business_id in WHERE clause — any cross-tenant
  // materialId returns null here, not after fetching evidence.
  const material = await materialRepository.findByIdForBusiness(MATERIAL_ID, BUSINESS_ID);
  if (!material) {
    console.error(
      '[verify-single-insight] ABORT: materialId=%d does not exist or does not belong to businessId=%d.',
      MATERIAL_ID, BUSINESS_ID
    );
    process.exitCode = 1;
    return;
  }
  console.log('[verify-single-insight] Ownership confirmed — material name: %s', material.name);

  // ── Step 2: Duplicate guard (same UTC day) ───────────────────────────────
  // No UNIQUE constraint exists in ai_insights (migration 020, intentional).
  // This application-layer check prevents duplicate rows for the same day.
  const existing = await aiInsightRepository.findLatestByMaterial(MATERIAL_ID, BUSINESS_ID);
  if (existing) {
    const existingDate = new Date(existing.generated_at).toISOString().slice(0, 10); // YYYY-MM-DD
    const today = todayUtc();
    if (existingDate === today) {
      console.log(
        '[verify-single-insight] ABORT: An insight already exists for today (UTC %s) — insightId=%d. ' +
        'No Gemini call made. No data written.',
        today, existing.id
      );
      console.log('[verify-single-insight] Existing insight: outlook=%s confidence=%s', existing.outlook, existing.confidence);
      process.exitCode = 0;
      return;
    }
    console.log(
      '[verify-single-insight] Existing insight found but from a previous day (%s). Proceeding.',
      existingDate
    );
  } else {
    console.log('[verify-single-insight] No prior insight found for this material. Proceeding.');
  }

  // ── Step 3: Fetch price evidence ─────────────────────────────────────────
  // Uses the same 30-day window as the batch job. No business_id needed here
  // because ownership was confirmed in Step 1.
  const now = new Date();
  const evidenceFrom = evidenceWindowStart(now, PRICE_HISTORY_DAYS);

  const prices = await priceRepository.findHistoryForMaterial(MATERIAL_ID, {
    from:   evidenceFrom,
    to:     null,
    limit:  PRICE_HISTORY_DAYS + 5,
    offset: 0,
  });
  console.log('[verify-single-insight] Price evidence fetched — count=%d (window: %s to now)', prices.length, evidenceFrom);

  if (prices.length < 3) {
    console.log(
      '[verify-single-insight] Insufficient price evidence (need ≥3, got %d). ' +
      'No Gemini call made. No data written.',
      prices.length
    );
    process.exitCode = 0;
    return;
  }

  // ── Step 4: Fetch news evidence ───────────────────────────────────────────
  // Industry id for business 1 is stored on the material row (via findAllTracked's
  // join — but findByIdForBusiness does not join businesses). We must fetch it
  // separately from the business row via findAllTracked or directly from DB.
  // Since findByIdForBusiness doesn't return industry_id, we use findAllTracked
  // then filter — it's a small, cached-in-memory list for this script only.
  let newsHeadlines = [];

  try {
    const allTracked = await materialRepository.findAllTracked();
    const fullMaterial = allTracked.find(m => m.id === MATERIAL_ID && m.business_id === BUSINESS_ID);

    if (fullMaterial && fullMaterial.industry_id) {
      const candidateNews = await newsRepository.listRecentByIndustry(
        fullMaterial.industry_id,
        NEWS_CANDIDATES_LIMIT
      );
      const safeCandidates = Array.isArray(candidateNews) ? candidateNews : [];

      // Fetch KB external factor dependencies for better news relevance.
      let externalFactorNames = [];
      if (fullMaterial.raw_material_id) {
        try {
          const dependencies = await knowledgeBaseRepository.getDependenciesForRawMaterial(
            fullMaterial.raw_material_id,
            fullMaterial.industry_id
          );
          externalFactorNames = dependencies
            .map(d => d.external_factor_name)
            .filter(Boolean);
        } catch (kbErr) {
          // Non-fatal — proceed without KB dependencies.
          console.log('[verify-single-insight] KB dependency lookup failed (non-fatal): %s', kbErr.message);
        }
      }

      newsHeadlines = filterRelevantNews(safeCandidates, fullMaterial.name, externalFactorNames, 5);
      console.log(
        '[verify-single-insight] News evidence fetched — candidates=%d relevant=%d externalFactors=%d',
        safeCandidates.length, newsHeadlines.length, externalFactorNames.length
      );
    } else {
      console.log('[verify-single-insight] industry_id not found — proceeding without news evidence.');
    }
  } catch (newsErr) {
    // News fetch failure is non-fatal — the evidence floor uses prices only.
    console.log('[verify-single-insight] News fetch failed (non-fatal, proceeding with prices only): %s', newsErr.message);
  }

  // ── Step 5: Generate and store — at most one Gemini call, at most one INSERT ──
  console.log('[verify-single-insight] Calling generateAndStore()...');

  const result = await generateAndStore({
    trackedMaterialId: MATERIAL_ID,
    businessId:        BUSINESS_ID,
    materialName:      material.name,
    prices,
    newsHeadlines,
  });

  // ── Step 6: Report result ─────────────────────────────────────────────────
  if (result.status === 'generated') {
    const { insight } = result;
    console.log('[verify-single-insight] SUCCESS — insight generated and stored.');
    console.log(`[verify-single-insight] insightId=${insight.id} outlook=${insight.outlook} confidence=${insight.confidence} model=${insight.model_used}`);
    console.log(`[verify-single-insight] evidencePricePoints=${insight.evidence_price_points_count} evidenceNewsCount=${insight.evidence_news_count}`);
    console.log(`[verify-single-insight] DB write: 1 row inserted into ai_insights (id=${insight.id} tracked_material_id=${insight.tracked_material_id} business_id=${insight.business_id})`);
    console.log('[verify-single-insight] Rollback command (if needed):');
    console.log(`  DELETE FROM ai_insights WHERE id = ${insight.id} AND tracked_material_id = ${insight.tracked_material_id} AND business_id = ${insight.business_id} LIMIT 1;`);
    process.exitCode = 0;

  } else if (result.status === 'skipped') {
    console.log(
      '[verify-single-insight] SKIPPED — insufficient evidence (priceCount=%d). ' +
      'No Gemini call made. No data written.',
      result.priceCount
    );
    process.exitCode = 0;

  } else if (result.status === 'error') {
    // Error detail is logged without exposing keys, prompts, or raw data.
    const errMsg = result.error && result.error.message
      ? result.error.message
      : String(result.error);
    console.error('[verify-single-insight] ERROR — materialId=%d businessId=%d: %s',
      MATERIAL_ID, BUSINESS_ID, errMsg);
    process.exitCode = 1;

  } else {
    console.error('[verify-single-insight] ERROR — unexpected result status: %s', result.status);
    process.exitCode = 1;
  }
}

// ── Entry point with guaranteed pool close on every exit path ────────────────
main()
  .catch(err => {
    // Catch top-level failures (DB connection, ownership check, price fetch).
    const msg = err && err.message ? err.message : String(err);
    console.error('[verify-single-insight] FATAL: %s', msg);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end().catch(() => {
      // Suppress pool-close errors on shutdown — not actionable.
    });
  });

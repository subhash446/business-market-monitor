/**
 * Automatic AI Market Intelligence insights job (Phase H).
 *
 * Scheduled via node-cron using env.cron.aiInsights (AI_INSIGHTS_CRON,
 * default: '0 6 * * *' -- 06:00 UTC daily, one hour after price ingestion).
 * The scheduler is initialised explicitly in UTC via timezone: 'UTC'.
 *
 * Job lifecycle:
 *   start()  -- called once in server.js after app.listen()
 *   stop()   -- called in server.js graceful-shutdown handler
 *
 * Safety guarantees:
 *   - Skips execution when AI_INSIGHTS_ENABLED=false (safe default).
 *   - In-memory overlap guard prevents concurrent runs.
 *   - isRunning is ALWAYS reset in a finally block.
 *   - One material failure does not abort the batch.
 *   - Sync status is written at run-start and run-end.
 *   - Gemini / LLM failures are handled per-material.
 *
 * Evidence fetching strategy:
 *   - Price evidence: last 30 days of price_points.
 *   - News evidence: up to 10 recent industry news candidates,
 *     filtered deterministically for material relevance and capped at 5.
 *   - Built-in materials additionally use KB external-factor dependencies.
 */

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');

const materialRepository = require('../repositories/material.repository');
const priceRepository = require('../repositories/price.repository');
const newsRepository = require('../repositories/news.repository');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const knowledgeBaseRepository = require('../repositories/knowledgeBase.repository');

const { filterRelevantNews } = require('../utils/newsRelevance');
const { generateAndStore } = require('../services/aiInsight.service');
const { JOB_TYPE, JOB_STATUS } = require('../constants/enums');

// In-memory overlap prevention flag.
// Reset in finally -- no stale lock on restart.
let isRunning = false;

// Price history window for evidence.
const PRICE_HISTORY_DAYS = 30;

/**
 * Core insights generation logic.
 *
 * @returns {Promise<object>} summary object
 */
async function runInsights() {
  if (!env.aiInsights.enabled) {
    logger.info('[ai-insights] Skipped -- AI_INSIGHTS_ENABLED is false');

    return {
      status: 'SKIPPED',
      reason: 'disabled',
      generated: 0,
      skipped: 0,
      errors: 0,
      materials: 0,
    };
  }

  if (isRunning) {
    logger.warn(
      '[ai-insights] Previous run still in progress -- skipping this tick'
    );

    return {
      status: 'SKIPPED',
      reason: 'overlap',
      generated: 0,
      skipped: 0,
      errors: 0,
      materials: 0,
    };
  }

  isRunning = true;

  const startedAt = new Date();

  logger.info(
    '[ai-insights] Run started at ' + startedAt.toISOString()
  );

  // Record run-start immediately.
  try {
    await syncStatusRepository.upsert(JOB_TYPE.AI_INSIGHTS, {
      lastRunAt: startedAt,
      lastSuccessAt: null,
      lastStatus: null,
    });
  } catch (syncErr) {
    logger.warn(
      '[ai-insights] Could not write run-start to sync_statuses:',
      syncErr.message
    );
  }

  let jobStatus = JOB_STATUS.SUCCESS;
  let totalGenerated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let allMaterials = [];
  const errorDetails = [];

  try {
    // === Step 1: Load all actively-tracked materials ===
    allMaterials = await materialRepository.findAllTracked();

    if (allMaterials.length === 0) {
      logger.info(
        '[ai-insights] No actively-tracked materials found -- nothing to generate'
      );
    } else {
      logger.info(
        '[ai-insights] Processing ' +
          allMaterials.length +
          ' tracked material(s)'
      );

      // Compute 30-day evidence window.
      const evidenceFrom = new Date(
        startedAt - PRICE_HISTORY_DAYS * 24 * 60 * 60 * 1000
      );

      const evidenceFromStr = evidenceFrom
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);

      // === Step 2: Process each material independently ===
      for (const material of allMaterials) {
        // ---------------------------------------------------------------
        // 2a. Fetch price evidence
        // ---------------------------------------------------------------
        let prices = [];

        try {
          prices = await priceRepository.findHistoryForMaterial(
            material.id,
            {
              from: evidenceFromStr,
              to: null,
              limit: PRICE_HISTORY_DAYS + 5,
              offset: 0,
            }
          );
        } catch (priceErr) {
          logger.error(
            '[ai-insights] Could not fetch prices for materialId=' +
              material.id +
              ':',
            priceErr.message
          );

          totalErrors++;
          jobStatus = JOB_STATUS.FAILED;

          continue;
        }

        // ---------------------------------------------------------------
        // 2b. Fetch and filter news evidence
        // ---------------------------------------------------------------
        let newsHeadlines = [];

        if (material.industry_id) {
          try {
            const candidateNews =
              await newsRepository.listRecentByIndustry(
                material.industry_id,
                10
              );

            // Defensive fallback in case a mocked/legacy repository
            // returns undefined/null instead of an array.
            const safeCandidateNews = Array.isArray(candidateNews)
              ? candidateNews
              : [];

            let externalFactorNames = [];

            // Built-in raw materials have KB dependency relationships.
            // Custom materials have no raw_material_id and therefore use
            // material-name matching only.
            if (material.raw_material_id) {
              try {
                const dependencies =
                  await knowledgeBaseRepository.getDependenciesForRawMaterial(
                    material.raw_material_id,
                    material.industry_id
                  );

                externalFactorNames = dependencies
                  .map(
                    (dependency) =>
                      dependency.external_factor_name
                  )
                  .filter(Boolean);
              } catch (kbErr) {
                // KB lookup failure is non-fatal.
                logger.warn(
                  '[ai-insights] Could not fetch KB dependencies for materialId=' +
                    material.id +
                    ': ' +
                    kbErr.message
                );
              }
            }

            newsHeadlines = filterRelevantNews(
              safeCandidateNews,
              material.name,
              externalFactorNames,
              5
            );

            logger.info(
              '[ai-insights] News relevance -- materialId=' +
                material.id +
                ' candidates=' +
                safeCandidateNews.length +
                ' relevant=' +
                newsHeadlines.length +
                ' externalFactors=' +
                externalFactorNames.length
            );
          } catch (newsErr) {
            // News failure is non-fatal.
            logger.warn(
              '[ai-insights] Could not fetch news for materialId=' +
                material.id +
                ' industryId=' +
                material.industry_id +
                ' (proceeding with prices only): ' +
                newsErr.message
            );
          }
        }

        // ---------------------------------------------------------------
        // 2c. Generate and store the insight
        // ---------------------------------------------------------------
        const result = await generateAndStore({
          trackedMaterialId: material.id,
          businessId: material.business_id,
          materialName: material.name,
          prices,
          newsHeadlines,
        });

        if (result.status === 'generated') {
          totalGenerated++;

          logger.info(
            '[ai-insights] Generated -- materialId=' +
              material.id +
              ' businessId=' +
              material.business_id +
              ' outlook=' +
              result.insight.outlook +
              ' confidence=' +
              result.insight.confidence
          );
        } else if (result.status === 'skipped') {
          totalSkipped++;

          logger.info(
            '[ai-insights] Skipped (insufficient evidence) -- materialId=' +
              material.id +
              ' priceCount=' +
              result.priceCount
          );
        } else if (result.status === 'error') {
          totalErrors++;
          jobStatus = JOB_STATUS.FAILED;

          const errorInfo = {
            materialId: material.id,
            businessId: material.business_id,
            code:       result.error?.code || 'UNKNOWN',
            statusCode: result.error?.statusCode || result.error?.status || null,
            message:    result.error?.message || String(result.error),
          };
          errorDetails.push(errorInfo);

          logger.error(
            '[ai-insights] Error -- materialId=' +
              material.id +
              ' businessId=' +
              material.business_id +
              ' code=' +
              errorInfo.code +
              (errorInfo.statusCode ? ' status=' + errorInfo.statusCode : '') +
              ':',
            errorInfo.message
          );
        }
      }
    }
  } catch (unexpectedErr) {
    jobStatus = JOB_STATUS.FAILED;

    logger.error(
      '[ai-insights] Unexpected run-level error:',
      unexpectedErr.message
    );
  } finally {
    // Always release the overlap guard.
    isRunning = false;
  }

  const completedAt = new Date();
  const durationMs = completedAt - startedAt;

  logger.info(
    '[ai-insights] Run complete in ' +
      durationMs +
      'ms -- ' +
      'status=' +
      jobStatus +
      ' generated=' +
      totalGenerated +
      ' skipped=' +
      totalSkipped +
      ' errors=' +
      totalErrors +
      ' materials=' +
      allMaterials.length
  );

  // Record run-end.
  try {
    await syncStatusRepository.upsert(JOB_TYPE.AI_INSIGHTS, {
      lastRunAt: startedAt,
      lastSuccessAt:
        jobStatus === JOB_STATUS.SUCCESS ? completedAt : null,
      lastStatus: jobStatus,
    });
  } catch (syncErr) {
    logger.warn(
      '[ai-insights] Could not write run-end to sync_statuses:',
      syncErr.message
    );
  }

  return {
    status: jobStatus,
    generated: totalGenerated,
    skipped: totalSkipped,
    errors: totalErrors,
    materials: allMaterials.length,
    errorDetails,
  };
}

/**
 * Initialise and start the AI insights cron job.
 *
 * @returns {import('node-cron').ScheduledTask}
 */
function start() {
  const cronExpression = env.cron.aiInsights;

  if (!env.aiInsights.enabled) {
    logger.info(
      '[ai-insights] Job registered (schedule: ' +
        cronExpression +
        ' UTC) but will skip every tick -- ' +
        'set AI_INSIGHTS_ENABLED=true to activate'
    );
  } else {
    logger.info(
      '[ai-insights] Job started -- schedule: ' +
        cronExpression +
        ' UTC'
    );
  }

  const task = cron.schedule(cronExpression, runInsights, {
    scheduled: true,
    timezone: 'UTC',
  });

  return task;
}

module.exports = {
  start,
  runInsights,
};
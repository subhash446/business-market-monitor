/**
 * Automatic news ingestion job (Document 3 §9).
 *
 * Scheduled via node-cron using env.cron.newsIngestion (NEWS_INGESTION_CRON,
 * default: '0 * * * *' — every hour UTC). The scheduler is initialised
 * explicitly in UTC via the `timezone: 'UTC'` option.
 *
 * Job lifecycle:
 *   start()  — called once in server.js after app.listen()
 *   stop()   — called in server.js graceful-shutdown handler
 *
 * Safety guarantees:
 *   - Skips execution when NEWS_INGESTION_ENABLED=false (safe default)
 *   - In-memory overlap guard: if a previous run is still in progress,
 *     the next tick is skipped (appropriate for single-process Node.js)
 *   - All provider errors are caught and logged; the application never
 *     crashes because the provider is unavailable
 *   - isRunning is reset in a finally block — permanent lock impossible
 *   - Sync status written at run-start and run-end regardless of outcome
 *
 * Free-tier quota management:
 *   GNews free tier: 100 requests/day. With up to 5 industries and hourly
 *   runs, the job makes at most 5 provider calls per run (one per industry,
 *   batching all that industry's keywords into a single query). 5 calls/hour
 *   x 24 hours = 120 calls/day -- marginally over limit with all 5 industries.
 *   Default: max 1 article per keyword call (max=10 per call, batched per
 *   industry) keeps results focused. Operators should set NEWS_INGESTION_CRON
 *   to every-4-hours (e.g. 4-hour intervals give 5x6=30 calls/day) in production.
 */
const cron = require('node-cron');
const env  = require('../config/env');
const logger = require('../utils/logger');
const { fetchArticlesByKeyword, ProviderError } = require('../providers/gnews.provider');
const newsRepository = require('../repositories/news.repository');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const { ingestArticle } = require('../services/newsIngestion.service');
const { JOB_TYPE, JOB_STATUS } = require('../constants/enums');

// In-memory overlap prevention flag.
// Appropriate for a single-process server — no stale lock on restart.
let isRunning = false;

/**
 * Core ingestion logic. Runs as the cron callback and also exported for
 * testing (tests call runIngestion() directly without waiting for a cron tick).
 *
 * Returns a summary object:
 * {
 *   status: 'SKIPPED'|'SUCCESS'|'FAILED',
 *   reason?: string,           // present when SKIPPED
 *   inserted: number,
 *   skipped:  number,
 *   errors:   number,
 *   keywordsProcessed: number,
 * }
 */
async function runIngestion() {
  if (!env.newsIngestion.enabled) {
    logger.info('[news-ingestion] Skipped — NEWS_INGESTION_ENABLED is false');
    return { status: 'SKIPPED', reason: 'disabled', inserted: 0, skipped: 0, errors: 0, keywordsProcessed: 0 };
  }

  if (isRunning) {
    logger.warn('[news-ingestion] Previous run still in progress — skipping this tick');
    return { status: 'SKIPPED', reason: 'overlap', inserted: 0, skipped: 0, errors: 0, keywordsProcessed: 0 };
  }

  isRunning = true;
  const startedAt = new Date();
  logger.info(`[news-ingestion] Run started at ${startedAt.toISOString()}`);

  // Record run-start time immediately
  try {
    await syncStatusRepository.upsert(JOB_TYPE.NEWS_INGESTION, {
      lastRunAt: startedAt, lastSuccessAt: null, lastStatus: null,
    });
  } catch (syncErr) {
    logger.warn('[news-ingestion] Could not write run-start to sync_statuses:', syncErr.message);
  }

  let jobStatus = JOB_STATUS.SUCCESS;
  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;
  let keywordsProcessed = 0;

  try {
    // Load all keywords + industry mapping from DB (one query, cached for this run)
    const allKeywords = await newsRepository.listKeywordsWithIndustry();

    if (allKeywords.length === 0) {
      logger.info('[news-ingestion] No keywords configured — nothing to fetch');
    } else {
      // Group keywords by industry to batch provider calls
      // (one call per industry, using OR-combined query "kw1 OR kw2 OR kw3")
      const byIndustry = groupKeywordsByIndustry(allKeywords);

      for (const [industryId, kwRows] of byIndustry) {
        const query = kwRows.map((k) => `"${k.keyword}"`).join(' OR ');
        keywordsProcessed += kwRows.length;

        let articles;
        try {
          articles = await fetchArticlesByKeyword(query, { max: 10, lang: 'en' });
          logger.info(
            `[news-ingestion] Industry ${industryId}: fetched ${articles.length} article(s) for ${kwRows.length} keyword(s)`
          );
        } catch (err) {
          jobStatus = JOB_STATUS.FAILED;
          if (err instanceof ProviderError) {
            if (err.code === 'PROVIDER_AUTH') {
              logger.error(`[news-ingestion] Provider auth error — check GNEWS_API_KEY: ${err.message}`);
            } else {
              logger.warn(`[news-ingestion] Provider error (${err.code}) for industry ${industryId}: ${err.message}`);
            }
          } else {
            logger.error(`[news-ingestion] Unexpected error for industry ${industryId}:`, err.message);
          }
          continue; // move on to next industry
        }

        for (const article of articles) {
          const result = await ingestArticle(article, allKeywords);
          if (result.status === 'inserted') {
            totalInserted++;
            logger.info(`[news-ingestion] Inserted newsItemId=${result.newsItemId} "${article.title.slice(0, 60)}"`);
          } else if (result.status === 'skipped') {
            totalSkipped++;
          } else if (result.status === 'error') {
            totalErrors++;
            jobStatus = JOB_STATUS.FAILED;
            logger.error('[news-ingestion] Error ingesting article:', result.error?.message);
          }
        }
      }
    }
  } catch (unexpectedErr) {
    jobStatus = JOB_STATUS.FAILED;
    logger.error('[news-ingestion] Unexpected run-level error:', unexpectedErr.message);
  } finally {
    // Always release the overlap guard
    isRunning = false;
  }

  const completedAt = new Date();
  const durationMs  = completedAt - startedAt;
  logger.info(
    `[news-ingestion] Run complete in ${durationMs}ms — ` +
    `status=${jobStatus} inserted=${totalInserted} skipped=${totalSkipped} errors=${totalErrors}`
  );

  try {
    await syncStatusRepository.upsert(JOB_TYPE.NEWS_INGESTION, {
      lastRunAt: startedAt,
      lastSuccessAt: jobStatus === JOB_STATUS.SUCCESS ? completedAt : null,
      lastStatus: jobStatus,
    });
  } catch (syncErr) {
    logger.warn('[news-ingestion] Could not write run-end to sync_statuses:', syncErr.message);
  }

  return {
    status: jobStatus,
    inserted: totalInserted,
    skipped:  totalSkipped,
    errors:   totalErrors,
    keywordsProcessed,
  };
}

/**
 * Group keyword rows by industry_id.
 * @param {Array<{id, keyword, industry_id}>} keywords
 * @returns {Map<number, Array<{id, keyword, industry_id}>>}
 */
function groupKeywordsByIndustry(keywords) {
  const map = new Map();
  for (const kw of keywords) {
    if (!map.has(kw.industry_id)) map.set(kw.industry_id, []);
    map.get(kw.industry_id).push(kw);
  }
  return map;
}

/**
 * Initialise and start the news ingestion cron job.
 * @returns {import('node-cron').ScheduledTask} — call .stop() during shutdown
 */
function start() {
  const cronExpression = env.cron.newsIngestion;

  if (!env.newsIngestion.enabled) {
    logger.info(
      `[news-ingestion] Job registered (schedule: ${cronExpression} UTC) ` +
      `but will skip every tick — set NEWS_INGESTION_ENABLED=true to activate`
    );
  } else {
    logger.info(`[news-ingestion] Job started — schedule: ${cronExpression} UTC`);
  }

  const task = cron.schedule(cronExpression, runIngestion, {
    scheduled: true,
    timezone: 'UTC',
  });

  return task;
}

module.exports = { start, runIngestion };

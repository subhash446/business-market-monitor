/**
 * Automatic price ingestion job (Phase A — Document 3 §8).
 *
 * Scheduled via node-cron using env.cron.priceIngestion (PRICE_INGESTION_CRON,
 * default: '0 5 * * *' — 05:00 UTC daily). The scheduler is initialised
 * explicitly in UTC via the `timezone: 'UTC'` option so the schedule
 * behaves consistently across local development, cloud deployment, and
 * production servers regardless of the host system timezone.
 *
 * Job lifecycle:
 *   start()  — called once in server.js after app.listen()
 *   stop()   — called in server.js graceful-shutdown handler
 *
 * Safety guarantees:
 *   - Skips execution when PRICE_INGESTION_ENABLED=false (safe default)
 *   - In-memory overlap guard: if a previous run is still in progress,
 *     the next scheduled tick is logged and skipped (appropriate for a
 *     single-process Node.js server — no Redis/BullMQ needed)
 *   - All provider errors are caught and logged; the application never
 *     crashes because the provider is unavailable
 *   - Sync status is always written at run-start (last_run_at) and at
 *     run-end (last_status: SUCCESS or FAILED) regardless of outcome
 */
const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const { fetchLatestPrices, ProviderError } = require('../providers/eia.provider');
const materialRepository = require('../repositories/material.repository');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const { ingestFromProvider } = require('../services/priceIngestion.service');
const { SUPPORTED_SYMBOLS } = require('../config/commodityMapping');
const { JOB_TYPE, JOB_STATUS } = require('../constants/enums');

// In-memory overlap prevention flag.
// Appropriate for a single-process server — no stale lock on restart.
let isRunning = false;

/**
 * Core ingestion logic. Runs as the cron callback and also exported for
 * testing (tests call runIngestion() directly without waiting for a cron tick).
 *
 * Returns a summary object — used by tests and logged by the job:
 * {
 *   symbols: string[],          // symbols attempted
 *   providerResults: object[],  // normalized prices from provider
 *   materialResults: object[],  // per-material { status, trackedMaterialId, ... }
 *   status: 'SUCCESS'|'FAILED',
 *   error?: Error               // present only if provider call failed entirely
 * }
 */
async function runIngestion() {
  if (!env.priceIngestion.enabled) {
    logger.info('[price-ingestion] Skipped — PRICE_INGESTION_ENABLED is false');
    return { status: 'SKIPPED', reason: 'disabled' };
  }

  if (isRunning) {
    logger.warn('[price-ingestion] Previous run still in progress — skipping this tick');
    return { status: 'SKIPPED', reason: 'overlap' };
  }

  isRunning = true;
  const startedAt = new Date();
  const symbols = Object.values(SUPPORTED_SYMBOLS);

  logger.info(`[price-ingestion] Run started at ${startedAt.toISOString()} — symbols: ${symbols.join(', ')}`);

  // Record run start time immediately so the health dashboard shows activity
  // even if the run fails partway through.
  try {
    await syncStatusRepository.upsert(JOB_TYPE.PRICE_INGESTION, {
      lastRunAt: startedAt,
      lastSuccessAt: null,
      lastStatus: null,
    });
  } catch (syncErr) {
    // Sync status write failure is non-fatal — log it and continue.
    logger.warn('[price-ingestion] Could not write run-start to sync_statuses:', syncErr.message);
  }

  let providerResults = [];
  let materialResults = [];
  let jobStatus = JOB_STATUS.SUCCESS;
  let jobError;

  try {
    // === Step 1: Fetch latest prices from EIA (single batch request) ===
    providerResults = await fetchLatestPrices(symbols);
    logger.info(
      `[price-ingestion] Provider returned ${providerResults.length} price(s): ` +
      providerResults.map((r) => `${r.symbol}=${r.price} on ${r.recordedAt}`).join(', ')
    );
  } catch (err) {
    jobStatus = JOB_STATUS.FAILED;
    jobError = err;

    if (err instanceof ProviderError) {
      if (err.code === 'PROVIDER_AUTH') {
        // Auth errors indicate a misconfigured key — log as error-level so
        // it's visible and actionable; no point retrying in the same process.
        logger.error(`[price-ingestion] Provider auth error — check EIA_API_KEY: ${err.message}`);
      } else {
        logger.warn(`[price-ingestion] Provider error (${err.code}): ${err.message}`);
      }
    } else {
      logger.error('[price-ingestion] Unexpected error calling provider:', err.message);
    }
  }

  // === Step 2: For each price, ingest into all matching tracked materials ===
  if (providerResults.length > 0) {
    for (const marketPrice of providerResults) {
      let trackedMaterials;
      try {
        trackedMaterials = await materialRepository.findTrackedByExternalSymbol(marketPrice.symbol);
      } catch (err) {
        logger.error(
          `[price-ingestion] Could not query tracked materials for symbol ${marketPrice.symbol}:`,
          err.message
        );
        jobStatus = JOB_STATUS.FAILED;
        continue;
      }

      if (trackedMaterials.length === 0) {
        logger.info(
          `[price-ingestion] No tracked materials linked to symbol '${marketPrice.symbol}' — skipping`
        );
        continue;
      }

      logger.info(
        `[price-ingestion] ${marketPrice.symbol}: ingesting into ${trackedMaterials.length} material(s)`
      );

      for (const trackedMaterial of trackedMaterials) {
        const result = await ingestFromProvider(trackedMaterial, marketPrice);
        materialResults.push(result);

        if (result.status === 'inserted') {
          logger.info(
            `[price-ingestion] Inserted — trackedMaterialId=${result.trackedMaterialId} ` +
            `businessId=${result.businessId} price=${marketPrice.price} date=${marketPrice.recordedAt}`
          );
        } else if (result.status === 'skipped') {
          logger.info(
            `[price-ingestion] Skipped duplicate — trackedMaterialId=${result.trackedMaterialId} ` +
            `date=${marketPrice.recordedAt}`
          );
        } else if (result.status === 'error') {
          jobStatus = JOB_STATUS.FAILED;
          logger.error(
            `[price-ingestion] Error for trackedMaterialId=${result.trackedMaterialId}:`,
            result.error?.message
          );
        }
      }
    }
  }

  // === Step 3: Update sync status ===
  // isRunning is reset in the finally block below so the overlap guard is
  // always released even if an unexpected error escapes the inner try-catches
  // (e.g. during materialResults.filter() or a sync-status write failure that
  // somehow rethrows despite the catch). Without finally, a single unexpected
  // throw would permanently lock the job for the life of the process.
  try {
    const completedAt = new Date();
    const durationMs = completedAt - startedAt;
    const inserted = materialResults.filter((r) => r.status === 'inserted').length;
    const skipped  = materialResults.filter((r) => r.status === 'skipped').length;
    const errors   = materialResults.filter((r) => r.status === 'error').length;

    logger.info(
      `[price-ingestion] Run complete in ${durationMs}ms — ` +
      `status=${jobStatus} inserted=${inserted} skipped=${skipped} errors=${errors}`
    );

    try {
      await syncStatusRepository.upsert(JOB_TYPE.PRICE_INGESTION, {
        lastRunAt: startedAt,
        lastSuccessAt: jobStatus === JOB_STATUS.SUCCESS ? completedAt : null,
        lastStatus: jobStatus,
      });
    } catch (syncErr) {
      logger.warn('[price-ingestion] Could not write run-end to sync_statuses:', syncErr.message);
    }

    return {
      symbols,
      providerResults,
      materialResults,
      status: jobStatus,
      ...(jobError ? { error: jobError } : {}),
    };
  } finally {
    // Always release the overlap guard — regardless of what happened above.
    isRunning = false;
  }
}

/**
 * Initialise and start the price ingestion cron job.
 *
 * @returns {import('node-cron').ScheduledTask} — call .stop() during shutdown
 */
function start() {
  const cronExpression = env.cron.priceIngestion;

  if (!env.priceIngestion.enabled) {
    logger.info(
      `[price-ingestion] Job registered (schedule: ${cronExpression} UTC) ` +
      `but will skip every tick — set PRICE_INGESTION_ENABLED=true to activate`
    );
  } else {
    logger.info(
      `[price-ingestion] Job started — schedule: ${cronExpression} UTC`
    );
  }

  // timezone: 'UTC' ensures the schedule behaves identically across all
  // environments regardless of the server's local timezone setting.
  const task = cron.schedule(cronExpression, runIngestion, {
    scheduled: true,
    timezone: 'UTC',
  });

  return task;
}

module.exports = { start, runIngestion };

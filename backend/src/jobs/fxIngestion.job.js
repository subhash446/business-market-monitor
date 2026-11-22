'use strict';

/**
 * Scheduled Daily FX Ingestion Job (V3-M3 / Migration 033).
 *
 * Schedule: env.cron.fxIngestion (default: '30 4 * * *' — 04:30 AM UTC daily).
 *
 * Guarantees:
 *   - Opt-in: skips execution when FX_INGESTION_ENABLED=false (safe default).
 *   - In-memory overlap guard: skips tick if a previous run is still processing.
 *   - Writes run-start and run-end to sync_statuses (JOB_TYPE.FX_INGESTION).
 *   - Provider timeouts and network errors are caught and logged gracefully.
 */

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const fxRateService = require('../services/fxRate.service');
const { JOB_TYPE, JOB_STATUS } = require('../constants/enums');

let isRunning = false;
let scheduledTask = null;

async function runJob() {
  if (!env.fx.enabled) {
    logger.info('[fx-ingestion-job] Skipped — FX_INGESTION_ENABLED is false');
    return {
      status: 'SKIPPED',
      reason: 'disabled',
    };
  }

  if (isRunning) {
    logger.warn('[fx-ingestion-job] Previous run still in progress — skipping this tick');
    return {
      status: 'SKIPPED',
      reason: 'overlap',
    };
  }

  isRunning = true;
  const startedAt = new Date();
  logger.info(`[fx-ingestion-job] Run started at ${startedAt.toISOString()}`);

  try {
    await syncStatusRepository.upsert(JOB_TYPE.FX_INGESTION, {
      lastRunAt: startedAt,
      lastSuccessAt: null,
      lastStatus: null,
    });
  } catch (syncErr) {
    logger.warn('[fx-ingestion-job] Could not write run-start to sync_statuses:', syncErr.message);
  }

  let rateRecord = null;
  let jobStatus = JOB_STATUS.SUCCESS;

  try {
    rateRecord = await fxRateService.fetchAndStoreLatestRate('USD', 'INR');
    logger.info(`[fx-ingestion-job] Ingested USD/INR rate: ${rateRecord.rate} (date: ${rateRecord.rateDate})`);
  } catch (err) {
    jobStatus = JOB_STATUS.FAILED;
    logger.error('[fx-ingestion-job] Ingestion error:', err.message);
  } finally {
    const finishedAt = new Date();
    try {
      await syncStatusRepository.upsert(JOB_TYPE.FX_INGESTION, {
        lastRunAt: startedAt,
        lastSuccessAt: jobStatus === JOB_STATUS.SUCCESS ? finishedAt : null,
        lastStatus: jobStatus,
      });
    } catch (syncErr) {
      logger.warn('[fx-ingestion-job] Could not write run-end to sync_statuses:', syncErr.message);
    }
    isRunning = false;
  }

  return {
    status: jobStatus,
    rate: rateRecord ? rateRecord.rate : null,
  };
}

function start() {
  const cronExpression = env.cron.fxIngestion;

  if (!env.fx.enabled) {
    logger.info(
      `[fx-ingestion-job] Job registered (schedule: ${cronExpression} UTC) but will skip every tick — set FX_INGESTION_ENABLED=true to activate`
    );
  } else {
    logger.info(`[fx-ingestion-job] Job started — schedule: ${cronExpression} UTC`);
  }

  scheduledTask = cron.schedule(cronExpression, () => {
    runJob().catch((err) => {
      logger.error('[fx-ingestion-job] Unhandled error in scheduled execution:', err.message);
    });
  });

  return scheduledTask;
}

function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[fx-ingestion-job] Job stopped.');
  }
}

module.exports = {
  runJob,
  start,
  stop,
};

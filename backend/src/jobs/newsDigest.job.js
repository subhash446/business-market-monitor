'use strict';

/**
 * Scheduled Periodic News & Procurement Digest Job (FR-ALERT-06 / T-08).
 *
 * Schedule: env.cron.newsDigest (default: '0 7 * * *' — 7:00 AM UTC daily).
 *
 * Guarantees:
 *   - Opt-in: skips execution when NEWS_DIGEST_ENABLED=false (safe default).
 *   - In-memory overlap guard: skips tick if a previous run is still processing.
 *   - Writes run-start and run-end to sync_statuses (JOB_TYPE.NEWS_DIGEST).
 *   - Uncaught dispatch errors are isolated per business; job completes gracefully.
 */

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const newsDigestService = require('../services/newsDigest.service');
const { JOB_TYPE, JOB_STATUS } = require('../constants/enums');

let isRunning = false;
let scheduledTask = null;

async function runJob() {
  if (!env.newsDigest.enabled) {
    logger.info('[news-digest-job] Skipped — NEWS_DIGEST_ENABLED is false');
    return {
      status: 'SKIPPED',
      reason: 'disabled',
      processed: 0,
      successCount: 0,
    };
  }

  if (isRunning) {
    logger.warn('[news-digest-job] Previous run still in progress — skipping this tick');
    return {
      status: 'SKIPPED',
      reason: 'overlap',
      processed: 0,
      successCount: 0,
    };
  }

  isRunning = true;
  const startedAt = new Date();
  logger.info(`[news-digest-job] Run started at ${startedAt.toISOString()}`);

  try {
    await syncStatusRepository.upsert(JOB_TYPE.NEWS_DIGEST, {
      lastRunAt: startedAt,
      lastSuccessAt: null,
      lastStatus: null,
    });
  } catch (syncErr) {
    logger.warn('[news-digest-job] Could not write run-start to sync_statuses:', syncErr.message);
  }

  let results = { totalEvaluated: 0, dueCount: 0, successCount: 0, failedCount: 0 };
  let jobStatus = JOB_STATUS.SUCCESS;

  try {
    results = await newsDigestService.processAllDueDigests();
    logger.info(
      `[news-digest-job] Evaluated ${results.totalEvaluated} businesses; dispatched ${results.successCount} due digests (${results.failedCount} failed, ${results.skippedCount} not due)`
    );
  } catch (err) {
    jobStatus = JOB_STATUS.FAILED;
    logger.error('[news-digest-job] Job error during batch execution:', err.message);
  } finally {
    const finishedAt = new Date();
    try {
      await syncStatusRepository.upsert(JOB_TYPE.NEWS_DIGEST, {
        lastRunAt: startedAt,
        lastSuccessAt: jobStatus === JOB_STATUS.SUCCESS ? finishedAt : null,
        lastStatus: jobStatus,
      });
    } catch (syncErr) {
      logger.warn('[news-digest-job] Could not write run-end to sync_statuses:', syncErr.message);
    }
    isRunning = false;
  }

  return {
    status: jobStatus,
    ...results,
  };
}

function start() {
  const cronExpression = env.cron.newsDigest;

  if (!env.newsDigest.enabled) {
    logger.info(
      `[news-digest-job] Job registered (schedule: ${cronExpression} UTC) but will skip every tick — set NEWS_DIGEST_ENABLED=true to activate`
    );
  } else {
    logger.info(`[news-digest-job] Job started — schedule: ${cronExpression} UTC`);
  }

  scheduledTask = cron.schedule(cronExpression, runJob, {
    scheduled: true,
    timezone: 'UTC',
  });

  return scheduledTask;
}

function stop() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info('[news-digest-job] Job stopped.');
  }
}

module.exports = {
  start,
  stop,
  runJob,
};

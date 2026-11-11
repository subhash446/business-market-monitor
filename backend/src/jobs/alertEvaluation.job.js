/**
 * Standalone alert evaluation job (Phase 2).
 *
 * Scheduled via node-cron using env.cron.alertEvaluation (ALERT_EVALUATION_CRON,
 * default: every 15 minutes UTC).
 *
 * Safety guarantees:
 *   - Skips execution when ALERT_EVALUATION_ENABLED=false (safe default)
 *   - In-memory overlap guard: if a previous run is still in progress,
 *     the next scheduled tick is logged and skipped
 *   - All evaluation and notification errors are caught and logged; the server never crashes
 *   - Sync status is written at run-start and run-end (JOB_TYPE.ALERT_EVALUATION)
 */
const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const syncStatusRepository = require('../repositories/syncStatus.repository');
const alertEvaluationService = require('../services/alertEvaluation.service');
const { JOB_TYPE, JOB_STATUS } = require('../constants/enums');

let isRunning = false;

async function runEvaluation() {
  if (!env.alertEvaluation.enabled) {
    logger.info('[alert-evaluation] Skipped — ALERT_EVALUATION_ENABLED is false');
    return {
      status: 'SKIPPED',
      reason: 'disabled',
      evaluated: 0,
      triggered: 0,
    };
  }

  if (isRunning) {
    logger.warn('[alert-evaluation] Previous run still in progress — skipping this tick');
    return {
      status: 'SKIPPED',
      reason: 'overlap',
      evaluated: 0,
      triggered: 0,
    };
  }

  isRunning = true;
  const startedAt = new Date();
  logger.info(`[alert-evaluation] Run started at ${startedAt.toISOString()}`);

  try {
    await syncStatusRepository.upsert(JOB_TYPE.ALERT_EVALUATION, {
      lastRunAt: startedAt,
      lastSuccessAt: null,
      lastStatus: null,
    });
  } catch (syncErr) {
    logger.warn('[alert-evaluation] Could not write run-start to sync_statuses:', syncErr.message);
  }

  let result = { evaluatedCount: 0, triggeredCount: 0, events: [] };
  let jobStatus = JOB_STATUS.SUCCESS;

  try {
    result = await alertEvaluationService.evaluateAllActive();
    logger.info(`[alert-evaluation] Evaluated ${result.evaluatedCount} rule(s); triggered ${result.triggeredCount} event(s)`);
  } catch (err) {
    jobStatus = JOB_STATUS.FAILED;
    logger.error('[alert-evaluation] Evaluation error:', err.message);
  } finally {
    const finishedAt = new Date();
    try {
      await syncStatusRepository.upsert(JOB_TYPE.ALERT_EVALUATION, {
        lastRunAt: startedAt,
        lastSuccessAt: jobStatus === JOB_STATUS.SUCCESS ? finishedAt : null,
        lastStatus: jobStatus,
      });
    } catch (syncErr) {
      logger.warn('[alert-evaluation] Could not write run-end to sync_statuses:', syncErr.message);
    }
    isRunning = false;
  }

  return {
    status: jobStatus,
    evaluated: result.evaluatedCount,
    triggered: result.triggeredCount,
    events: result.events,
  };
}

function start() {
  const cronExpression = env.cron.alertEvaluation;

  if (!env.alertEvaluation.enabled) {
    logger.info(
      `[alert-evaluation] Job registered (schedule: ${cronExpression} UTC) but will skip every tick — set ALERT_EVALUATION_ENABLED=true to activate`
    );
  } else {
    logger.info(`[alert-evaluation] Job started — schedule: ${cronExpression} UTC`);
  }

  const task = cron.schedule(cronExpression, runEvaluation, {
    scheduled: true,
    timezone: 'UTC',
  });

  return task;
}

module.exports = {
  start,
  runEvaluation,
};

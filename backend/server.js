/**
 * Entry point (Document 6 §2): validate config, connect to the database,
 * then start listening.
 *
 * Phase A addition: price ingestion cron job started after app.listen()
 * and stopped in the graceful shutdown handler. The job is a no-op when
 * PRICE_INGESTION_ENABLED=false (safe default), so existing deployments
 * without provider credentials are unaffected.
 */
const validateEnv = require('./src/config/validateEnv');
validateEnv(); // Production Hardening Phase A, D1 — must run before anything
// else is required, so a missing secret is caught before app.js, routes,
// or any service transitively loads jwt.config.js with a bad value.

const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/utils/logger');
const { pool, testConnection } = require('./src/database/connection');
const priceIngestionJob = require('./src/jobs/priceIngestion.job');

// Production Hardening Phase B, finding H4: graceful shutdown. Captures
// the http.Server instance returned by app.listen() so it can be closed
// deliberately (stop accepting new connections, let in-flight ones finish)
// before the MySQL pool is closed and the process exits. A safety timeout
// forces exit if something hangs, rather than leaving the process running
// forever on a stuck shutdown.
const SHUTDOWN_TIMEOUT_MS = 10000;
let server;
let priceJob; // node-cron ScheduledTask — stopped during shutdown

function shutdown(signal) {
  logger.info(`[server] Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(async () => {
    logger.error('[server] Graceful shutdown timed out — forcing exit.');
    await logger.flush();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref(); // don't let this timer itself keep the process alive

  // Stop the cron job first — prevents a new ingestion tick from starting
  // during the shutdown window. Any in-progress ingestion run will finish
  // naturally before the pool closes (both are async and the shutdown
  // timeout provides the safety net).
  if (priceJob) {
    priceJob.stop();
    logger.info('[server] Price ingestion job stopped.');
  }

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(async (err) => {
    if (err) {
      logger.error('[server] Error while closing HTTP server:', err.message);
    } else {
      logger.info('[server] HTTP server closed — no longer accepting new connections.');
    }

    try {
      await pool.end();
      logger.info('[server] Database pool closed.');
    } catch (poolErr) {
      logger.error('[server] Error while closing database pool:', poolErr.message);
    }

    clearTimeout(forceExitTimer);
    await logger.flush();
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  await testConnection(); // logs connectivity; does not block startup (Phase 1 skeleton)

  server = app.listen(env.port, () => {
    logger.info(`[server] Business Market Monitor API running on port ${env.port} (${env.nodeEnv})`);
    logger.info(`[server] Health check: http://localhost:${env.port}/api/v1/health`);

    // Start the price ingestion cron job after the server is confirmed
    // listening. This ensures the DB pool is connected and the app is
    // fully initialised before the first job tick runs.
    priceJob = priceIngestionJob.start();
  });
}

start();


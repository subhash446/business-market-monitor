/**
 * System Health module (Document 5 §4.11). Not FR-mapped — supports
 * NFR-REL-01/02 and Render deployment monitoring (Document 3 §15).
 *
 * Production Hardening Phase B, finding B1: now returns the full
 * documented shape — database connectivity and a scheduler block sourced
 * from sync_statuses (Document 4 §5.7), via syncStatus.repository.js.
 *
 * Imports `pool` directly for the connectivity check — an intentional,
 * narrow exception to the Controller→Service→Repository pattern:
 * Document 5 §4.11 itself describes this as "a lightweight SELECT 1–style
 * check, not a business query," and Document 3's component table lists no
 * dedicated service for this module beyond syncStatus.repository.js
 * (the same precedent set for the scheduler block).
 */
const { pool } = require('../database/connection');
const syncStatusRepository = require('../repositories/syncStatus.repository');

function toSchedulerEntry(row) {
  if (!row) {
    // Document 5 §4.11: "If a job has never run yet, its lastRunAt/
    // lastSuccessAt/lastStatus are returned as null rather than omitted."
    return { lastRunAt: null, lastSuccessAt: null, lastStatus: null };
  }
  return {
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastStatus: row.last_status,
  };
}

// GET /api/v1/health
async function getHealth(req, res) {
  try {
    await pool.query('SELECT 1');

    const syncRows = await syncStatusRepository.findAll();
    const priceRow = syncRows.find((r) => r.job_type === 'PRICE_INGESTION');
    const newsRow = syncRows.find((r) => r.job_type === 'NEWS_INGESTION');

    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
        scheduler: {
          priceIngestion: toSchedulerEntry(priceRow),
          newsIngestion: toSchedulerEntry(newsRow),
        },
      },
    });
  } catch (err) {
    // Document 5 §4.11: the error body for this endpoint specifically
    // includes a top-level "database": "unreachable" field alongside the
    // standard error envelope — not the generic error-handler shape, since
    // that shape is documented as an intentional exception for this one
    // operational-diagnostics endpoint.
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Health check failed' },
      database: 'unreachable',
    });
  }
}

module.exports = { getHealth };

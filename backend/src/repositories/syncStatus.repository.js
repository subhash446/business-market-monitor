/**
 * All queries against `sync_statuses` (Document 4 §5.7).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Global table, not business-scoped — ingestion runs platform-wide on a
 * schedule (Document 4 §5.7), so there is no business_id to filter by here.
 *
 * Phase A addition: upsert() — writes the result of each scheduled
 * ingestion run so the health endpoint and dashboard can display it.
 */
const { pool } = require('../database/connection');

async function findAll() {
  const [rows] = await pool.execute('SELECT job_type, last_run_at, last_success_at, last_status FROM sync_statuses');
  return rows;
}

// Added in Phase A (Automatic Price Ingestion) — purely additive.
//
// Uses INSERT ... ON DUPLICATE KEY UPDATE, relying on the table's unique
// key on job_type (migration 017). This is the standard upsert pattern
// for MySQL and avoids a separate SELECT + UPDATE round-trip.
//
// Only fields explicitly provided in the update object are written.
// lastSuccessAt is null when the job failed — callers pass it only on
// success and omit it (or pass null) on failure.
async function upsert(jobType, { lastRunAt, lastSuccessAt, lastStatus }) {
  await pool.execute(
    `INSERT INTO sync_statuses (job_type, last_run_at, last_success_at, last_status)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       last_run_at    = VALUES(last_run_at),
       last_success_at = COALESCE(VALUES(last_success_at), last_success_at),
       last_status    = VALUES(last_status)`,
    [jobType, lastRunAt, lastSuccessAt || null, lastStatus]
  );
}

module.exports = { findAll, upsert };


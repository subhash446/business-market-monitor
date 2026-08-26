/**
 * All queries against `sync_statuses` (Document 4 §5.7).
 * Parameterized queries only (Document 3 §13, NFR-SEC-04).
 *
 * Global table, not business-scoped — ingestion runs platform-wide on a
 * schedule (Document 4 §5.7), so there is no business_id to filter by here.
 * Read-only, by design: no writer exists yet — PriceIngestionService/
 * NewsIngestionService (the only things that would ever populate this
 * table) are explicitly out of scope through Phase 10.
 */
const { pool } = require('../database/connection');

async function findAll() {
  const [rows] = await pool.execute('SELECT job_type, last_run_at, last_success_at, last_status FROM sync_statuses');
  return rows;
}

module.exports = { findAll };

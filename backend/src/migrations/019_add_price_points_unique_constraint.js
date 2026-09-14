/**
 * Phase A (Automatic Price Ingestion): add a unique constraint on
 * price_points(tracked_material_id, recorded_at, source) to prevent
 * duplicate price rows when the scheduled ingestion job runs and the
 * provider hasn't published new data yet.
 *
 * Design decisions:
 * - Includes `source` in the key: MANUAL and THIRD_PARTY_API entries for
 *   the same material on the same date are distinct valid records (a user
 *   may record a manual price for the same day an auto-ingestion fires).
 * - recorded_at is DATETIME; all automatic ingestion stores dates at
 *   midnight (YYYY-MM-DD 00:00:00), consistent with the existing manual
 *   entry convention.
 *
 * Pre-condition: existing dev data may contain duplicate price entries for
 * the same (tracked_material_id, recorded_at, source) tuple — entered
 * multiple times during development/testing. Before adding the unique
 * constraint, this migration deduplicates by keeping only the row with the
 * lowest id (the first entry) for each duplicate group. The deleted rows
 * are dev-only test entries with no downstream alert or reporting significance.
 *
 * Idempotency: checks information_schema before altering. Safe to re-run.
 */

async function up(pool) {
  // Step 1: Deduplicate existing rows — keep lowest id per (tm_id, recorded_at, source)
  // Uses a self-join pattern compatible with MySQL 8.0 without CTEs in DELETE.
  const [dupes] = await pool.query(`
    SELECT COUNT(*) AS cnt
    FROM price_points p1
    JOIN price_points p2
      ON  p1.tracked_material_id = p2.tracked_material_id
      AND p1.recorded_at         = p2.recorded_at
      AND p1.source              = p2.source
      AND p1.id                  > p2.id
  `);

  if (dupes[0].cnt > 0) {
    console.log(`[migrate] Deduplicating ${dupes[0].cnt} duplicate price_points row(s) (keeping lowest id per group)`);
    await pool.query(`
      DELETE p1 FROM price_points p1
      JOIN price_points p2
        ON  p1.tracked_material_id = p2.tracked_material_id
        AND p1.recorded_at         = p2.recorded_at
        AND p1.source              = p2.source
        AND p1.id                  > p2.id
    `);
    console.log('[migrate] Deduplication complete');
  }

  // Step 2: Add unique constraint (idempotent — skip if already exists)
  const [rows] = await pool.query(`
    SELECT COUNT(*) AS cnt
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'price_points'
      AND INDEX_NAME   = 'uq_price_points_material_date_source'
  `);

  if (rows[0].cnt > 0) {
    console.log('[migrate] uq_price_points_material_date_source already exists — skipping ADD UNIQUE KEY');
    return;
  }

  await pool.query(`
    ALTER TABLE price_points
      ADD UNIQUE KEY uq_price_points_material_date_source
        (tracked_material_id, recorded_at, source)
  `);
}

const down = `
ALTER TABLE price_points
  DROP INDEX IF EXISTS uq_price_points_material_date_source;
`;

module.exports = { up, down };

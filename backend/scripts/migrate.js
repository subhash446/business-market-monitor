/**
 * Migration runner (Production Hardening Phase A, finding H1).
 *
 * Executes every file in src/migrations/ in filename order (001, 002, ...),
 * which is also FK-dependency order (Document 4 §5 — file numbering was
 * chosen specifically to reflect this). Each migration's `up` SQL already
 * uses `CREATE TABLE IF NOT EXISTS`, so re-running this script is safe.
 *
 * Stops immediately on the first real failure — does not attempt later
 * migrations once one fails, since later tables may have FK dependencies
 * on the one that just failed.
 *
 * A migration file with no `up` exported (still a Phase 1 placeholder —
 * e.g. 002_create_user_tokens_table.js, Password Reset's table, explicitly
 * out of scope for this hardening phase) is logged and skipped, not treated
 * as a failure — it is a known, intentional gap, not a broken migration.
 *
 * This script only needs database configuration, not the full application
 * (no JWT secrets required to run it) — it does not use config/validateEnv.js,
 * which is specifically for the HTTP server's boot sequence (see server.js).
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/database/connection');

const MIGRATIONS_DIR = path.join(__dirname, '../src/migrations');

async function run() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.js'))
    .sort(); // filenames are zero-padded (001, 002, ...) — plain string sort is correct order

  console.log(`[migrate] Found ${files.length} migration file(s) in ${MIGRATIONS_DIR}`);

  let applied = 0;
  let skipped = 0;

  for (const file of files) {
    const migration = require(path.join(MIGRATIONS_DIR, file));

    if (!migration.up) {
      console.log(`[migrate] SKIP  ${file} — no DDL defined yet (placeholder)`);
      skipped += 1;
      continue;
    }

    try {
      console.log(`[migrate] RUN   ${file}`);
      if (typeof migration.up === 'function') {
        // Phase A+: async function migrations receive the pool directly
        // and are responsible for their own idempotency / multi-statement logic.
        await migration.up(pool);
      } else {
        await pool.query(migration.up);
      }
      console.log(`[migrate] OK    ${file}`);
      applied += 1;
    } catch (err) {
      console.error(`[migrate] FAIL  ${file}`);
      console.error(`[migrate] ${err.message}`);
      console.error('[migrate] Stopping — later migrations may depend on this one.');
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`[migrate] Done. ${applied} applied, ${skipped} skipped (placeholders).`);
  await pool.end();
  process.exit(0);
}

run().catch((err) => {
  console.error('[migrate] Unexpected error:', err);
  process.exit(1);
});

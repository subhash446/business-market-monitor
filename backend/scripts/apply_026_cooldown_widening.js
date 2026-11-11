/**
 * Dedicated Targeted Migration Runner — Migration 026 Only.
 *
 * Applies ONLY `026_widen_alert_rule_cooldown_hours.js` (`alert_rules.cooldown_hours`
 * from TINYINT UNSIGNED to SMALLINT UNSIGNED NOT NULL DEFAULT 24) without replaying
 * migrations 001–025.
 *
 * Why isolated execution is required on existing production databases:
 *   `scripts/migrate.js` has no migration history table and replays 001–026,
 *   including migration 020 which temporarily drops `'ALERT_EVALUATION'` from
 *   `sync_statuses.job_type` ENUM before 023 restores it. Running `026` alone
 *   eliminates that replay hazard while preserving `scripts/migrate.js` untouched
 *   for fresh environment bootstraps.
 *
 * Usage (run with working directory set to `backend/`):
 *   node scripts/apply_026_cooldown_widening.js
 *
 * Safety invariants:
 *   - Strict allowlist: permits ONLY `026_widen_alert_rule_cooldown_hours.js`.
 *   - Fails fast on missing/blank DB config or non-production TLS settings.
 *   - Never logs passwords, TLS certificates, or connection strings.
 *   - Verifies connected DB identity, `alert_rules` table, and pre/post column schema.
 *   - Pins session `lock_wait_timeout = 30` and invokes only `026`'s `up(pool)`.
 *   - Releases session connection and closes `pool` in `finally` on every exit path.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGET_MIGRATION_FILE = '026_widen_alert_rule_cooldown_hours.js';
const MIGRATIONS_DIR = path.resolve(__dirname, '../src/migrations');
const LOCK_WAIT_TIMEOUT_SECONDS = 30;

const ALLOWED_MIGRATIONS = Object.freeze({
  [TARGET_MIGRATION_FILE]: Object.freeze({
    filename: TARGET_MIGRATION_FILE,
    modulePath: path.join(MIGRATIONS_DIR, TARGET_MIGRATION_FILE),
  }),
});

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Parse CLI target argument. Defaults cleanly to TARGET_MIGRATION_FILE when omitted.
 * Rejects unknown flags and multiple arguments.
 */
function parseTargetArg(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return TARGET_MIGRATION_FILE;
  }

  if (argv.length === 1) {
    const arg = argv[0];
    if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length);
      if (isBlank(value)) {
        throw new Error('Invalid --target value: migration filename cannot be empty.');
      }
      return value;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unsupported option "${arg}". Only --target=<filename> or a single target filename is allowed.`);
    }
    return arg;
  }

  if (argv.length === 2 && argv[0] === '--target') {
    if (isBlank(argv[1])) {
      throw new Error('Invalid --target value: migration filename cannot be empty.');
    }
    return argv[1];
  }

  throw new Error('Unexpected CLI arguments. Run with no arguments or --target=026_widen_alert_rule_cooldown_hours.js.');
}

/**
 * Resolve requested migration strictly through an exact filename allowlist.
 * Rejects arbitrary filenames, path separators, traversal sequences, and unexpected modules.
 */
function resolveTargetMigration(requestedTarget = TARGET_MIGRATION_FILE) {
  if (typeof requestedTarget !== 'string' || isBlank(requestedTarget)) {
    throw new Error('Migration target must be a non-empty filename.');
  }

  const trimmed = requestedTarget.trim();
  if (trimmed !== requestedTarget) {
    throw new Error(`Invalid migration target "${requestedTarget}": leading/trailing whitespace is not allowed.`);
  }

  if (
    trimmed.includes('\0') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('..') ||
    path.basename(trimmed) !== trimmed
  ) {
    throw new Error(`Rejected unsafe migration target "${requestedTarget}": path traversal or directories are forbidden.`);
  }

  if (!Object.prototype.hasOwnProperty.call(ALLOWED_MIGRATIONS, trimmed)) {
    throw new Error(
      `Migration target "${trimmed}" is not allowlisted. Only "${TARGET_MIGRATION_FILE}" may be executed by this runner.`
    );
  }

  const entry = ALLOWED_MIGRATIONS[trimmed];
  const resolvedPath = path.resolve(entry.modulePath);
  if (path.dirname(resolvedPath) !== MIGRATIONS_DIR) {
    throw new Error(`Resolved migration path for "${trimmed}" escaped migrations directory.`);
  }

  return entry;
}

/**
 * Validate required DB config and strict production TLS settings prior to pool creation.
 * Checks both raw environment variables (to catch silent defaults in env.js) and resolved env.db.
 */
function validateRunnerConfig({ envConfig, rawEnv = process.env, fsModule = fs } = {}) {
  const missingOrInvalid = [];
  const db = envConfig && envConfig.db ? envConfig.db : {};

  if (isBlank(rawEnv.DB_HOST) || isBlank(db.host)) {
    missingOrInvalid.push('DB_HOST');
  }

  if (isBlank(rawEnv.DB_NAME) || isBlank(db.name)) {
    missingOrInvalid.push('DB_NAME');
  }

  if (isBlank(rawEnv.DB_USER) || isBlank(db.user)) {
    missingOrInvalid.push('DB_USER');
  }

  if (isBlank(rawEnv.DB_PASSWORD) || isBlank(db.password)) {
    missingOrInvalid.push('DB_PASSWORD');
  }

  if (rawEnv.DB_PORT !== undefined) {
    const rawPort = String(rawEnv.DB_PORT).trim();
    const parsedPort = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || parsedPort < 1 || parsedPort > 65535) {
      missingOrInvalid.push('DB_PORT (must be an integer between 1 and 65535)');
    }
  } else if (!Number.isInteger(db.port) || db.port < 1 || db.port > 65535) {
    missingOrInvalid.push('DB_PORT (invalid resolved port)');
  }

  const sslEnabledRaw = String(rawEnv.DB_SSL_ENABLED || '').trim().toLowerCase();
  if (sslEnabledRaw !== 'true' || db.sslEnabled !== true) {
    missingOrInvalid.push('DB_SSL_ENABLED=true');
  }

  const rejectUnauthRaw = String(rawEnv.DB_SSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase();
  if (rejectUnauthRaw !== 'true' || db.sslRejectUnauthorized !== true) {
    missingOrInvalid.push('DB_SSL_REJECT_UNAUTHORIZED=true');
  }

  if (isBlank(rawEnv.DB_SSL_CA_PATH) || isBlank(db.sslCaPath)) {
    missingOrInvalid.push('DB_SSL_CA_PATH');
  }

  if (missingOrInvalid.length > 0) {
    throw new Error(
      `Refusing to run targeted migration — missing or invalid production DB/TLS configuration: ${missingOrInvalid.join(', ')}`
    );
  }

  const resolvedCaPath = path.resolve(String(db.sslCaPath).trim());
  try {
    if (typeof fsModule.accessSync === 'function' && fsModule.constants && fsModule.constants.R_OK !== undefined) {
      fsModule.accessSync(resolvedCaPath, fsModule.constants.R_OK);
    }
    const stat = fsModule.statSync(resolvedCaPath);
    if (!stat || (typeof stat.isFile === 'function' && !stat.isFile()) || stat.size <= 0) {
      throw new Error('CA certificate path must point to a non-empty readable file.');
    }
    const caContents = fsModule.readFileSync(resolvedCaPath, 'utf8');
    if (isBlank(caContents)) {
      throw new Error('CA certificate file is empty.');
    }
  } catch (err) {
    const reason = err && (err.code || err.message) ? `${err.code ? `${err.code}: ` : ''}${err.message}` : 'unreadable';
    throw new Error(`DB_SSL_CA_PATH is not readable at "${resolvedCaPath}" (${reason})`);
  }

  return {
    host: String(db.host).trim(),
    port: db.port,
    database: String(db.name).trim(),
    user: String(db.user).trim(),
    caFilename: path.basename(resolvedCaPath),
  };
}

async function queryCooldownColumn(session) {
  const [rows] = await session.query(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'alert_rules'
       AND COLUMN_NAME = 'cooldown_hours'`
  );
  return rows && rows[0] ? rows[0] : null;
}

function validatePreMigrationSchema(column) {
  if (!column) {
    throw new Error(
      'Pre-check failed: column "alert_rules.cooldown_hours" does not exist. Ensure migration 023 has been applied before running 026.'
    );
  }

  const dataType = String(column.DATA_TYPE || '').toLowerCase();
  const columnType = String(column.COLUMN_TYPE || '').toLowerCase();
  const isNullable = String(column.IS_NULLABLE || '').toUpperCase();
  const columnDefault = column.COLUMN_DEFAULT !== null && column.COLUMN_DEFAULT !== undefined
    ? String(column.COLUMN_DEFAULT).trim()
    : null;

  if (dataType !== 'tinyint' && dataType !== 'smallint') {
    throw new Error(
      `Pre-check failed: unexpected DATA_TYPE "${column.DATA_TYPE}" for alert_rules.cooldown_hours (expected tinyint unsigned).`
    );
  }

  if (!columnType.includes('unsigned') || isNullable !== 'NO' || columnDefault !== '24') {
    throw new Error(
      `Pre-check failed: unexpected alert_rules.cooldown_hours definition (COLUMN_TYPE="${column.COLUMN_TYPE}", IS_NULLABLE="${column.IS_NULLABLE}", COLUMN_DEFAULT="${column.COLUMN_DEFAULT}").`
    );
  }

  return { dataType, alreadyWidened: dataType === 'smallint' };
}

function validatePostMigrationSchema(column) {
  if (!column) {
    throw new Error('Post-verification failed: column "alert_rules.cooldown_hours" was not found after migration.');
  }

  const dataType = String(column.DATA_TYPE || '').toLowerCase();
  const columnType = String(column.COLUMN_TYPE || '').toLowerCase();
  const isNullable = String(column.IS_NULLABLE || '').toUpperCase();
  const columnDefault = column.COLUMN_DEFAULT !== null && column.COLUMN_DEFAULT !== undefined
    ? String(column.COLUMN_DEFAULT).trim()
    : null;

  const failures = [];
  if (dataType !== 'smallint') {
    failures.push(`DATA_TYPE expected "smallint", got "${column.DATA_TYPE}"`);
  }
  if (!columnType.includes('unsigned')) {
    failures.push(`COLUMN_TYPE expected to contain "unsigned", got "${column.COLUMN_TYPE}"`);
  }
  if (isNullable !== 'NO') {
    failures.push(`IS_NULLABLE expected "NO", got "${column.IS_NULLABLE}"`);
  }
  if (columnDefault !== '24') {
    failures.push(`COLUMN_DEFAULT expected "24", got "${column.COLUMN_DEFAULT}"`);
  }

  if (failures.length > 0) {
    throw new Error(`Post-verification failed for alert_rules.cooldown_hours: ${failures.join('; ')}`);
  }

  return {
    dataType,
    columnType: column.COLUMN_TYPE,
    isNullable,
    columnDefault,
  };
}

/**
 * Execute targeted migration 026 against a verified MySQL pool.
 * Supports dependency injection cleanly for offline mocked unit tests.
 */
async function runTargetedMigration({
  target = TARGET_MIGRATION_FILE,
  envConfig,
  rawEnv = process.env,
  fsModule = fs,
  pool,
  migrationModule,
  logger = console,
} = {}) {
  const migrationEntry = resolveTargetMigration(target);
  const loadedEnv = envConfig || require('../src/config/env');
  const validatedTargetInfo = validateRunnerConfig({
    envConfig: loadedEnv,
    rawEnv,
    fsModule,
  });

  logger.log(
    `[migrate-026] Configuration validated — migration=${migrationEntry.filename} host=${validatedTargetInfo.host} port=${validatedTargetInfo.port} database=${validatedTargetInfo.database} user=${validatedTargetInfo.user} ssl=enabled rejectUnauthorized=true caFile=${validatedTargetInfo.caFilename}`
  );

  const migration = migrationModule || require(migrationEntry.modulePath);
  if (!migration || typeof migration.up !== 'function') {
    throw new Error(`Target migration "${migrationEntry.filename}" does not export an up(pool) function.`);
  }

  const activePool = pool || require('../src/database/connection').pool;
  let conn = null;
  let primaryError = null;

  try {
    const session = typeof activePool.getConnection === 'function'
      ? (conn = await activePool.getConnection())
      : activePool;

    // 1. Verify connected database identity
    const [identityRows] = await session.query('SELECT DATABASE() AS db, @@version AS version');
    const identity = identityRows && identityRows[0];
    if (!identity || !identity.db) {
      throw new Error('Database identity verification failed: SELECT DATABASE() returned no active database.');
    }
    if (identity.db !== validatedTargetInfo.database) {
      throw new Error(
        `Database identity mismatch: connected to "${identity.db}" but configured DB_NAME is "${validatedTargetInfo.database}".`
      );
    }
    logger.log(`[migrate-026] Connected to database="${identity.db}" version="${identity.version || 'unknown'}"`);

    // 2. Confirm `alert_rules` table exists
    const [tableRows] = await session.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'alert_rules'`
    );
    if (!tableRows || tableRows.length === 0) {
      throw new Error(`Pre-check failed: table "alert_rules" does not exist in database "${identity.db}".`);
    }

    // 3. Confirm `cooldown_hours` column exists and has expected pre-migration definition
    const preCol = await queryCooldownColumn(session);
    const preState = validatePreMigrationSchema(preCol);
    logger.log(
      `[migrate-026] Pre-check passed — alert_rules.cooldown_hours type=${preCol.COLUMN_TYPE} nullable=${preCol.IS_NULLABLE} default=${preCol.COLUMN_DEFAULT}${preState.alreadyWidened ? ' (already widened)' : ''}`
    );

    // 4. Set bounded session lock_wait_timeout (30 seconds) before DDL
    await session.query(`SET SESSION lock_wait_timeout = ${LOCK_WAIT_TIMEOUT_SECONDS}`);
    logger.log(`[migrate-026] Set SESSION lock_wait_timeout = ${LOCK_WAIT_TIMEOUT_SECONDS}s`);

    // 5. Invoke only 026_widen_alert_rule_cooldown_hours.js up()
    await migration.up(session);

    // 6. Post-verify widened schema state
    const postCol = await queryCooldownColumn(session);
    const verified = validatePostMigrationSchema(postCol);
    logger.log(
      `[migrate-026] Post-verification passed — DATA_TYPE=${verified.dataType} COLUMN_TYPE=${verified.columnType} IS_NULLABLE=${verified.isNullable} COLUMN_DEFAULT=${verified.columnDefault}`
    );

    return {
      migration: migrationEntry.filename,
      database: identity.db,
      mysqlVersion: identity.version || null,
      verified,
    };
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    if (conn && typeof conn.release === 'function') {
      try {
        conn.release();
      } catch (releaseErr) {
        logger.error(
          `[migrate-026] Warning: failed to release database connection: ${releaseErr && releaseErr.message ? releaseErr.message : String(releaseErr)}`
        );
      }
    }

    if (activePool && typeof activePool.end === 'function') {
      try {
        await activePool.end();
        logger.log('[migrate-026] Database pool closed.');
      } catch (endErr) {
        logger.error(
          `[migrate-026] Error closing database pool: ${endErr && endErr.message ? endErr.message : String(endErr)}`
        );
        if (!primaryError) {
          throw endErr;
        }
      }
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  try {
    const target = parseTargetArg(argv);
    await runTargetedMigration({ target });
    process.exitCode = 0;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`[migrate-026] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  TARGET_MIGRATION_FILE,
  ALLOWED_MIGRATIONS,
  LOCK_WAIT_TIMEOUT_SECONDS,
  parseTargetArg,
  resolveTargetMigration,
  validateRunnerConfig,
  validatePreMigrationSchema,
  validatePostMigrationSchema,
  runTargetedMigration,
  main,
};

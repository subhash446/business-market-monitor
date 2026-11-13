/**
 * Targeted Migration Runner with Schema Migration Ledger (T-03).
 *
 * Safely applies a single exact migration (or verifies/baselines an existing
 * database's `schema_migrations` ledger without replaying historical DDL).
 *
 * Usage (run from `backend/`):
 *   node scripts/run_migration.js --target=027_reconcile_commodity_symbols_metadata.js
 *   node scripts/run_migration.js --target=027
 *   node scripts/run_migration.js --baseline-up-to=026_widen_alert_rule_cooldown_hours.js
 *   node scripts/run_migration.js --status
 *   node scripts/run_migration.js --target=<id> --retry-failed   (explicit opt-in after DB inspection)
 *
 * Safety invariants:
 * - Requires an explicit exact migration identifier; rejects unknown, ambiguous, or path-traversal inputs.
 * - Tracks execution in `schema_migrations` (`RUNNING` / `APPLIED` / `FAILED`) with SHA-256 checksums.
 * - Refuses duplicate execution of `APPLIED` migrations.
 * - Refuses automatic retries of `FAILED` or `RUNNING` migrations because MySQL DDL implicitly commits.
 * - Validates DB identity (`SELECT DATABASE()`), sets `SESSION lock_wait_timeout = 30`, and cleans up connections in `finally`.
 * - Never logs DB passwords, CA cert contents, or connection strings.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ledger = require('../src/database/migrationLedger');

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function readNextFlagValue(argv, index, flagName) {
  const next = argv[index + 1];
  if (next === undefined || isBlank(next) || String(next).startsWith('-')) {
    throw new Error(`Flag ${flagName} requires a non-empty value.`);
  }
  return next;
}

/**
 * Parse and validate CLI arguments strictly.
 * Rejects unknown options, duplicate mode flags, and missing targets.
 */
function parseCliArgs(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error(
      'Missing operation. Specify --target=<migration>, --baseline-up-to=<migration>, or --status.'
    );
  }

  let mode = null;
  let target = null;
  let baselineUpTo = null;
  let retryFailed = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);

    if (arg === '--status') {
      if (mode && mode !== 'status') {
        throw new Error('Cannot combine --status with --target or --baseline-up-to.');
      }
      mode = 'status';
      continue;
    }

    if (arg === '--retry-failed') {
      retryFailed = true;
      continue;
    }

    if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length);
      if (isBlank(value)) {
        throw new Error('Invalid --target value: migration identifier cannot be empty.');
      }
      if (target !== null || mode === 'baseline' || mode === 'status') {
        throw new Error('Conflicting CLI arguments: specify a single --target, --baseline-up-to, or --status.');
      }
      mode = 'execute';
      target = value;
      continue;
    }

    if (arg === '--target') {
      const value = readNextFlagValue(argv, i, '--target');
      i += 1;
      if (target !== null || mode === 'baseline' || mode === 'status') {
        throw new Error('Conflicting CLI arguments: specify a single --target, --baseline-up-to, or --status.');
      }
      mode = 'execute';
      target = value;
      continue;
    }

    if (arg.startsWith('--baseline-up-to=')) {
      const value = arg.slice('--baseline-up-to='.length);
      if (isBlank(value)) {
        throw new Error('Invalid --baseline-up-to value: migration identifier cannot be empty.');
      }
      if (baselineUpTo !== null || mode === 'execute' || mode === 'status') {
        throw new Error('Conflicting CLI arguments: specify a single --target, --baseline-up-to, or --status.');
      }
      mode = 'baseline';
      baselineUpTo = value;
      continue;
    }

    if (arg === '--baseline-up-to') {
      const value = readNextFlagValue(argv, i, '--baseline-up-to');
      i += 1;
      if (baselineUpTo !== null || mode === 'execute' || mode === 'status') {
        throw new Error('Conflicting CLI arguments: specify a single --target, --baseline-up-to, or --status.');
      }
      mode = 'baseline';
      baselineUpTo = value;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(
        `Unsupported option "${arg}". Supported flags: --target=<id>, --baseline-up-to=<id>, --status, --retry-failed.`
      );
    }

    if (mode !== null || target !== null) {
      throw new Error(`Unexpected positional argument "${arg}". Pass a single migration identifier or flag.`);
    }
    mode = 'execute';
    target = arg;
  }

  if (!mode) {
    throw new Error('Missing operation. Specify --target=<migration>, --baseline-up-to=<migration>, or --status.');
  }

  if (retryFailed && mode !== 'execute') {
    throw new Error('--retry-failed may only be used together with --target=<migration>.');
  }

  return { mode, target, baselineUpTo, retryFailed };
}

/**
 * Validate database connectivity configuration and TLS CA readability (when SSL is enabled)
 * before pool creation or queries. Allows SSL disabled for local dev/disposable test MySQL.
 */
function validateRunnerConfig({ envConfig, rawEnv = process.env, fsModule = fs } = {}) {
  const db = envConfig && envConfig.db ? envConfig.db : {};
  const invalid = [];

  if ((rawEnv && rawEnv.DB_HOST !== undefined && isBlank(rawEnv.DB_HOST)) || isBlank(db.host)) {
    invalid.push('DB_HOST');
  }

  if ((rawEnv && rawEnv.DB_NAME !== undefined && isBlank(rawEnv.DB_NAME)) || isBlank(db.name)) {
    invalid.push('DB_NAME');
  }

  if ((rawEnv && rawEnv.DB_USER !== undefined && isBlank(rawEnv.DB_USER)) || isBlank(db.user)) {
    invalid.push('DB_USER');
  }

  if (rawEnv && rawEnv.DB_PORT !== undefined) {
    const rawPort = String(rawEnv.DB_PORT).trim();
    const parsed = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || parsed < 1 || parsed > 65535) {
      invalid.push('DB_PORT (must be 1..65535)');
    }
  } else if (!Number.isInteger(db.port) || db.port < 1 || db.port > 65535) {
    invalid.push('DB_PORT (invalid resolved port)');
  }

  if (db.sslEnabled && db.sslRejectUnauthorized !== false) {
    if (isBlank(db.sslCaPath)) {
      invalid.push('DB_SSL_CA_PATH (required when DB_SSL_ENABLED=true and DB_SSL_REJECT_UNAUTHORIZED=true)');
    }
  }

  if (invalid.length > 0) {
    throw new Error(`Refusing migration run — missing or invalid DB configuration: ${invalid.join(', ')}`);
  }

  let caFilename = null;
  if (db.sslEnabled && !isBlank(db.sslCaPath)) {
    const resolvedCaPath = path.resolve(String(db.sslCaPath).trim());
    try {
      if (typeof fsModule.accessSync === 'function' && fsModule.constants && fsModule.constants.R_OK !== undefined) {
        fsModule.accessSync(resolvedCaPath, fsModule.constants.R_OK);
      }
      const stat = fsModule.statSync(resolvedCaPath);
      if (!stat || (typeof stat.isFile === 'function' && !stat.isFile()) || stat.size <= 0) {
        throw new Error('CA certificate path must point to a non-empty readable file.');
      }
      const caContent = fsModule.readFileSync(resolvedCaPath, 'utf8');
      if (isBlank(caContent)) {
        throw new Error('CA certificate file is empty.');
      }
      caFilename = path.basename(resolvedCaPath);
    } catch (err) {
      const reason = err && (err.code || err.message) ? `${err.code ? `${err.code}: ` : ''}${err.message}` : 'unreadable';
      throw new Error(`DB_SSL_CA_PATH is not readable at "${resolvedCaPath}" (${reason})`);
    }
  }

  return {
    host: String(db.host).trim(),
    port: db.port,
    database: String(db.name).trim(),
    user: String(db.user).trim(),
    sslEnabled: Boolean(db.sslEnabled),
    caFilename,
  };
}

async function verifyConnectedDatabase(session, expectedDatabaseName, logger) {
  const [identityRows] = await session.query('SELECT DATABASE() AS db, @@version AS version');
  const identity = identityRows && identityRows[0];

  if (!identity || !identity.db) {
    throw new Error('Database identity check failed: SELECT DATABASE() returned no active database.');
  }

  if (identity.db !== expectedDatabaseName) {
    throw new Error(
      `Database identity mismatch: connected to "${identity.db}" but configured DB_NAME is "${expectedDatabaseName}".`
    );
  }

  logger.log(`[migrate-target] Connected to database="${identity.db}" version="${identity.version || 'unknown'}"`);
  return identity;
}

async function invokeMigrationUp(session, migration, migrationName) {
  if (typeof migration.up === 'function') {
    await migration.up(session);
    return;
  }

  if (typeof migration.up === 'string' && migration.up.trim() !== '') {
    await session.query(migration.up);
    return;
  }

  throw new Error(`Migration "${migrationName}" does not export a runnable up(pool) function or SQL string.`);
}

async function persistFailedState({ session, activePool, migrationName, checksum, executionMs, err, logger }) {
  try {
    await ledger.markFailed(session, {
      migrationName,
      checksum,
      executionMs,
      errorMessage: err,
    });
  } catch (sessionWriteErr) {
    if (activePool && activePool !== session && typeof activePool.query === 'function') {
      try {
        await ledger.markFailed(activePool, {
          migrationName,
          checksum,
          executionMs,
          errorMessage: err,
        });
        return;
      } catch (poolWriteErr) {
        logger.error(
          `[migrate-target] ERROR: Could not record FAILED ledger entry for "${migrationName}": ${poolWriteErr.message}`
        );
        return;
      }
    }
    logger.error(
      `[migrate-target] ERROR: Could not record FAILED ledger entry for "${migrationName}": ${sessionWriteErr.message}`
    );
  }
}

async function executeTargetedMigration({
  target,
  retryFailed = false,
  envConfig,
  rawEnv = process.env,
  fsModule = fs,
  pool,
  migrationsDir = ledger.DEFAULT_MIGRATIONS_DIR,
  migrationModule,
  requireModule = require,
  logger = console,
} = {}) {
  const resolved = ledger.resolveMigrationTarget(target, { migrationsDir, fsModule });
  const loadedEnv = envConfig || requireModule('../src/config/env');
  const validatedConfig = validateRunnerConfig({ envConfig: loadedEnv, rawEnv, fsModule });

  logger.log(
    `[migrate-target] Validated config — target=${resolved.filename} host=${validatedConfig.host} port=${validatedConfig.port} database=${validatedConfig.database} user=${validatedConfig.user} ssl=${validatedConfig.sslEnabled ? 'enabled' : 'disabled'}`
  );

  const migration = migrationModule || requireModule(resolved.modulePath);
  if (!migration || (!migration.up || (typeof migration.up !== 'function' && typeof migration.up !== 'string'))) {
    throw new Error(`Migration "${resolved.filename}" has no runnable "up" export.`);
  }

  const activePool = pool || requireModule('../src/database/connection').pool;
  let conn = null;
  let primaryError = null;

  try {
    const session = typeof activePool.getConnection === 'function'
      ? (conn = await activePool.getConnection())
      : activePool;

    const identity = await verifyConnectedDatabase(session, validatedConfig.database, logger);

    await session.query(`SET SESSION lock_wait_timeout = ${ledger.DEFAULT_LOCK_WAIT_TIMEOUT_SECONDS}`);
    logger.log(`[migrate-target] Set SESSION lock_wait_timeout = ${ledger.DEFAULT_LOCK_WAIT_TIMEOUT_SECONDS}s`);

    await ledger.ensureLedgerTable(session);

    const existing = await ledger.getLedgerEntry(session, resolved.filename);
    if (existing) {
      if (existing.status === ledger.STATUSES.APPLIED) {
        const checksumNote = existing.checksum !== resolved.checksum
          ? ' (WARNING: file checksum on disk differs from recorded checksum)'
          : '';
        throw new Error(
          `Refusing duplicate execution: migration "${resolved.filename}" is already recorded as APPLIED (applied_at=${existing.applied_at || 'recorded'})${checksumNote}.`
        );
      }

      if (existing.status === ledger.STATUSES.RUNNING) {
        throw new Error(
          `Refusing execution: migration "${resolved.filename}" has ledger status RUNNING (started_at=${existing.started_at || 'unknown'}). ` +
          'Partial schema changes or an active lock may exist; inspect the database manually before taking action.'
        );
      }

      if (existing.status === ledger.STATUSES.FAILED) {
        if (!retryFailed) {
          throw new Error(
            `Refusing automatic retry: migration "${resolved.filename}" previously FAILED` +
            `${existing.error_message ? ` (${existing.error_message})` : ''}. ` +
            'Because MySQL DDL can partially commit, inspect the database schema manually before retrying with --retry-failed.'
          );
        }
        logger.error(
          `[migrate-target] WARN: Retrying previously FAILED migration "${resolved.filename}" because --retry-failed was explicitly specified. Ensure partial DDL state was inspected first.`
        );
      }
    }

    await ledger.markRunning(session, {
      migrationName: resolved.filename,
      checksum: resolved.checksum,
    });

    const startedAtMs = Date.now();
    try {
      logger.log(`[migrate-target] RUN   ${resolved.filename}`);
      await invokeMigrationUp(session, migration, resolved.filename);
      const executionMs = Date.now() - startedAtMs;

      await ledger.markApplied(session, {
        migrationName: resolved.filename,
        checksum: resolved.checksum,
        executionMs,
      });

      logger.log(`[migrate-target] OK    ${resolved.filename} (${executionMs}ms) — recorded APPLIED in ${ledger.LEDGER_TABLE}`);

      return {
        mode: 'execute',
        migration: resolved.filename,
        checksum: resolved.checksum,
        database: identity.db,
        mysqlVersion: identity.version || null,
        status: ledger.STATUSES.APPLIED,
        executionMs,
      };
    } catch (migrationErr) {
      const executionMs = Date.now() - startedAtMs;
      logger.error(
        `[migrate-target] WARN  Migration "${resolved.filename}" failed after ${executionMs}ms. MySQL DDL causes implicit commits; partial schema changes may exist in database "${identity.db}". Automatic retry is disabled until inspected.`
      );
      await persistFailedState({
        session,
        activePool,
        migrationName: resolved.filename,
        checksum: resolved.checksum,
        executionMs,
        err: migrationErr,
        logger,
      });
      throw migrationErr;
    }
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    await releaseSessionAndPool({ conn, activePool, primaryError, logger });
  }
}

async function runBaseline({
  upTo,
  envConfig,
  rawEnv = process.env,
  fsModule = fs,
  pool,
  migrationsDir = ledger.DEFAULT_MIGRATIONS_DIR,
  requireModule = require,
  logger = console,
} = {}) {
  const resolved = ledger.resolveMigrationTarget(upTo, { migrationsDir, fsModule });
  const loadedEnv = envConfig || requireModule('../src/config/env');
  const validatedConfig = validateRunnerConfig({ envConfig: loadedEnv, rawEnv, fsModule });

  logger.log(
    `[migrate-target] Validated baseline config — upTo=${resolved.filename} host=${validatedConfig.host} port=${validatedConfig.port} database=${validatedConfig.database} user=${validatedConfig.user} ssl=${validatedConfig.sslEnabled ? 'enabled' : 'disabled'}`
  );

  const activePool = pool || requireModule('../src/database/connection').pool;
  let conn = null;
  let primaryError = null;

  try {
    const session = typeof activePool.getConnection === 'function'
      ? (conn = await activePool.getConnection())
      : activePool;

    const identity = await verifyConnectedDatabase(session, validatedConfig.database, logger);
    const summary = await ledger.baselineMigrations(session, {
      upTo: resolved.filename,
      migrationsDir,
      fsModule,
    });

    const checksumWarnings = summary.skippedAlreadyApplied.filter((item) => item.checksumChanged);
    for (const drifted of checksumWarnings) {
      logger.error(
        `[migrate-target] WARN  Already-APPLIED migration "${drifted.migrationName}" has a checksum mismatch against disk.`
      );
    }

    logger.log(
      `[migrate-target] Baseline verified & recorded up to ${summary.upTo} — ${summary.checksPerformed} schema checks passed, ${summary.recorded.length} newly recorded, ${summary.skippedAlreadyApplied.length} already APPLIED.`
    );

    return {
      mode: 'baseline',
      database: identity.db,
      mysqlVersion: identity.version || null,
      ...summary,
    };
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    await releaseSessionAndPool({ conn, activePool, primaryError, logger });
  }
}

async function runStatus({
  envConfig,
  rawEnv = process.env,
  fsModule = fs,
  pool,
  migrationsDir = ledger.DEFAULT_MIGRATIONS_DIR,
  requireModule = require,
  logger = console,
} = {}) {
  const loadedEnv = envConfig || requireModule('../src/config/env');
  const validatedConfig = validateRunnerConfig({ envConfig: loadedEnv, rawEnv, fsModule });
  const diskMigrations = ledger.discoverMigrationFiles(migrationsDir, fsModule);

  const activePool = pool || requireModule('../src/database/connection').pool;
  let conn = null;
  let primaryError = null;

  try {
    const session = typeof activePool.getConnection === 'function'
      ? (conn = await activePool.getConnection())
      : activePool;

    const identity = await verifyConnectedDatabase(session, validatedConfig.database, logger);

    const [tableRows] = await session.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?`,
      [ledger.LEDGER_TABLE]
    );

    const ledgerExists = Number(tableRows?.[0]?.cnt || 0) > 0;
    const entries = ledgerExists ? await ledger.listLedgerEntries(session) : [];
    const byName = new Map(entries.map((entry) => [entry.migration_name, entry]));

    const statusRows = diskMigrations.map((filename) => {
      const entry = byName.get(filename) || null;
      return {
        migrationName: filename,
        status: entry ? entry.status : 'PENDING',
        appliedAt: entry ? entry.applied_at : null,
        errorMessage: entry ? entry.error_message : null,
      };
    });

    if (!ledgerExists) {
      logger.log(`[migrate-target] Ledger table "${ledger.LEDGER_TABLE}" does not exist yet in "${identity.db}". All ${diskMigrations.length} disk migration(s) report PENDING.`);
    } else {
      for (const row of statusRows) {
        logger.log(`[migrate-target] ${row.status.padEnd(7)} ${row.migrationName}${row.appliedAt ? ` (applied_at=${row.appliedAt})` : ''}`);
      }
    }

    return {
      mode: 'status',
      database: identity.db,
      ledgerExists,
      migrations: statusRows,
    };
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    await releaseSessionAndPool({ conn, activePool, primaryError, logger });
  }
}

async function releaseSessionAndPool({ conn, activePool, primaryError, logger }) {
  if (conn && typeof conn.release === 'function') {
    try {
      conn.release();
    } catch (releaseErr) {
      logger.error(
        `[migrate-target] Warning: failed to release database connection: ${releaseErr && releaseErr.message ? releaseErr.message : String(releaseErr)}`
      );
    }
  }

  if (activePool && typeof activePool.end === 'function') {
    try {
      await activePool.end();
      logger.log('[migrate-target] Database pool closed.');
    } catch (endErr) {
      logger.error(
        `[migrate-target] Error closing database pool: ${endErr && endErr.message ? endErr.message : String(endErr)}`
      );
      if (!primaryError) {
        throw endErr;
      }
    }
  }
}

async function main(argv = process.argv.slice(2), deps = {}) {
  const logger = deps.logger || console;
  try {
    const parsed = parseCliArgs(argv);

    if (parsed.mode === 'status') {
      await runStatus({ ...deps, logger });
    } else if (parsed.mode === 'baseline') {
      await runBaseline({ upTo: parsed.baselineUpTo, ...deps, logger });
    } else {
      await executeTargetedMigration({
        target: parsed.target,
        retryFailed: parsed.retryFailed,
        ...deps,
        logger,
      });
    }

    process.exitCode = 0;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    logger.error(`[migrate-target] FAIL: ${message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCliArgs,
  validateRunnerConfig,
  verifyConnectedDatabase,
  executeTargetedMigration,
  runBaseline,
  runStatus,
  main,
};

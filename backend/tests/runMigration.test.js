/**
 * Regression & Safety Tests for backend/scripts/run_migration.js (T-03).
 *
 * Covers:
 * 1. CLI parsing, exact target resolution, and unknown/unsafe identifier rejection
 * 2. Local (SSL disabled) and TLS-enabled DB configuration validation + secret log hygiene
 * 3. Connected DB identity verification, lock_wait_timeout session pinning, & cleanup
 * 4. Compatibility with both string (`001`) and async function (`026`, `027`) migrations
 * 5. Duplicate APPLIED execution prevention & RUNNING conflict prevention
 * 6. Failure recording (`FAILED` status, partial-DDL warning, no automatic retry without --retry-failed)
 * 7. `--baseline-up-to` & read-only `--status` workflows via `main()`
 *
 * Uses mocked pool/connection objects; never connects to any real MySQL instance.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ledger = require('../src/database/migrationLedger');
const {
  parseCliArgs,
  validateRunnerConfig,
  executeTargetedMigration,
  runBaseline,
  runStatus,
  main,
} = require('../scripts/run_migration');

function buildLocalEnv(overrides = {}) {
  const rawEnv = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_NAME: 'bmm_migration_verify_test',
    DB_USER: 'test_user',
    DB_PASSWORD: '',
    DB_SSL_ENABLED: 'false',
    ...overrides,
  };

  return {
    rawEnv,
    envConfig: {
      db: {
        host: rawEnv.DB_HOST,
        port: Number(rawEnv.DB_PORT || 3306),
        name: rawEnv.DB_NAME,
        user: rawEnv.DB_USER,
        password: rawEnv.DB_PASSWORD,
        sslEnabled: String(rawEnv.DB_SSL_ENABLED || 'false').toLowerCase() === 'true',
        sslRejectUnauthorized: String(rawEnv.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() === 'true',
        sslCaPath: rawEnv.DB_SSL_CA_PATH || '',
      },
    },
  };
}

function buildMockLogger() {
  return {
    log: jest.fn(),
    error: jest.fn(),
  };
}

function createMockDb({
  dbName = 'bmm_migration_verify_test',
  version = '8.0.40',
  ledgerInitiallyExists = false,
  initialLedgerRows = [],
  onAppQuery = null,
} = {}) {
  let ledgerExists = ledgerInitiallyExists;
  const ledgerRows = new Map(initialLedgerRows.map((r) => [r.migration_name, { ...r }]));
  const executedSql = [];

  const mockConn = {
    query: jest.fn(async (sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      executedSql.push(normalized);

      if (normalized.startsWith('SELECT DATABASE()')) {
        return [[{ db: dbName, version }]];
      }
      if (normalized.startsWith('SET SESSION lock_wait_timeout')) {
        return [{}];
      }
      if (normalized.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) {
        ledgerExists = true;
        return [{}];
      }
      if (normalized.includes('FROM information_schema.TABLES') && params[0] === ledger.LEDGER_TABLE) {
        return [[{ cnt: ledgerExists ? 1 : 0 }]];
      }
      if (normalized.startsWith('SELECT id, migration_name') && normalized.includes('WHERE migration_name = ?')) {
        const hit = ledgerRows.get(params[0]);
        return [hit ? [{ ...hit }] : []];
      }
      if (normalized.startsWith('SELECT id, migration_name') && normalized.includes('ORDER BY migration_name ASC')) {
        return [Array.from(ledgerRows.values()).sort((a, b) => a.migration_name.localeCompare(b.migration_name))];
      }
      if (normalized.includes('INSERT INTO schema_migrations') && normalized.includes("'RUNNING'")) {
        const [migrationName, checksum] = params;
        ledgerRows.set(migrationName, {
          id: ledgerRows.size + 1,
          migration_name: migrationName,
          checksum,
          status: ledger.STATUSES.RUNNING,
          started_at: '2026-11-11 10:00:00',
          applied_at: null,
          execution_ms: null,
          error_message: null,
        });
        return [{}];
      }
      if (normalized.startsWith('UPDATE schema_migrations') && normalized.includes("status = 'APPLIED'")) {
        const [checksum, executionMs, migrationName] = params;
        const prev = ledgerRows.get(migrationName) || { migration_name: migrationName };
        ledgerRows.set(migrationName, {
          ...prev,
          checksum,
          status: ledger.STATUSES.APPLIED,
          applied_at: '2026-11-11 10:00:01',
          execution_ms: executionMs,
          error_message: null,
        });
        return [{}];
      }
      if (normalized.includes('INSERT INTO schema_migrations') && normalized.includes("'FAILED'")) {
        const [migrationName, checksum, executionMs, errorMessage] = params;
        ledgerRows.set(migrationName, {
          id: ledgerRows.size + 1,
          migration_name: migrationName,
          checksum,
          status: ledger.STATUSES.FAILED,
          started_at: '2026-11-11 10:00:00',
          applied_at: null,
          execution_ms: executionMs,
          error_message: errorMessage,
        });
        return [{}];
      }

      if (typeof onAppQuery === 'function') {
        return onAppQuery(normalized, params);
      }

      return [{}];
    }),
    release: jest.fn(),
  };

  const mockPool = {
    getConnection: jest.fn().mockResolvedValue(mockConn),
    query: mockConn.query,
    end: jest.fn().mockResolvedValue(undefined),
  };

  return { mockConn, mockPool, ledgerRows, executedSql, getLedgerExists: () => ledgerExists };
}

describe('Targeted Migration Runner (scripts/run_migration.js)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. CLI argument & config validation', () => {
    test('parses valid CLI operations and rejects invalid/conflicting arguments', () => {
      expect(parseCliArgs(['--target=027'])).toEqual({
        mode: 'execute',
        target: '027',
        baselineUpTo: null,
        retryFailed: false,
      });
      expect(parseCliArgs(['--target', '027_reconcile_commodity_symbols_metadata.js', '--retry-failed'])).toEqual({
        mode: 'execute',
        target: '027_reconcile_commodity_symbols_metadata.js',
        baselineUpTo: null,
        retryFailed: true,
      });
      expect(parseCliArgs(['026'])).toEqual({
        mode: 'execute',
        target: '026',
        baselineUpTo: null,
        retryFailed: false,
      });
      expect(parseCliArgs(['--baseline-up-to=026'])).toEqual({
        mode: 'baseline',
        target: null,
        baselineUpTo: '026',
        retryFailed: false,
      });
      expect(parseCliArgs(['--status'])).toEqual({
        mode: 'status',
        target: null,
        baselineUpTo: null,
        retryFailed: false,
      });

      const badArgCases = [
        [],
        ['--unknown'],
        ['--target='],
        ['--target'],
        ['--baseline-up-to='],
        ['--status', '--target=027'],
        ['--baseline-up-to=026', '--target=027'],
        ['--status', '--retry-failed'],
        ['--baseline-up-to=026', '--retry-failed'],
        ['026', '027'],
      ];
      for (const badArgs of badArgCases) {
        expect(() => parseCliArgs(badArgs)).toThrow();
      }
    });

    test('supports local passwordless config when SSL disabled, enforces CA when SSL enabled, and fails fast on blanks', () => {
      const { envConfig, rawEnv } = buildLocalEnv();
      const summary = validateRunnerConfig({ envConfig, rawEnv });
      expect(summary).toEqual({
        host: '127.0.0.1',
        port: 3306,
        database: 'bmm_migration_verify_test',
        user: 'test_user',
        sslEnabled: false,
        caFilename: null,
      });

      const tlsBadEnv = buildLocalEnv({
        DB_SSL_ENABLED: 'true',
        DB_SSL_REJECT_UNAUTHORIZED: 'true',
        DB_SSL_CA_PATH: '',
      });
      expect(() => validateRunnerConfig({ ...tlsBadEnv })).toThrow(/DB_SSL_CA_PATH/);

      const blankHostEnv = buildLocalEnv({ DB_HOST: '' });
      expect(() => validateRunnerConfig({ ...blankHostEnv })).toThrow(/DB_HOST/);

      const badPortEnv = buildLocalEnv({ DB_PORT: '99999' });
      expect(() => validateRunnerConfig({ ...badPortEnv })).toThrow(/DB_PORT/);
    });
  });

  describe('2. Targeted execution of 027, 026, and legacy string migrations', () => {
    test('applies migration 027 on pinned connection, records APPLIED in ledger, and prevents duplicate reruns', async () => {
      const { envConfig, rawEnv } = buildLocalEnv();
      const logger = buildMockLogger();
      const { mockConn, mockPool, ledgerRows, executedSql } = createMockDb({
        onAppQuery: (sql) => {
          if (sql.includes('FROM information_schema.TABLES')) {
            return [[{ cnt: 1 }]];
          }
          return [{}];
        },
      });

      const first = await executeTargetedMigration({
        target: '027',
        envConfig,
        rawEnv,
        pool: mockPool,
        logger,
      });

      expect(first).toMatchObject({
        mode: 'execute',
        migration: '027_reconcile_commodity_symbols_metadata.js',
        database: 'bmm_migration_verify_test',
        status: ledger.STATUSES.APPLIED,
      });
      expect(mockConn.query).toHaveBeenCalled();
      expect(executedSql).toContain('SET SESSION lock_wait_timeout = 30');
      expect(executedSql.some((q) => q.includes("WHERE symbol = 'WHEAT_GOI'"))).toBe(true);
      expect(executedSql.some((q) => q.includes("WHERE symbol = 'EDIBLE_OIL_GOI'"))).toBe(true);
      expect(executedSql.some((q) => q.includes("WHERE symbol = 'NAPHTHA_EIA'"))).toBe(true);

      const entry = ledgerRows.get('027_reconcile_commodity_symbols_metadata.js');
      expect(entry.status).toBe(ledger.STATUSES.APPLIED);
      expect(entry.error_message).toBeNull();
      expect(mockConn.release).toHaveBeenCalledTimes(1);
      expect(mockPool.end).toHaveBeenCalledTimes(1);

      // Second run against same recorded APPLIED ledger refuses duplicate execution cleanly
      const m27 = require('../src/migrations/027_reconcile_commodity_symbols_metadata');
      const upSpy = jest.spyOn(m27, 'up');

      await expect(
        executeTargetedMigration({
          target: '027_reconcile_commodity_symbols_metadata.js',
          envConfig,
          rawEnv,
          pool: mockPool,
          logger,
        })
      ).rejects.toThrow(/Refusing duplicate execution/);

      expect(upSpy).not.toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalledTimes(2);
      expect(mockPool.end).toHaveBeenCalledTimes(2);
    });

    test('applies migration 026 and legacy SQL string migration 001 via pinned session', async () => {
      const { envConfig, rawEnv } = buildLocalEnv();

      // 026 function-style up(pool)
      const db026 = createMockDb({
        onAppQuery: (sql) => {
          if (sql.includes('information_schema.COLUMNS')) {
            return [[{ DATA_TYPE: 'tinyint' }]];
          }
          return [{}];
        },
      });
      const res026 = await executeTargetedMigration({
        target: '026',
        envConfig,
        rawEnv,
        pool: db026.mockPool,
        logger: buildMockLogger(),
      });
      expect(res026.migration).toBe('026_widen_alert_rule_cooldown_hours.js');
      expect(
        db026.executedSql.some((q) => q.includes('MODIFY COLUMN cooldown_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24'))
      ).toBe(true);
      expect(db026.ledgerRows.get('026_widen_alert_rule_cooldown_hours.js').status).toBe('APPLIED');

      // 001 string-SQL up
      const db001 = createMockDb();
      const res001 = await executeTargetedMigration({
        target: '001_create_users_table.js',
        envConfig,
        rawEnv,
        pool: db001.mockPool,
        logger: buildMockLogger(),
      });
      expect(res001.migration).toBe('001_create_users_table.js');
      expect(db001.executedSql.some((q) => q.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
      expect(db001.ledgerRows.get('001_create_users_table.js').status).toBe('APPLIED');
    });
  });

  describe('3. Failure recording, partial DDL warning, & retry guardrails', () => {
    test('records FAILED (never APPLIED) with partial-DDL warning, refuses auto-retry, and allows explicit --retry-failed', async () => {
      const { envConfig, rawEnv } = buildLocalEnv({ DB_PASSWORD: 'TopSecretPassword' });
      const logger = buildMockLogger();
      const db = createMockDb();

      const failingModule = {
        up: jest.fn().mockRejectedValue(new Error('Lock wait timeout exceeded password=TopSecretPassword')),
      };

      await expect(
        executeTargetedMigration({
          target: '027',
          envConfig,
          rawEnv,
          pool: db.mockPool,
          migrationModule: failingModule,
          logger,
        })
      ).rejects.toThrow(/Lock wait timeout exceeded/);

      const failedRow = db.ledgerRows.get('027_reconcile_commodity_symbols_metadata.js');
      expect(failedRow.status).toBe(ledger.STATUSES.FAILED);
      expect(failedRow.applied_at).toBeNull();
      expect(failedRow.error_message).toContain(ledger.PARTIAL_DDL_WARNING_PREFIX);
      expect(failedRow.error_message).not.toContain('TopSecretPassword');
      expect(logger.error.mock.calls.flat().join('\n')).toContain('partial schema changes may exist');
      expect(db.mockConn.release).toHaveBeenCalledTimes(1);
      expect(db.mockPool.end).toHaveBeenCalledTimes(1);

      // Re-running without --retry-failed MUST refuse automatic retry
      const retrySpy = { up: jest.fn().mockResolvedValue(undefined) };
      await expect(
        executeTargetedMigration({
          target: '027',
          envConfig,
          rawEnv,
          pool: db.mockPool,
          migrationModule: retrySpy,
          logger,
        })
      ).rejects.toThrow(/Refusing automatic retry/);
      expect(retrySpy.up).not.toHaveBeenCalled();

      // Re-running WITH explicit --retry-failed executes cleanly and transitions FAILED -> APPLIED
      const retryResult = await executeTargetedMigration({
        target: '027',
        retryFailed: true,
        envConfig,
        rawEnv,
        pool: db.mockPool,
        migrationModule: retrySpy,
        logger,
      });
      expect(retrySpy.up).toHaveBeenCalledTimes(1);
      expect(retryResult.status).toBe(ledger.STATUSES.APPLIED);
      expect(db.ledgerRows.get('027_reconcile_commodity_symbols_metadata.js').status).toBe(ledger.STATUSES.APPLIED);
      expect(db.ledgerRows.get('027_reconcile_commodity_symbols_metadata.js').error_message).toBeNull();
    });

    test('refuses execution when ledger entry is RUNNING and rejects DB identity mismatch', async () => {
      const { envConfig, rawEnv } = buildLocalEnv();
      const targetFile = '027_reconcile_commodity_symbols_metadata.js';
      const checksum = ledger.computeMigrationChecksum(
        path.join(ledger.DEFAULT_MIGRATIONS_DIR, targetFile)
      );

      const runningDb = createMockDb({
        ledgerInitiallyExists: true,
        initialLedgerRows: [
          {
            id: 1,
            migration_name: targetFile,
            checksum,
            status: ledger.STATUSES.RUNNING,
            started_at: '2026-11-11 09:50:00',
            applied_at: null,
          },
        ],
      });

      const spyUp = { up: jest.fn() };
      await expect(
        executeTargetedMigration({
          target: '027',
          retryFailed: true,
          envConfig,
          rawEnv,
          pool: runningDb.mockPool,
          migrationModule: spyUp,
          logger: buildMockLogger(),
        })
      ).rejects.toThrow(/status RUNNING/);
      expect(spyUp.up).not.toHaveBeenCalled();

      const wrongDb = createMockDb({ dbName: 'production_wrong_db' });
      await expect(
        executeTargetedMigration({
          target: '027',
          envConfig,
          rawEnv,
          pool: wrongDb.mockPool,
          migrationModule: spyUp,
          logger: buildMockLogger(),
        })
      ).rejects.toThrow(/Database identity mismatch/);
      expect(wrongDb.mockConn.release).toHaveBeenCalledTimes(1);
      expect(wrongDb.mockPool.end).toHaveBeenCalledTimes(1);
    });

    test('fails non-zero without masking primary error even if ledger FAILED write also throws', async () => {
      const { envConfig, rawEnv } = buildLocalEnv();
      const logger = buildMockLogger();

      const brokenConn = {
        query: jest.fn(async (sql) => {
          const s = String(sql).replace(/\s+/g, ' ').trim();
          if (s.startsWith('SELECT DATABASE()')) return [[{ db: 'bmm_migration_verify_test', version: '8.0.40' }]];
          if (s.includes('INSERT INTO schema_migrations') && s.includes("'FAILED'")) {
            throw new Error('Lost connection to MySQL server');
          }
          return [{}];
        }),
        release: jest.fn(),
      };
      const brokenPool = {
        getConnection: jest.fn().mockResolvedValue(brokenConn),
        query: jest.fn().mockRejectedValue(new Error('Pool also disconnected')),
        end: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        executeTargetedMigration({
          target: '027',
          envConfig,
          rawEnv,
          pool: brokenPool,
          migrationModule: { up: jest.fn().mockRejectedValue(new Error('Primary DDL syntax error')) },
          logger,
        })
      ).rejects.toThrow(/Primary DDL syntax error/);

      expect(logger.error.mock.calls.flat().join('\n')).toContain('Could not record FAILED ledger entry');
      expect(brokenConn.release).toHaveBeenCalledTimes(1);
      expect(brokenPool.end).toHaveBeenCalledTimes(1);
    });
  });

  describe('4. Status, Baseline, & CLI main() behavior', () => {
    test('runStatus reports PENDING without creating schema_migrations when absent, and reports recorded rows when present', async () => {
      const { envConfig, rawEnv } = buildLocalEnv();

      const freshDb = createMockDb({ ledgerInitiallyExists: false });
      const freshStatus = await runStatus({
        envConfig,
        rawEnv,
        pool: freshDb.mockPool,
        logger: buildMockLogger(),
      });
      expect(freshStatus.ledgerExists).toBe(false);
      expect(freshDb.getLedgerExists()).toBe(false);
      expect(freshStatus.migrations.some((m) => m.migrationName === '027_reconcile_commodity_symbols_metadata.js' && m.status === 'PENDING')).toBe(true);

      const seededDb = createMockDb({
        ledgerInitiallyExists: true,
        initialLedgerRows: [
          {
            id: 1,
            migration_name: '026_widen_alert_rule_cooldown_hours.js',
            checksum: 'c'.repeat(64),
            status: 'APPLIED',
            applied_at: '2026-11-11 08:00:00',
            error_message: null,
          },
        ],
      });
      const seededStatus = await runStatus({
        envConfig,
        rawEnv,
        pool: seededDb.mockPool,
        logger: buildMockLogger(),
      });
      expect(seededStatus.ledgerExists).toBe(true);
      expect(seededStatus.migrations.find((m) => m.migrationName === '026_widen_alert_rule_cooldown_hours.js').status).toBe('APPLIED');
      expect(seededStatus.migrations.find((m) => m.migrationName === '027_reconcile_commodity_symbols_metadata.js').status).toBe('PENDING');
    });

    test('main() rejects unknown migrations before loading connection.js and logs baseline checksum warnings cleanly', async () => {
      const savedExitCode = process.exitCode;
      const errLogger = buildMockLogger();

      try {
        const untouchedPool = { getConnection: jest.fn(), end: jest.fn() };
        await main(['--target=999_nonexistent.js'], {
          envConfig: buildLocalEnv().envConfig,
          rawEnv: buildLocalEnv().rawEnv,
          pool: untouchedPool,
          logger: errLogger,
        });
        expect(process.exitCode).toBe(1);
        expect(untouchedPool.getConnection).not.toHaveBeenCalled();

        // runBaseline propagates checksum mismatch warning without crashing
        const baselineSpy = jest.spyOn(ledger, 'baselineMigrations').mockResolvedValueOnce({
          upTo: '026_widen_alert_rule_cooldown_hours.js',
          checkedMigrations: 26,
          checksPerformed: 120,
          recorded: ['026_widen_alert_rule_cooldown_hours.js'],
          skippedAlreadyApplied: [{ migrationName: '025_add_default_external_symbol_to_raw_materials.js', checksumChanged: true }],
        });
        const baselineDb = createMockDb();
        const baselineResult = await runBaseline({
          upTo: '026',
          ...buildLocalEnv(),
          pool: baselineDb.mockPool,
          logger: errLogger,
        });
        expect(baselineSpy).toHaveBeenCalledTimes(1);
        expect(baselineResult.recorded).toEqual(['026_widen_alert_rule_cooldown_hours.js']);
        expect(errLogger.error.mock.calls.flat().join('\n')).toContain('checksum mismatch');

        // Unmocked runBaseline fails when target DB schema misses required columns/indexes (zero APPLIED rows written)
        const incompleteSchemaDb = createMockDb({
          onAppQuery: (sql) => {
            if (sql.includes('FROM information_schema.COLUMNS')) {
              return [[{ TABLE_NAME: 'users', COLUMN_NAME: 'id', DATA_TYPE: 'bigint', COLUMN_TYPE: 'bigint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null }]];
            }
            if (sql.includes('FROM information_schema.STATISTICS')) {
              return [[]];
            }
            return [{}];
          },
        });
        await expect(
          runBaseline({
            upTo: '001',
            ...buildLocalEnv(),
            pool: incompleteSchemaDb.mockPool,
            logger: buildMockLogger(),
          })
        ).rejects.toThrow(/Baseline schema validation failed/);
        expect(incompleteSchemaDb.ledgerRows.size).toBe(0);
        expect(incompleteSchemaDb.mockConn.release).toHaveBeenCalledTimes(1);
        expect(incompleteSchemaDb.mockPool.end).toHaveBeenCalledTimes(1);
      } finally {
        process.exitCode = savedExitCode;
      }
    });
  });
});

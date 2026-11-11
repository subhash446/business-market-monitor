/**
 * Focused unit tests for backend/scripts/apply_026_cooldown_widening.js.
 *
 * Covers:
 *   1. Valid target migration selection & exact invocation of migration 026 up(pool)
 *   2. Invalid target & path traversal rejection (allowlist enforcement)
 *   3. Fail-fast DB env & production TLS validation + secret log hygiene
 *   4. Connected DB identity, missing table/column, and unexpected pre-type rejection
 *   5. Post-verification failure assertions (tinyint, signed, nullable, wrong default)
 *   6. Guaranteed connection release & pool.end() cleanup on both success and errors
 *   7. CLI entrypoint (`main`) wiring with project env.js and database/connection.js mocks
 *
 * All database connections and filesystem cert checks are mocked.
 * No real MySQL connection is ever opened and no migration SQL is executed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  TARGET_MIGRATION_FILE,
  parseTargetArg,
  resolveTargetMigration,
  validateRunnerConfig,
  runTargetedMigration,
} = require('../scripts/apply_026_cooldown_widening');

function buildValidEnv(overrides = {}) {
  const rawEnv = {
    DB_HOST: 'mysql-prod.example.aivencloud.com',
    DB_PORT: '25000',
    DB_NAME: 'defaultdb',
    DB_USER: 'avnadmin',
    DB_PASSWORD: 'super-secret-prod-password-999',
    DB_SSL_ENABLED: 'true',
    DB_SSL_REJECT_UNAUTHORIZED: 'true',
    DB_SSL_CA_PATH: './certs/ca.pem',
    ...overrides,
  };

  const envConfig = {
    db: {
      host: rawEnv.DB_HOST,
      port: Number(rawEnv.DB_PORT || 3306),
      name: rawEnv.DB_NAME,
      user: rawEnv.DB_USER,
      password: rawEnv.DB_PASSWORD,
      sslEnabled: String(rawEnv.DB_SSL_ENABLED).toLowerCase() === 'true',
      sslRejectUnauthorized: String(rawEnv.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() === 'true',
      sslCaPath: rawEnv.DB_SSL_CA_PATH,
    },
  };

  return { rawEnv, envConfig };
}

function buildMockFs({ readable = true, caContent = '-----BEGIN CERTIFICATE-----\nSECRET_CA_BODY\n-----END CERTIFICATE-----' } = {}) {
  return {
    constants: fs.constants,
    accessSync: jest.fn(() => {
      if (!readable) {
        const err = new Error('ENOENT: no such file or directory');
        err.code = 'ENOENT';
        throw err;
      }
    }),
    statSync: jest.fn(() => ({
      isFile: () => true,
      size: caContent.length,
    })),
    readFileSync: jest.fn(() => caContent),
  };
}

function buildMockLogger() {
  return {
    log: jest.fn(),
    error: jest.fn(),
  };
}

describe('Dedicated Targeted Migration Runner (apply_026_cooldown_widening.js)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Target selection & strict allowlist', () => {
    test('defaults cleanly to 026_widen_alert_rule_cooldown_hours.js and accepts explicit exact target', () => {
      expect(parseTargetArg([])).toBe(TARGET_MIGRATION_FILE);
      expect(parseTargetArg([TARGET_MIGRATION_FILE])).toBe(TARGET_MIGRATION_FILE);
      expect(parseTargetArg([`--target=${TARGET_MIGRATION_FILE}`])).toBe(TARGET_MIGRATION_FILE);
      expect(parseTargetArg(['--target', TARGET_MIGRATION_FILE])).toBe(TARGET_MIGRATION_FILE);

      const resolved = resolveTargetMigration(TARGET_MIGRATION_FILE);
      expect(resolved.filename).toBe(TARGET_MIGRATION_FILE);
      expect(path.basename(resolved.modulePath)).toBe(TARGET_MIGRATION_FILE);
    });

    test('rejects arbitrary migration filenames, prototype keys, path traversal, and invalid CLI flags', () => {
      const rejectedTargets = [
        '020_create_ai_insights_table.js',
        '023_add_alert_rule_enhancements.js',
        '001_create_users_table.js',
        '../src/migrations/026_widen_alert_rule_cooldown_hours.js',
        '..\\src\\migrations\\026_widen_alert_rule_cooldown_hours.js',
        './026_widen_alert_rule_cooldown_hours.js',
        'migrations/026_widen_alert_rule_cooldown_hours.js',
        `${TARGET_MIGRATION_FILE}\0.js`,
        '__proto__',
        'constructor',
        'toString',
        '',
        '   ',
        ` ${TARGET_MIGRATION_FILE} `,
      ];

      for (const badTarget of rejectedTargets) {
        expect(() => resolveTargetMigration(badTarget)).toThrow();
      }

      expect(() => parseTargetArg(['--all'])).toThrow(/Unsupported option/);
      expect(() => parseTargetArg(['--target='])).toThrow(/cannot be empty/);
      expect(() => parseTargetArg(['--target', ''])).toThrow(/cannot be empty/);
      expect(() => parseTargetArg(['a.js', 'b.js'])).toThrow(/Unexpected CLI arguments/);
    });

    test('executes only 026 up(pool) with lock_wait_timeout, pre/post checks, and releases/closes pool', async () => {
      const { rawEnv, envConfig } = buildValidEnv();
      const mockFs = buildMockFs();
      const mockLogger = buildMockLogger();

      let columnState = {
        DATA_TYPE: 'tinyint',
        COLUMN_TYPE: 'tinyint unsigned',
        IS_NULLABLE: 'NO',
        COLUMN_DEFAULT: '24',
      };
      const executedQueries = [];

      const mockConn = {
        query: jest.fn(async (sql) => {
          const normalized = String(sql).replace(/\s+/g, ' ').trim();
          executedQueries.push(normalized);

          if (normalized.startsWith('SELECT DATABASE()')) {
            return [[{ db: 'defaultdb', version: '8.0.35' }]];
          }
          if (normalized.includes('FROM information_schema.TABLES')) {
            return [[{ TABLE_NAME: 'alert_rules' }]];
          }
          if (normalized.includes('FROM information_schema.COLUMNS')) {
            return [[{ ...columnState }]];
          }
          if (normalized.startsWith('SET SESSION lock_wait_timeout')) {
            return [{}];
          }
          if (normalized.includes('ALTER TABLE alert_rules') && normalized.includes('SMALLINT UNSIGNED NOT NULL DEFAULT 24')) {
            columnState = {
              DATA_TYPE: 'smallint',
              COLUMN_TYPE: 'smallint unsigned',
              IS_NULLABLE: 'NO',
              COLUMN_DEFAULT: '24',
            };
            return [{}];
          }
          throw new Error(`Unexpected SQL statement: ${normalized}`);
        }),
        release: jest.fn(),
      };

      const mockPool = {
        getConnection: jest.fn().mockResolvedValue(mockConn),
        end: jest.fn().mockResolvedValue(undefined),
      };

      const migration026 = require('../src/migrations/026_widen_alert_rule_cooldown_hours');
      const upSpy = jest.spyOn(migration026, 'up');

      const result = await runTargetedMigration({
        target: TARGET_MIGRATION_FILE,
        envConfig,
        rawEnv,
        fsModule: mockFs,
        pool: mockPool,
        logger: mockLogger,
      });

      expect(result).toEqual({
        migration: TARGET_MIGRATION_FILE,
        database: 'defaultdb',
        mysqlVersion: '8.0.35',
        verified: {
          dataType: 'smallint',
          columnType: 'smallint unsigned',
          isNullable: 'NO',
          columnDefault: '24',
        },
      });

      expect(upSpy).toHaveBeenCalledTimes(1);
      expect(upSpy).toHaveBeenCalledWith(mockConn);
      expect(executedQueries).toContain('SET SESSION lock_wait_timeout = 30');
      expect(
        executedQueries.some((q) => q.includes('MODIFY COLUMN cooldown_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24'))
      ).toBe(true);
      expect(mockConn.release).toHaveBeenCalledTimes(1);
      expect(mockPool.end).toHaveBeenCalledTimes(1);

      const allLogText = mockLogger.log.mock.calls.flat().join('\n');
      expect(allLogText).not.toContain(rawEnv.DB_PASSWORD);
      expect(allLogText).not.toContain('SECRET_CA_BODY');
    });
  });

  describe('2. Fail-fast DB environment & strict TLS validation', () => {
    test('validateRunnerConfig returns sanitized metadata and rejects empty or non-file CA paths', () => {
      const { rawEnv, envConfig } = buildValidEnv();
      const summary = validateRunnerConfig({ envConfig, rawEnv, fsModule: buildMockFs() });
      expect(summary).toEqual({
        host: rawEnv.DB_HOST,
        port: 25000,
        database: rawEnv.DB_NAME,
        user: rawEnv.DB_USER,
        caFilename: 'ca.pem',
      });
      expect(JSON.stringify(summary)).not.toContain(rawEnv.DB_PASSWORD);

      const nonFileFs = buildMockFs();
      nonFileFs.statSync = jest.fn(() => ({ isFile: () => false, size: 64 }));
      expect(() =>
        validateRunnerConfig({ envConfig, rawEnv, fsModule: nonFileFs })
      ).toThrow(/DB_SSL_CA_PATH is not readable/);

      const emptyFileFs = buildMockFs({ caContent: '   \n  ' });
      expect(() =>
        validateRunnerConfig({ envConfig, rawEnv, fsModule: emptyFileFs })
      ).toThrow(/DB_SSL_CA_PATH is not readable/);
    });

    test('rejects missing/blank DB vars and unsafe TLS settings before touching pool', async () => {
      const badCases = [
        { DB_HOST: '' },
        { DB_HOST: undefined },
        { DB_NAME: '   ' },
        { DB_USER: '' },
        { DB_PASSWORD: '' },
        { DB_PASSWORD: undefined },
        { DB_PORT: 'not-a-port' },
        { DB_SSL_ENABLED: 'false' },
        { DB_SSL_REJECT_UNAUTHORIZED: 'false' },
        { DB_SSL_REJECT_UNAUTHORIZED: '' },
        { DB_SSL_CA_PATH: '' },
      ];

      const mockPool = {
        getConnection: jest.fn(),
        end: jest.fn(),
      };

      for (const override of badCases) {
        const { rawEnv, envConfig } = buildValidEnv(override);
        await expect(
          runTargetedMigration({
            envConfig,
            rawEnv,
            fsModule: buildMockFs(),
            pool: mockPool,
            logger: buildMockLogger(),
          })
        ).rejects.toThrow(/missing or invalid production DB\/TLS configuration/);
      }

      const { rawEnv, envConfig } = buildValidEnv();
      await expect(
        runTargetedMigration({
          envConfig,
          rawEnv,
          fsModule: buildMockFs({ readable: false }),
          pool: mockPool,
          logger: buildMockLogger(),
        })
      ).rejects.toThrow(/DB_SSL_CA_PATH is not readable/);

      expect(mockPool.getConnection).not.toHaveBeenCalled();
      expect(mockPool.end).not.toHaveBeenCalled();
    });
  });

  describe('3. Pre-checks, post-verification & pool cleanup on errors', () => {
    test('rejects missing pre-migration cooldown_hours column and cleans up connection & pool', async () => {
      const { rawEnv, envConfig } = buildValidEnv();
      const mockLogger = buildMockLogger();
      const migrationSpy = { up: jest.fn() };

      const mockConn = {
        query: jest.fn(async (sql) => {
          if (sql.includes('SELECT DATABASE()')) {
            return [[{ db: 'defaultdb', version: '8.0.35' }]];
          }
          if (sql.includes('information_schema.TABLES')) {
            return [[{ TABLE_NAME: 'alert_rules' }]];
          }
          if (sql.includes('information_schema.COLUMNS')) {
            return [[]]; // Missing cooldown_hours (e.g. migration 023 not applied)
          }
          return [{}];
        }),
        release: jest.fn(),
      };

      const mockPool = {
        getConnection: jest.fn().mockResolvedValue(mockConn),
        end: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        runTargetedMigration({
          envConfig,
          rawEnv,
          fsModule: buildMockFs(),
          pool: mockPool,
          migrationModule: migrationSpy,
          logger: mockLogger,
        })
      ).rejects.toThrow(/cooldown_hours" does not exist/);

      expect(migrationSpy.up).not.toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalledTimes(1);
      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    test('rejects unexpected pre-migration column types or connected database mismatch', async () => {
      const { rawEnv, envConfig } = buildValidEnv();

      // A. Connected DB mismatch
      const mismatchPool = {
        query: jest.fn(async () => [[{ db: 'wrong_database', version: '8.0.35' }]]),
        end: jest.fn().mockResolvedValue(undefined),
      };
      await expect(
        runTargetedMigration({
          envConfig,
          rawEnv,
          fsModule: buildMockFs(),
          pool: mismatchPool,
          migrationModule: { up: jest.fn() },
          logger: buildMockLogger(),
        })
      ).rejects.toThrow(/Database identity mismatch/);
      expect(mismatchPool.end).toHaveBeenCalledTimes(1);

      // B. Missing alert_rules table
      const missingTablePool = {
        query: jest.fn(async (sql) => {
          if (sql.includes('SELECT DATABASE()')) return [[{ db: 'defaultdb', version: '8.0.35' }]];
          if (sql.includes('information_schema.TABLES')) return [[]];
          return [{}];
        }),
        end: jest.fn().mockResolvedValue(undefined),
      };
      await expect(
        runTargetedMigration({
          envConfig,
          rawEnv,
          fsModule: buildMockFs(),
          pool: missingTablePool,
          migrationModule: { up: jest.fn() },
          logger: buildMockLogger(),
        })
      ).rejects.toThrow(/table "alert_rules" does not exist/);
      expect(missingTablePool.end).toHaveBeenCalledTimes(1);

      // C. Unexpected signed tinyint or wrong data type
      const wrongTypePool = {
        query: jest.fn(async (sql) => {
          if (sql.includes('SELECT DATABASE()')) return [[{ db: 'defaultdb', version: '8.0.35' }]];
          if (sql.includes('information_schema.TABLES')) return [[{ TABLE_NAME: 'alert_rules' }]];
          if (sql.includes('information_schema.COLUMNS')) {
            return [[{ DATA_TYPE: 'varchar', COLUMN_TYPE: 'varchar(10)', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '24' }]];
          }
          return [{}];
        }),
        end: jest.fn().mockResolvedValue(undefined),
      };
      await expect(
        runTargetedMigration({
          envConfig,
          rawEnv,
          fsModule: buildMockFs(),
          pool: wrongTypePool,
          migrationModule: { up: jest.fn() },
          logger: buildMockLogger(),
        })
      ).rejects.toThrow(/unexpected DATA_TYPE "varchar"/);
      expect(wrongTypePool.end).toHaveBeenCalledTimes(1);
    });

    test('fails non-zero when post-verification schema checks fail and closes pool', async () => {
      const { rawEnv, envConfig } = buildValidEnv();

      const badPostCases = [
        { DATA_TYPE: 'tinyint', COLUMN_TYPE: 'tinyint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '24' },
        { DATA_TYPE: 'smallint', COLUMN_TYPE: 'smallint', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '24' },
        { DATA_TYPE: 'smallint', COLUMN_TYPE: 'smallint unsigned', IS_NULLABLE: 'YES', COLUMN_DEFAULT: '24' },
        { DATA_TYPE: 'smallint', COLUMN_TYPE: 'smallint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '12' },
      ];

      for (const badPost of badPostCases) {
        let colChecks = 0;
        const mockConn = {
          query: jest.fn(async (sql) => {
            if (sql.includes('SELECT DATABASE()')) return [[{ db: 'defaultdb', version: '8.0.35' }]];
            if (sql.includes('information_schema.TABLES')) return [[{ TABLE_NAME: 'alert_rules' }]];
            if (sql.includes('information_schema.COLUMNS')) {
              colChecks += 1;
              if (colChecks === 1) {
                return [[{ DATA_TYPE: 'tinyint', COLUMN_TYPE: 'tinyint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '24' }]];
              }
              return [[badPost]];
            }
            return [{}];
          }),
          release: jest.fn(),
        };
        const mockPool = {
          getConnection: jest.fn().mockResolvedValue(mockConn),
          end: jest.fn().mockResolvedValue(undefined),
        };

        await expect(
          runTargetedMigration({
            envConfig,
            rawEnv,
            fsModule: buildMockFs(),
            pool: mockPool,
            migrationModule: { up: jest.fn().mockResolvedValue(undefined) },
            logger: buildMockLogger(),
          })
        ).rejects.toThrow(/Post-verification failed/);

        expect(mockConn.release).toHaveBeenCalledTimes(1);
        expect(mockPool.end).toHaveBeenCalledTimes(1);
      }
    });

    test('preserves primary migration error and ensures pool cleanup if up() throws and pool.end() also errors', async () => {
      const { rawEnv, envConfig } = buildValidEnv();
      const mockLogger = buildMockLogger();

      const mockConn = {
        query: jest.fn(async (sql) => {
          if (sql.includes('SELECT DATABASE()')) return [[{ db: 'defaultdb', version: '8.0.35' }]];
          if (sql.includes('information_schema.TABLES')) return [[{ TABLE_NAME: 'alert_rules' }]];
          if (sql.includes('information_schema.COLUMNS')) {
            return [[{ DATA_TYPE: 'tinyint', COLUMN_TYPE: 'tinyint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: '24' }]];
          }
          return [{}];
        }),
        release: jest.fn(),
      };
      const mockPool = {
        getConnection: jest.fn().mockResolvedValue(mockConn),
        end: jest.fn().mockRejectedValue(new Error('socket already closed')),
      };

      await expect(
        runTargetedMigration({
          envConfig,
          rawEnv,
          fsModule: buildMockFs(),
          pool: mockPool,
          migrationModule: {
            up: jest.fn().mockRejectedValue(new Error('Lock wait timeout exceeded; try restarting transaction')),
          },
          logger: mockLogger,
        })
      ).rejects.toThrow(/Lock wait timeout exceeded/);

      expect(mockConn.release).toHaveBeenCalledTimes(1);
      expect(mockPool.end).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error closing database pool'));
    });
  });

  describe('4. CLI main() wiring via project env & connection conventions', () => {
    test('main() rejects invalid CLI target with exitCode=1 without requiring connection.js, and succeeds cleanly when valid', async () => {
      const savedEnv = { ...process.env };
      const savedExitCode = process.exitCode;
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      try {
        // 1. Invalid CLI target stops before creating DB pool
        await new Promise((resolve, reject) => {
          jest.isolateModules(() => {
            const badConnPool = { getConnection: jest.fn(), end: jest.fn() };
            jest.doMock('../src/database/connection', () => ({ pool: badConnPool }));
            const { main } = require('../scripts/apply_026_cooldown_widening');
            main(['--target=020_create_ai_insights_table.js'])
              .then(() => {
                expect(process.exitCode).toBe(1);
                expect(badConnPool.getConnection).not.toHaveBeenCalled();
                expect(badConnPool.end).not.toHaveBeenCalled();
                resolve();
              })
              .catch(reject);
          });
        });

        // 2. Valid production env + mocked project env/connection closes pool cleanly and sets exitCode=0
        const caAbsPath = path.resolve(__dirname, '../certs/ca.pem');
        const accessSpy = jest.spyOn(fs, 'accessSync').mockImplementation(() => {});
        const statSpy = jest.spyOn(fs, 'statSync').mockImplementation(() => ({ isFile: () => true, size: 64 }));
        const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => '-----BEGIN CERTIFICATE-----\nCERT\n-----END CERTIFICATE-----');

        const { rawEnv, envConfig } = buildValidEnv({ DB_SSL_CA_PATH: caAbsPath });
        Object.assign(process.env, rawEnv);

        await new Promise((resolve, reject) => {
          jest.isolateModules(() => {
            let phase = 'pre';
            const cliPool = {
              query: jest.fn(async (sql) => {
                if (sql.includes('SELECT DATABASE()')) return [[{ db: 'defaultdb', version: '8.0.35' }]];
                if (sql.includes('information_schema.TABLES')) return [[{ TABLE_NAME: 'alert_rules' }]];
                if (sql.includes('information_schema.COLUMNS')) {
                  return [[{
                    DATA_TYPE: phase === 'pre' ? 'tinyint' : 'smallint',
                    COLUMN_TYPE: phase === 'pre' ? 'tinyint unsigned' : 'smallint unsigned',
                    IS_NULLABLE: 'NO',
                    COLUMN_DEFAULT: '24',
                  }]];
                }
                if (sql.includes('MODIFY COLUMN cooldown_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24')) {
                  phase = 'post';
                }
                return [{}];
              }),
              end: jest.fn().mockResolvedValue(undefined),
            };

            jest.doMock('../src/config/env', () => envConfig);
            jest.doMock('../src/database/connection', () => ({ pool: cliPool }));

            const { main } = require('../scripts/apply_026_cooldown_widening');
            main([])
              .then(() => {
                expect(process.exitCode).toBe(0);
                expect(cliPool.end).toHaveBeenCalledTimes(1);
                expect(accessSpy).toHaveBeenCalled();
                expect(statSpy).toHaveBeenCalled();
                expect(readSpy).toHaveBeenCalled();
                resolve();
              })
              .catch(reject);
          });
        });

        const logs = [...consoleLogSpy.mock.calls, ...consoleErrorSpy.mock.calls].flat().join('\n');
        expect(logs).not.toContain(rawEnv.DB_PASSWORD);
      } finally {
        process.env = savedEnv;
        process.exitCode = savedExitCode;
      }
    });
  });
});

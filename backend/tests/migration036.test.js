'use strict';

/**
 * Unit & Idempotency tests for Migration 036 (Google OAuth & Email OTP Verification).
 */

const migration036 = require('../src/migrations/036_add_google_oauth_and_email_otp');
const { BASELINE_SCHEMA_SPECS } = require('../src/database/migrationLedger');

describe('Migration 036 — Google OAuth 2.0 & Email OTP Schema', () => {
  let mockPool;
  let executedQueries;

  beforeEach(() => {
    executedQueries = [];
    mockPool = {
      query: jest.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('information_schema.COLUMNS') && sql.includes('password_hash')) {
          return [[{ IS_NULLABLE: 'NO' }]];
        }
        if (sql.includes('information_schema.COLUMNS')) {
          return [[{ cnt: 0 }]];
        }
        if (sql.includes('information_schema.TABLES')) {
          return [[{ cnt: 0 }]];
        }
        return [[]];
      }),
    };
  });

  test('up(pool) modifies users.password_hash to nullable, adds columns, backfills, and creates email_verification_otps table', async () => {
    await migration036.up(mockPool);

    // 1. users.password_hash nullable
    const modifyPwd = executedQueries.filter((q) => q.sql.includes('ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL'));
    expect(modifyPwd).toHaveLength(1);

    // 2. Added columns
    const addAuthProvider = executedQueries.filter((q) => q.sql.includes("auth_provider ENUM('LOCAL', 'GOOGLE', 'EMAIL_OTP')"));
    expect(addAuthProvider).toHaveLength(1);

    const addGoogleSub = executedQueries.filter((q) => q.sql.includes('google_sub VARCHAR(128) NULL UNIQUE'));
    expect(addGoogleSub).toHaveLength(1);

    const addEmailVerified = executedQueries.filter((q) => q.sql.includes('email_verified TINYINT(1) NOT NULL DEFAULT 0'));
    expect(addEmailVerified).toHaveLength(1);

    // 3. Zero-breakage backfill
    const backfill = executedQueries.filter((q) => q.sql.includes('UPDATE users SET email_verified = 1 WHERE email_verified = 0'));
    expect(backfill).toHaveLength(1);

    // 4. email_verification_otps table
    const createOtpTable = executedQueries.filter((q) => q.sql.includes('CREATE TABLE email_verification_otps'));
    expect(createOtpTable).toHaveLength(1);
    expect(createOtpTable[0].sql).toContain('purpose ENUM');
    expect(createOtpTable[0].sql).toContain('otp_hash VARCHAR(64) NOT NULL');
    expect(createOtpTable[0].sql).toContain('idx_evo_email_purpose_created');
  });

  test('up(pool) skips column and table creation idempotently when already applied', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.COLUMNS') && sql.includes('password_hash')) {
        return [[{ IS_NULLABLE: 'YES' }]]; // Already nullable
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]]; // Columns already exist
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]]; // Table already exists
      }
      return [[]];
    });

    await migration036.up(mockPool);

    const modifyPwd = executedQueries.filter((q) => q.sql.includes('ALTER TABLE users MODIFY COLUMN password_hash'));
    expect(modifyPwd).toHaveLength(0);

    const addCol = executedQueries.filter((q) => q.sql.includes('ALTER TABLE users ADD COLUMN'));
    expect(addCol).toHaveLength(0);

    const createOtpTable = executedQueries.filter((q) => q.sql.includes('CREATE TABLE email_verification_otps'));
    expect(createOtpTable).toHaveLength(0);
  });

  test('down(pool) drops email_verification_otps table, drops added columns, and restores password_hash', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.COLUMNS') && sql.includes('password_hash')) {
        return [[{ IS_NULLABLE: 'YES' }]];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 1 }]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]];
      }
      return [[]];
    });

    await migration036.down(mockPool);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS email_verification_otps'));
    expect(dropTable).toHaveLength(1);

    const dropCols = executedQueries.filter((q) => q.sql.includes('ALTER TABLE users DROP COLUMN'));
    expect(dropCols).toHaveLength(3);

    const restorePwd = executedQueries.filter((q) => q.sql.includes('ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NOT NULL'));
    expect(restorePwd).toHaveLength(1);
  });

  test('down(pool) skips drop operations idempotently when already absent', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.COLUMNS') && sql.includes('password_hash')) {
        return [[{ IS_NULLABLE: 'NO' }]];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[{ cnt: 0 }]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 0 }]];
      }
      return [[]];
    });

    await migration036.down(mockPool);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS email_verification_otps'));
    expect(dropTable).toHaveLength(0);

    const dropCols = executedQueries.filter((q) => q.sql.includes('ALTER TABLE users DROP COLUMN'));
    expect(dropCols).toHaveLength(0);
  });

  test('migrationLedger.js defines BASELINE_SCHEMA_SPECS entry for 036', () => {
    const spec = BASELINE_SCHEMA_SPECS['036_add_google_oauth_and_email_otp.js'];
    expect(spec).toBeDefined();
    expect(spec.tables.users).toBeDefined();
    expect(spec.tables.email_verification_otps).toBeDefined();

    const userCols = spec.tables.users.columns;
    expect(userCols.password_hash.isNullable).toBe('YES');
    expect(userCols.auth_provider).toBeDefined();
    expect(userCols.google_sub).toBeDefined();
    expect(userCols.email_verified).toBeDefined();

    const otpCols = spec.tables.email_verification_otps.columns;
    expect(otpCols.otp_hash).toBeDefined();
    expect(otpCols.purpose).toBeDefined();
    expect(otpCols.expires_at).toBeDefined();
  });
});

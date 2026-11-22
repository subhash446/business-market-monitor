'use strict';

/**
 * Unit & Idempotency tests for Migration 035 (V3-M5: Business Members Multi-User RBAC Table).
 */

const migration035 = require('../src/migrations/035_create_business_members_table');
const { BASELINE_SCHEMA_SPECS } = require('../src/database/migrationLedger');

describe('Migration 035 — V3-M5: Business Members Multi-User RBAC Table', () => {
  let mockPool;
  let executedQueries;

  beforeEach(() => {
    executedQueries = [];
    mockPool = {
      query: jest.fn(async (sql, params) => {
        executedQueries.push({ sql, params });
        if (sql.includes('information_schema.TABLES')) {
          return [[{ cnt: 0 }]];
        }
        return [[]];
      }),
    };
  });

  test('up(pool) creates business_members table with indexes, constraints, and backfill', async () => {
    await migration035.up(mockPool);

    const createTable = executedQueries.filter((q) => q.sql.includes('CREATE TABLE business_members'));
    expect(createTable).toHaveLength(1);
    expect(createTable[0].sql).toContain('business_id BIGINT UNSIGNED NOT NULL');
    expect(createTable[0].sql).toContain('user_id BIGINT UNSIGNED NULL DEFAULT NULL');
    expect(createTable[0].sql).toContain('invited_email VARCHAR(255) NOT NULL');
    expect(createTable[0].sql).toContain("ENUM('OWNER', 'PURCHASE_MANAGER', 'VIEWER')");
    expect(createTable[0].sql).toContain("ENUM('ACTIVE', 'INVITED', 'REVOKED')");
    expect(createTable[0].sql).toContain('invite_token_hash VARCHAR(64) NULL DEFAULT NULL');
    expect(createTable[0].sql).toContain('invite_expires_at TIMESTAMP NULL DEFAULT NULL');
    expect(createTable[0].sql).toContain('fk_bm_business');
    expect(createTable[0].sql).toContain('fk_bm_user');

    // Backfill query
    const backfill = executedQueries.filter((q) => q.sql.includes('INSERT IGNORE INTO business_members'));
    expect(backfill).toHaveLength(1);
    expect(backfill[0].sql).toContain("role, status");
    expect(backfill[0].sql).toContain("'OWNER', 'ACTIVE'");
  });

  test('up(pool) skips table creation idempotently when already applied', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]]; // Table already exists
      }
      return [[]];
    });

    await migration035.up(mockPool);

    const createTable = executedQueries.filter((q) => q.sql.includes('CREATE TABLE business_members'));
    expect(createTable).toHaveLength(0);
  });

  test('down(pool) drops business_members table cleanly', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 1 }]]; // Table exists to drop
      }
      return [[]];
    });

    await migration035.down(mockPool);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS business_members'));
    expect(dropTable).toHaveLength(1);
  });

  test('down(pool) skips drop idempotently when table is already absent', async () => {
    mockPool.query.mockImplementation(async (sql, params) => {
      executedQueries.push({ sql, params });
      if (sql.includes('information_schema.TABLES')) {
        return [[{ cnt: 0 }]]; // Table absent
      }
      return [[]];
    });

    await migration035.down(mockPool);

    const dropTable = executedQueries.filter((q) => q.sql.includes('DROP TABLE IF EXISTS business_members'));
    expect(dropTable).toHaveLength(0);
  });

  test('migrationLedger.js defines BASELINE_SCHEMA_SPECS entry for 035', () => {
    const spec = BASELINE_SCHEMA_SPECS['035_create_business_members_table.js'];
    expect(spec).toBeDefined();
    expect(spec.tables.business_members).toBeDefined();

    const cols = spec.tables.business_members.columns;
    expect(cols.business_id).toBeDefined();
    expect(cols.user_id).toBeDefined();
    expect(cols.invited_email).toBeDefined();
    expect(cols.role).toBeDefined();
    expect(cols.status).toBeDefined();
    expect(cols.invite_token_hash).toBeDefined();
    expect(cols.invite_expires_at).toBeDefined();

    const indexes = spec.tables.business_members.indexes;
    expect(indexes.uq_biz_member_active_user).toBeDefined();
    expect(indexes.uq_biz_member_active_user.unique).toBe(true);
    expect(indexes.idx_biz_member_token_hash).toBeDefined();
  });
});
